import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionScheduleRegistrationRequest } from '../../data/electron_action_bridge';
import {
    createTestClient,
    flushPromises,
    installWebSocket,
    lastSocket,
    MockWebSocket,
    openConnection,
    settle,
} from '../test_support/mock_web_socket';
import { RemoteControlActionBridge } from './remote_control_action_bridge';

const START_REQUEST = { actionId: 'review', context: { file: 'design/F-1.md', kind: 'card' as const }, runInput: {} };
const REFERENCE = 'activity.json#conversation=one';

interface ForwardingCase {
    call: (bridge: RemoteControlActionBridge) => Promise<unknown>;
    method: string;
    params: unknown[];
}

const forwardingCases: ForwardingCase[] = [
    { call: (bridge) => bridge.startAction(START_REQUEST), method: 'startAction', params: [START_REQUEST] },
    { call: (bridge) => bridge.startUnattendedAction(START_REQUEST), method: 'startUnattendedAction', params: [START_REQUEST] },
    { call: (bridge) => bridge.restartActionRun('run-1', START_REQUEST), method: 'restartActionRun', params: ['run-1', START_REQUEST] },
    { call: (bridge) => bridge.reserveActionConversation(START_REQUEST), method: 'reserveActionConversation', params: [START_REQUEST] },
    {
        call: (bridge) => bridge.prepareActionPrompt({ actionId: 'review', context: { kind: 'project' } }),
        method: 'prepareActionPrompt',
        params: [{ actionId: 'review', context: { kind: 'project' } }],
    },
    { call: (bridge) => bridge.cancelActionRun('run-1'), method: 'cancelActionRun', params: ['run-1'] },
    { call: (bridge) => bridge.finishActionRun('run-1'), method: 'finishActionRun', params: ['run-1'] },
    { call: (bridge) => bridge.listActiveActionRuns(), method: 'listActiveActionRuns', params: [] },
    {
        call: (bridge) => bridge.loadActionRunHistory({ cardInternalId: 'card-1' } as never),
        method: 'loadActionRunHistory',
        params: [{ cardInternalId: 'card-1' }],
    },
    {
        call: (bridge) => bridge.loadActionRunRecoverySnapshot(['run-active', 'run-ended']),
        method: 'loadActionRunRecoverySnapshot',
        params: [['run-active', 'run-ended']],
    },
    { call: (bridge) => bridge.sendActionMessage('run-1', 'approved'), method: 'sendActionMessage', params: ['run-1', 'approved'] },
    {
        call: (bridge) => bridge.enqueueActionPrompt('run-1', 'next', 'submission-1'),
        method: 'enqueueActionPrompt',
        params: ['run-1', 'next', 'submission-1'],
    },
    {
        call: (bridge) => bridge.editActionQueuedPrompt('run-1', 'prompt-1', 0, 'edited'),
        method: 'editActionQueuedPrompt',
        params: ['run-1', 'prompt-1', 0, 'edited'],
    },
    {
        call: (bridge) => bridge.deleteActionQueuedPrompt('run-1', 'prompt-1', 1),
        method: 'deleteActionQueuedPrompt',
        params: ['run-1', 'prompt-1', 1],
    },
    {
        call: (bridge) => bridge.answerActionQuestion('run-1', 7, { confirm: ['Yes'] }),
        method: 'answerActionQuestion',
        params: ['run-1', 7, { confirm: ['Yes'] }],
    },
    { call: (bridge) => bridge.dismissActionQuestions('run-1', 7), method: 'dismissActionQuestions', params: ['run-1', 7] },
    { call: (bridge) => bridge.answerActionApproval('run-1', 41, 'accept'), method: 'answerActionApproval', params: ['run-1', 41, 'accept'] },
    {
        call: (bridge) => bridge.compactActionConversation({ reference: REFERENCE } as never),
        method: 'compactActionConversation',
        params: [{ reference: REFERENCE }],
    },
    {
        call: (bridge) => bridge.splitActionConversation(REFERENCE, 'message-2'),
        method: 'splitActionConversation',
        params: [REFERENCE, 'message-2'],
    },
    {
        call: (bridge) => bridge.closeWaitingActionConversation(REFERENCE, 'completed'),
        method: 'closeWaitingActionConversation',
        params: [REFERENCE, 'completed'],
    },
    {
        call: (bridge) => bridge.dismissWaitingActionConversationQuestions(REFERENCE),
        method: 'dismissWaitingActionConversationQuestions',
        params: [REFERENCE],
    },
    {
        call: (bridge) => bridge.updateActionConversationViewed(REFERENCE, false),
        method: 'updateActionConversationViewed',
        params: [REFERENCE, false],
    },
    {
        call: (bridge) => bridge.updateCardActionSettings({ actionId: 'review', cardInternalId: 'card-1' } as never),
        method: 'updateCardActionSettings',
        params: [{ actionId: 'review', cardInternalId: 'card-1' }],
    },
    { call: (bridge) => bridge.acquireReleaseCardLocks(['card-1']), method: 'acquireReleaseCardLocks', params: [['card-1']] },
    { call: (bridge) => bridge.releaseReleaseCardLocks('lease-1'), method: 'releaseReleaseCardLocks', params: ['lease-1'] },
    { call: (bridge) => bridge.listActiveSchedules(), method: 'listActiveSchedules', params: [] },
    { call: (bridge) => bridge.deleteSchedule('schedule-1'), method: 'deleteSchedule', params: ['schedule-1'] },
    { call: (bridge) => bridge.loadCardActivity({ cardInternalId: 'card-1' }), method: 'loadCardActivity', params: [{ cardInternalId: 'card-1' }] },
    {
        call: (bridge) => bridge.readFileAtCommit({ commit: 'a'.repeat(40), parent: true, path: 'design/F-1.md' }),
        method: 'readFileAtCommit',
        params: [{ commit: 'a'.repeat(40), parent: true, path: 'design/F-1.md' }],
    },
    {
        call: (bridge) => bridge.generateDiff({ commit: 'abc1234', filePath: 'design/F-1.md' }),
        method: 'generateDiff',
        params: [{ commit: 'abc1234', filePath: 'design/F-1.md' }],
    },
    {
        call: (bridge) => bridge.listWorktreeChanges({ worktree: 2, worktreeBranch: 'feature' }),
        method: 'listWorktreeChanges',
        params: [{ worktree: 2, worktreeBranch: 'feature' }],
    },
    {
        call: (bridge) => bridge.generateWorktreeFileDiff({ path: 'app/a.ts', worktree: 2, worktreeBranch: 'feature' }),
        method: 'generateWorktreeFileDiff',
        params: [{ path: 'app/a.ts', worktree: 2, worktreeBranch: 'feature' }],
    },
    { call: (bridge) => bridge.openInEditor({ path: 'design/F-1.md' } as never), method: 'openInEditor', params: [{ path: 'design/F-1.md' }] },
    { call: (bridge) => bridge.loadAgentAvailability(), method: 'loadAgentAvailability', params: [] },
    { call: (bridge) => bridge.loadAgentModelCatalog({ agent: 'codex' } as never), method: 'loadAgentModelCatalog', params: [{ agent: 'codex' }] },
    { call: (bridge) => bridge.runSearchRegexpAgent('find cards'), method: 'runSearchRegexpAgent', params: ['find cards'] },
];

function createBridge() {
    const client = createTestClient();

    return { bridge: new RemoteControlActionBridge(client), client };
}

describe('RemoteControlActionBridge', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it.each(forwardingCases)('forwards $method with unchanged parameters and returns the host result', async ({ call, method, params }) => {
        installWebSocket();
        const { bridge } = createBridge();
        const result = call(bridge);
        const socket = lastSocket();
        socket.open();
        await flushPromises();

        expect(socket.request(0)).toMatchObject({ method, params });
        expect(socket.request(0).params).toHaveLength(params.length);
        socket.receive({ id: socket.request(0).id, result: { host: method } });
        const value = await result;
        if (value !== undefined) expect(value).toEqual({ host: method });
    });

    it.each([
        { timestamp: '2099-07-07T10:30:00.000Z', type: 'at' },
        { agent: 'codex', expectedResetAt: '2099-07-07T10:30:00.000Z', limitId: 'primary', type: 'account-reset', windowId: 'five-hour' },
        { cardInternalId: 'trigger-card', registrationState: 'todo', targetState: 'done', type: 'card-state' },
    ] as ActionScheduleRegistrationRequest['trigger'][])('forwards $type schedule registration and waits for confirmation', async (trigger) => {
        installWebSocket();
        const { bridge } = createBridge();
        const request = { actionId: 'implement', context: { cardInternalId: 'target-card', kind: 'card' as const }, trigger };
        const registration = bridge.registerActionSchedule(request);
        const socket = lastSocket();
        socket.open();
        await flushPromises();

        expect(socket.request(0)).toMatchObject({ method: 'registerActionSchedule', params: [request] });
        socket.receive({ id: socket.request(0).id, result: { id: 'schedule-1' } });
        await expect(registration).resolves.toBeUndefined();
    });

    it('reports desktop schedule failures with the remote method prefix', async () => {
        installWebSocket();
        const { bridge, client } = createBridge();
        const socket = await openConnection(client);
        const deletion = bridge.deleteSchedule('missing');
        await flushPromises();
        socket.receive({ error: { message: 'Schedule not found: missing' }, id: socket.request(0).id });

        await expect(deletion).rejects.toThrow('Remote method deleteSchedule failed: Schedule not found: missing');
    });

    it('streams agent-run events by setup request id and then by run id until the closed event', async () => {
        installWebSocket();
        const { bridge, client } = createBridge();
        const socket = await openConnection(client);
        const callback = vi.fn();
        const run = bridge.runSearchRegexpAgent('find cards', callback);
        await flushPromises();
        const { id } = socket.request(0);
        const outputEvent = { content: 'working', runId: 'agent-1', type: 'output' };
        const closedEvent = { runId: 'agent-1', type: 'closed' };

        socket.receive({ event: 'agentRun', payload: { event: outputEvent, requestId: id } });
        socket.receive({ id, result: { runId: 'agent-1' } });
        await expect(run).resolves.toEqual({ runId: 'agent-1' });
        socket.receive({ event: 'agentRun', payload: { event: outputEvent, requestId: 'other' } });
        socket.receive({ event: 'agentRun', payload: { event: closedEvent, requestId: 'other' } });
        socket.receive({ event: 'agentRun', payload: { event: outputEvent, requestId: 'other' } });

        expect(callback.mock.calls).toEqual([[outputEvent], [outputEvent], [closedEvent]]);
    });

    it('drops agent-run routing when the socket closes', async () => {
        installWebSocket();
        const { bridge, client } = createBridge();
        const firstSocket = await openConnection(client);
        const callback = vi.fn();
        const run = bridge.runSearchRegexpAgent('find cards', callback);
        await flushPromises();
        firstSocket.receive({ id: firstSocket.request(0).id, result: { runId: 'agent-1' } });
        await run;
        firstSocket.close();

        const secondSocket = await openConnection(client);
        secondSocket.receive({ event: 'agentRun', payload: { event: { runId: 'agent-1', type: 'output' }, requestId: 'other' } });

        expect(callback).not.toHaveBeenCalled();
    });

    it('delivers action-run events through a subscription restored after reconnect', async () => {
        installWebSocket();
        const { bridge, client } = createBridge();
        const callback = vi.fn();
        bridge.onActionRun(callback);
        const firstSocket = lastSocket();
        firstSocket.open();
        await flushPromises();
        expect(firstSocket.request(0).method).toBe('onActionRun');
        firstSocket.receive({ id: firstSocket.request(0).id, result: { subscriptionId: 'action-events-1' } });
        await flushPromises();
        firstSocket.close();

        const secondSocket = await openConnection(client);
        await vi.waitFor(() => expect(secondSocket.methods()).toEqual(['onActionRun']));
        const event = { runId: 'run-1', sequence: 1, status: 'running', type: 'run' };
        secondSocket.receive({ event: 'actionRun', payload: { event, requestId: secondSocket.request(0).id, subscriptionId: 'action-events-2' } });

        expect(callback).toHaveBeenCalledExactlyOnceWith(event);
    });

    it('delivers conversation view changes and restores one subscription when the socket closes during setup', async () => {
        installWebSocket();
        const { bridge, client } = createBridge();
        const callback = vi.fn();
        bridge.onActionConversationViewed(callback);
        const firstSocket = lastSocket();
        firstSocket.open();
        await flushPromises();
        expect(firstSocket.methods()).toEqual(['onActionConversationViewed']);
        firstSocket.close();

        const secondSocket = await openConnection(client);
        await settle();
        expect(secondSocket.methods()).toEqual(['onActionConversationViewed']);
        secondSocket.receive({ id: secondSocket.request(0).id, result: { subscriptionId: 'conversation-view-2' } });
        await flushPromises();
        const event = { conversationId: 'conversation-1', viewed: false };
        secondSocket.receive({ event: 'conversationViewed', payload: { event, requestId: 'other', subscriptionId: 'conversation-view-2' } });

        expect(callback).toHaveBeenCalledExactlyOnceWith(event);
    });

    it('shares one model-catalog subscription between listeners and unsubscribes after the last', async () => {
        installWebSocket();
        const { bridge } = createBridge();
        const firstCallback = vi.fn();
        const secondCallback = vi.fn();
        const stopFirst = bridge.onAgentModelCatalogChanged(firstCallback);
        const stopSecond = bridge.onAgentModelCatalogChanged(secondCallback);
        const socket = lastSocket();
        socket.open();
        await flushPromises();
        const catalog = { agent: 'codex', models: [{ displayName: 'Shared model', hidden: false, id: 'shared-model' }] };

        expect(socket.methods()).toEqual(['onAgentModelCatalogChanged']);
        socket.receive({ event: 'agentModelCatalog', payload: { catalog, requestId: socket.request(0).id, subscriptionId: 'catalog-1' } });
        socket.receive({ id: socket.request(0).id, result: { subscriptionId: 'catalog-1' } });
        await flushPromises();
        stopFirst();
        stopSecond();

        expect(firstCallback).toHaveBeenCalledWith(catalog);
        expect(secondCallback).toHaveBeenCalledWith(catalog);
        expect(socket.request(-1)).toMatchObject({ method: 'unsubscribe', params: ['catalog-1'] });
        expect(MockWebSocket.instances).toHaveLength(1);
    });
});
