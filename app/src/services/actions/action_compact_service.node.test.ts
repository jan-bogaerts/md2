import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionCompactRequest, ActionCompactState, ActionRunEvent } from '../../data/action_run_types';
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge';
import { dialogService } from '../dialog_service';
import { ActionCompactService } from './action_compact_service';
import { actionRunRegistry } from './action_run_registry';
import { remoteConnectionService } from '../data/remote_connection_service';

const request: ActionCompactRequest = {
    actionId: 'review', context: { kind: 'project' }, conversationId: 'conversation-1', provider: 'codex',
    reference: 'activity.json#conversation=conversation-1', requestId: 'compact-1',
};

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
    return { promise, resolve };
}

const errorDialog = { critical: false, id: 1, message: 'Failure', severity: 'error' as const, title: 'Error' };

function event(state: ActionCompactState['state'], message?: string): ActionRunEvent {
    return {
        actionId: 'review', context: request.context, phase: 'main', rootActionId: 'review', runId: 'run-1',
        status: 'running', type: 'update', update: { kind: 'agentCompact', request: { ...request, message, runId: 'run-1', state } },
    };
}

afterEach(() => {
    setActionBridgeOverride(null);
    vi.restoreAllMocks();
    actionRunRegistry.stop();
});

describe('ActionCompactService', () => {
    it('reports remote disconnect with uncertain acceptance and never resubmits', async () => {
        vi.spyOn(dialogService, 'error').mockReturnValue(errorDialog);
        const compact = vi.fn(async () => ({ ...request, state: 'running' as const }));
        const bridge = { compactActionConversation: compact, onActionRun: vi.fn(() => vi.fn()) } as unknown as ElectronActionBridge;
        setActionBridgeOverride(bridge);
        const service = new ActionCompactService();
        await service.request(request);
        vi.spyOn(remoteConnectionService, 'getSnapshot').mockReturnValue({errorMessage: 'Socket closed', endpoint: null, status: 'reconnecting'});
        remoteConnectionService.dispatchEvent(new Event('changed'));
        expect(service.getSnapshot(request.conversationId)[0]).toMatchObject({ state: 'failed', message: expect.stringContaining('unknown') });
        expect(compact).toHaveBeenCalledTimes(1);
        setActionBridgeOverride(null);
        service.connect();
    });

    it('keeps scoped snapshots and does not mistake acceptance for completion', async () => {
        const accepted = deferred<ActionCompactState>();
        const compactActionConversation = vi.fn(async () => accepted.promise);
        const bridge = { compactActionConversation, onActionRun: vi.fn(() => vi.fn()) } as unknown as ElectronActionBridge;
        setActionBridgeOverride(bridge);
        const service = new ActionCompactService();
        const changed = vi.fn();
        const unrelated = vi.fn();
        service.addEventListener('compact:conversation-1', changed);
        service.addEventListener('compact:conversation-2', unrelated);
        const sending = service.request(request);
        expect(service.getSnapshot('conversation-1')[0].state).toBe('queued');
        service.handleEvent(event('running'));
        service.handleEvent(event('queued'));
        accepted.resolve({ ...request, state: 'queued' });
        await sending;
        expect(service.getSnapshot('conversation-1')[0].state).toBe('running');
        service.handleEvent(event('completed'));
        expect(service.getSnapshot('conversation-1')[0].state).toBe('completed');
        expect(changed).toHaveBeenCalledTimes(3);
        expect(unrelated).not.toHaveBeenCalled();
        expect(service.getSnapshot('conversation-1')).toBe(service.getSnapshot('conversation-1'));
    });

    it('preserves completion received before acknowledgement and keeps captured request intact', async () => {
        const accepted = deferred<ActionCompactState>();
        const compactActionConversation = vi.fn(async () => accepted.promise);
        setActionBridgeOverride({ compactActionConversation, onActionRun: vi.fn(() => vi.fn()) } as unknown as ElectronActionBridge);
        const service = new ActionCompactService();
        const sending = service.request(request);
        service.handleEvent(event('completed'));
        accepted.resolve({ ...request, state: 'running' });
        await sending;
        expect(service.getSnapshot('conversation-1')[0].state).toBe('completed');
        expect(compactActionConversation).toHaveBeenCalledWith(request);
    });

    it('reports missing backend and provider failure once without retrying', async () => {
        const error = vi.spyOn(dialogService, 'error').mockReturnValue(errorDialog);
        const service = new ActionCompactService();
        await service.request(request);
        expect(service.getSnapshot('conversation-1')[0]).toMatchObject({ state: 'failed', message: expect.stringContaining('backend') });
        expect(error).toHaveBeenCalledTimes(1);
        service.handleEvent(event('failed', 'Not enough messages to compact.'));
        expect(error).toHaveBeenCalledTimes(1);
    });

    it('fails outstanding work on backend replacement without resubmitting', async () => {
        vi.spyOn(dialogService, 'error').mockReturnValue(errorDialog);
        const compact = vi.fn(async () => ({ ...request, state: 'running' as const }));
        const bridge = { compactActionConversation: compact, onActionRun: vi.fn(() => vi.fn()) } as unknown as ElectronActionBridge;
        setActionBridgeOverride(bridge);
        const service = new ActionCompactService();
        await service.request(request);
        setActionBridgeOverride(null);
        service.connect();
        expect(service.getSnapshot('conversation-1')[0].state).toBe('failed');
        expect(compact).toHaveBeenCalledTimes(1);
    });
});
