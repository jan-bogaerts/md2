import type { CardActivityFile } from '../../../../shared/card_activity.mjs';
import type {
    ActionCompactRequest,
    ActionCompactState,
    ActionPromptRequest,
    ActionQueuedPrompt,
    ActionRunEvent,
    ActionStartRequest,
    AgentApprovalDecision,
    AgentApprovalRequestId,
    AgentConversationReservation,
    PreparedActionPrompt,
} from '../../data/action_run_types';
import type { AnySchedule } from '../../data/action_schedule_types';
import type { AgentModelCatalog, AgentModelCatalogRequest } from '../../data/agent_model_catalog';
import type { AgentConversation, AgentRunEvent } from '../../data/data_types';
import type { AgentAvailability } from '../../data/electron_data_bridge';
import type {
    ActionConversationViewedEvent,
    ActionRunHistoryEntry,
    ActionRunHistoryRequest,
    ActionRunRecoverySnapshot,
    ActionScheduleRegistrationRequest,
    ActiveActionRun,
    CardActionSettingsRequest,
    CardActivityRequest,
    DiffRequest,
    DiffResult,
    ElectronActionBridge,
    HistoricalFileContent,
    OpenInEditorRequest,
    ReadFileAtCommitRequest,
    WorktreeDiffRequest,
    WorktreeDiffResult,
} from '../../data/electron_action_bridge';
import { RemoteControlBroadcastSubscription } from './remote_control_broadcast_subscription';
import {
    startCallbackSubscription,
    type RemoteControlCallbackSubscriptionOptions,
    type RemoteControlSubscriptionPayload,
} from './remote_control_callback_subscription';
import { SOCKET_CLOSED_EVENT, type RemoteControlClient } from './remote_control_client';

interface AgentRunPayload {
    event: AgentRunEvent;
    requestId: string;
}

interface ActionRunPayload extends RemoteControlSubscriptionPayload {
    event: ActionRunEvent;
}

interface ConversationViewedPayload extends RemoteControlSubscriptionPayload {
    event: ActionConversationViewedEvent;
}

interface CatalogChangedPayload extends RemoteControlSubscriptionPayload {
    catalog: AgentModelCatalog;
}

const AGENT_RUN_EVENT = 'agentRun';

const ACTION_RUN_SUBSCRIPTION: RemoteControlCallbackSubscriptionOptions<ActionRunPayload, ActionRunEvent> = {
    eventName: 'actionRun',
    method: 'onActionRun',
    select: (payload) => payload.event,
};

type ConversationViewedOptions = RemoteControlCallbackSubscriptionOptions<ConversationViewedPayload, ActionConversationViewedEvent>;

const CONVERSATION_VIEWED_SUBSCRIPTION: ConversationViewedOptions = {
    eventName: 'conversationViewed',
    method: 'onActionConversationViewed',
    select: (payload) => payload.event,
};

/** Action bridge backed by one remote-control client, including request-scoped agent-run streaming. */
export class RemoteControlActionBridge implements ElectronActionBridge {
    private readonly catalogSubscription: RemoteControlBroadcastSubscription<CatalogChangedPayload, AgentModelCatalog>;
    private readonly client: RemoteControlClient;
    private readonly requestAgentEvents = new Map<string, (event: AgentRunEvent) => void>();
    private readonly runAgentEvents = new Map<string, (event: AgentRunEvent) => void>();

    constructor(client: RemoteControlClient) {
        this.client = client;
        this.catalogSubscription = new RemoteControlBroadcastSubscription(client, {
            eventName: 'agentModelCatalog',
            method: 'onAgentModelCatalogChanged',
            select: (payload: CatalogChangedPayload) => payload.catalog,
        });
        client.addEventListener(AGENT_RUN_EVENT, this.handleAgentRunEvent);
        client.addEventListener(SOCKET_CLOSED_EVENT, this.handleSocketClosed);
    }

    onActionRun(callback: (event: ActionRunEvent) => void): () => void {
        return startCallbackSubscription(this.client, ACTION_RUN_SUBSCRIPTION, callback);
    }

    onActionConversationViewed(callback: (event: ActionConversationViewedEvent) => void): () => void {
        return startCallbackSubscription(this.client, CONVERSATION_VIEWED_SUBSCRIPTION, callback);
    }

    onAgentModelCatalogChanged(callback: (catalog: AgentModelCatalog) => void): () => void {
        return this.catalogSubscription.addListener(callback);
    }

    async runSearchRegexpAgent(input: string, callback?: (event: AgentRunEvent) => void): Promise<string> {
        return this.requestWithAgentEvents<string>('runSearchRegexpAgent', [input], callback);
    }

    async startAction(request: ActionStartRequest): Promise<string> {
        return this.client.request<string>('startAction', [request]);
    }

    async startUnattendedAction(request: ActionStartRequest): Promise<string> {
        return this.client.request<string>('startUnattendedAction', [request]);
    }

    async restartActionRun(runId: string, request: ActionStartRequest): Promise<string> {
        return this.client.request<string>('restartActionRun', [runId, request]);
    }

    async reserveActionConversation(request: ActionStartRequest): Promise<AgentConversationReservation> {
        return this.client.request<AgentConversationReservation>('reserveActionConversation', [request]);
    }

    async prepareActionPrompt(request: ActionPromptRequest): Promise<PreparedActionPrompt> {
        return this.client.request<PreparedActionPrompt>('prepareActionPrompt', [request]);
    }

    async cancelActionRun(runId: string): Promise<void> {
        await this.client.request('cancelActionRun', [runId]);
    }

    async finishActionRun(runId: string): Promise<void> {
        await this.client.request('finishActionRun', [runId]);
    }

    async listActiveActionRuns(): Promise<ActiveActionRun[]> {
        return this.client.request<ActiveActionRun[]>('listActiveActionRuns', []);
    }

    async loadActionRunHistory(request: ActionRunHistoryRequest): Promise<ActionRunHistoryEntry[]> {
        return this.client.request<ActionRunHistoryEntry[]>('loadActionRunHistory', [request]);
    }

    async loadActionRunRecoverySnapshot(rendererRunIds: string[]): Promise<ActionRunRecoverySnapshot> {
        return this.client.request<ActionRunRecoverySnapshot>('loadActionRunRecoverySnapshot', [rendererRunIds]);
    }

    async sendActionMessage(runId: string, content: string): Promise<void> {
        await this.client.request('sendActionMessage', [runId, content]);
    }

    async enqueueActionPrompt(runId: string, content: string, submissionId: string): Promise<ActionQueuedPrompt> {
        return this.client.request('enqueueActionPrompt', [runId, content, submissionId]);
    }

    async editActionQueuedPrompt(runId: string, promptId: string, revision: number, content: string): Promise<ActionQueuedPrompt> {
        return this.client.request('editActionQueuedPrompt', [runId, promptId, revision, content]);
    }

    async deleteActionQueuedPrompt(runId: string, promptId: string, revision: number): Promise<{ deleted: true }> {
        return this.client.request('deleteActionQueuedPrompt', [runId, promptId, revision]);
    }

    async answerActionQuestion(
        runId: string,
        requestId: number | string | null,
        answers: Record<string, string[]>,
    ): Promise<void> {
        await this.client.request('answerActionQuestion', [runId, requestId, answers]);
    }

    async dismissActionQuestions(runId: string, requestId: number | string | null): Promise<void> {
        await this.client.request('dismissActionQuestions', [runId, requestId]);
    }

    async answerActionApproval(
        runId: string,
        requestId: AgentApprovalRequestId,
        decision: AgentApprovalDecision,
    ): Promise<void> {
        await this.client.request('answerActionApproval', [runId, requestId, decision]);
    }

    async compactActionConversation(request: ActionCompactRequest): Promise<ActionCompactState> {
        return this.client.request('compactActionConversation', [request]);
    }

    async splitActionConversation(reference: string, messageId: string): Promise<AgentConversation> {
        return this.client.request<AgentConversation>('splitActionConversation', [reference, messageId]);
    }

    async closeWaitingActionConversation(reference: string, status: 'cancelled' | 'completed'): Promise<AgentConversation> {
        return this.client.request<AgentConversation>('closeWaitingActionConversation', [reference, status]);
    }

    async dismissWaitingActionConversationQuestions(reference: string): Promise<AgentConversation> {
        return this.client.request<AgentConversation>('dismissWaitingActionConversationQuestions', [reference]);
    }

    async updateActionConversationViewed(reference: string, viewed: boolean): Promise<AgentConversation> {
        return this.client.request<AgentConversation>('updateActionConversationViewed', [reference, viewed]);
    }

    async updateCardActionSettings(request: CardActionSettingsRequest): Promise<void> {
        await this.client.request('updateCardActionSettings', [request]);
    }

    async acquireReleaseCardLocks(cardInternalIds: string[]): Promise<string> {
        return this.client.request<string>('acquireReleaseCardLocks', [cardInternalIds]);
    }

    async releaseReleaseCardLocks(leaseId: string): Promise<void> {
        await this.client.request('releaseReleaseCardLocks', [leaseId]);
    }

    async registerActionSchedule(request: ActionScheduleRegistrationRequest): Promise<void> {
        await this.client.request('registerActionSchedule', [request]);
    }

    async listActiveSchedules(): Promise<AnySchedule[]> {
        return this.client.request<AnySchedule[]>('listActiveSchedules', []);
    }

    async deleteSchedule(scheduleId: string): Promise<AnySchedule[]> {
        return this.client.request<AnySchedule[]>('deleteSchedule', [scheduleId]);
    }

    async loadCardActivity(request: CardActivityRequest): Promise<CardActivityFile> {
        return this.client.request<CardActivityFile>('loadCardActivity', [request]);
    }

    async readFileAtCommit(request: ReadFileAtCommitRequest): Promise<HistoricalFileContent> {
        return this.client.request<HistoricalFileContent>('readFileAtCommit', [request]);
    }

    async generateDiff(request: DiffRequest): Promise<DiffResult> {
        return this.client.request<DiffResult>('generateDiff', [request]);
    }

    async generateWorktreeDiff(request: WorktreeDiffRequest): Promise<WorktreeDiffResult> {
        return this.client.request<WorktreeDiffResult>('generateWorktreeDiff', [request]);
    }

    async openInEditor(request: OpenInEditorRequest): Promise<void> {
        await this.client.request('openInEditor', [request]);
    }

    async loadAgentAvailability(): Promise<Record<string, AgentAvailability>> {
        return this.client.request<Record<string, AgentAvailability>>('loadAgentAvailability', []);
    }

    async loadAgentModelCatalog(request: AgentModelCatalogRequest): Promise<AgentModelCatalog> {
        return this.client.request<AgentModelCatalog>('loadAgentModelCatalog', [request]);
    }

    private async requestWithAgentEvents<T>(method: string, params: unknown[], onEvent?: (event: AgentRunEvent) => void): Promise<T> {
        if (!onEvent) return this.client.request<T>(method, params);

        const id = this.client.createRequestId();
        this.requestAgentEvents.set(id, onEvent);
        try {
            const result = await this.client.sendRequest<T>(id, method, params);
            const runId = (result as { runId?: unknown }).runId;
            if (typeof runId === 'string') this.runAgentEvents.set(runId, onEvent);

            return result;
        } finally {
            this.requestAgentEvents.delete(id);
        }
    }

    private readonly handleAgentRunEvent = (event: Event) => {
        const payload = (event as CustomEvent<AgentRunPayload>).detail;
        const callback = this.requestAgentEvents.get(payload.requestId) ?? this.runAgentEvents.get(payload.event.runId);
        callback?.(payload.event);
        if (payload.event.type === 'closed') this.runAgentEvents.delete(payload.event.runId);
    };

    private readonly handleSocketClosed = () => {
        this.requestAgentEvents.clear();
        this.runAgentEvents.clear();
    };
}
