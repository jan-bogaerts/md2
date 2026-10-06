import type { ActionCompactRequest, ActionCompactState, ActionRunEvent } from '../../data/action_run_types';
import { getElectronActionBridge, type ElectronActionBridge } from '../../data/electron_action_bridge';
import { dialogService } from '../dialog_service';
import { projectAccessService } from '../project/project_access_service';
import { register } from '../service_injector';
import { remoteConnectionService } from '../data/remote_connection_service';
import { actionRunRegistry } from './action_run_registry';

const EMPTY_REQUESTS: ActionCompactState[] = [];

/** Owns compact requests independently of popup lifetime and selection. */
export class ActionCompactService extends EventTarget {
    private readonly requests = new Map<string, ActionCompactState[]>();
    private bridge: ElectronActionBridge | null = null;
    private unsubscribeBridge: (() => void) | null = null;
    private readonly handleCompactEvent = (event: Event) => this.handleEvent((event as CustomEvent<ActionRunEvent>).detail);
    private readonly handleConnectionChanged = () => {
        const { status } = remoteConnectionService.getSnapshot();
        if (status === 'disconnected' || status === 'reconnecting') {
            this.failPending('Desktop connection lost; compaction outcome is unknown');
        }
    };

    constructor() {
        super();
        register('actionCompactService', this);
    }

    connect() {
        const bridge = getElectronActionBridge();
        if (bridge === this.bridge) return;
        if (this.bridge) this.failPending('Compact backend disconnected or project changed');
        remoteConnectionService.removeEventListener('changed', this.handleConnectionChanged);
        this.unsubscribeBridge?.();
        this.bridge = bridge;
        this.unsubscribeBridge = null;
        if (bridge) {
            actionRunRegistry.addEventListener('compactRequest', this.handleCompactEvent);
            this.unsubscribeBridge = () => actionRunRegistry.removeEventListener('compactRequest', this.handleCompactEvent);
            remoteConnectionService.addEventListener('changed', this.handleConnectionChanged);
            actionRunRegistry.start();
        }
    }

    getSnapshot(conversationId: string | null) {
        return conversationId ? this.requests.get(conversationId) ?? EMPTY_REQUESTS : EMPTY_REQUESTS;
    }

    async request(request: ActionCompactRequest) {
        projectAccessService.requireWritable();
        this.connect();
        this.apply({ ...request, state: 'queued' });
        try {
            if (!this.bridge?.compactActionConversation) throw new Error('Compacting a conversation requires an available desktop backend');
            const accepted = await this.bridge.compactActionConversation(request);
            const current = this.getSnapshot(request.conversationId).find(({ requestId }) => requestId === request.requestId);
            if (current?.state === 'completed' || current?.state === 'failed') return current;
            if (current?.state === 'running' && accepted.state === 'queued') return current;
            this.apply(accepted);
            return accepted;
        } catch (error) {
            this.apply({ ...request, state: 'failed', message: error instanceof Error ? error.message : 'Compaction failed' });
        }
    }

    handleEvent(event: ActionRunEvent) {
        if (event.type === 'update' && event.update.kind === 'agentCompact') this.apply(event.update.request);
        if (event.type === 'run' && (event.status === 'failed' || event.status === 'cancelled')) {
            for (const requests of this.requests.values()) {
                for (const request of requests) {
                    if (request.runId === event.runId && (request.state === 'queued' || request.state === 'running')) {
                        this.apply({ ...request, state: 'failed', message: 'Agent stopped before compaction completed' });
                    }
                }
            }
        }
    }

    private failPending(message: string) {
        for (const requests of this.requests.values()) {
            for (const request of requests) {
                if (request.state === 'queued' || request.state === 'running') this.apply({ ...request, state: 'failed', message });
            }
        }
    }

    private apply(request: ActionCompactState) {
        const requests = this.getSnapshot(request.conversationId);
        const previous = requests.find(({ requestId }) => requestId === request.requestId);
        if (previous?.state === 'failed' || previous?.state === 'completed') return;
        if (previous?.state === 'running' && request.state === 'queued') return;
        const next = previous
            ? requests.map((entry) => entry.requestId === request.requestId ? request : entry)
            : [...requests, request];
        this.requests.set(request.conversationId, next);
        this.dispatchEvent(new Event(`compact:${request.conversationId}`));
        if (request.state === 'failed') {
            dialogService.error(new Error(request.message ?? 'Compaction failed'), { fallbackMessage: 'Compaction failed' });
        }
    }
}

export const actionCompactService = new ActionCompactService();
