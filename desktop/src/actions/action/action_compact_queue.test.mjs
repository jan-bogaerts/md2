import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ActionRun } = require('./action_run');
const { ActionRunnerService } = require('./action_runner_service');

const project = { rootPath: 'C:/repo' };
const action = { id: 'review', label: 'Review', on: [], onAfter: [], onBefore: [], prompt: 'Original action', streaming: true, type: 'agent' };
const request = {
    actionId: 'review', context: { kind: 'project' }, conversationId: 'conversation-1', provider: 'codex',
    reference: 'activity.json#conversation=conversation-1', requestId: 'compact-1',
};

function queueHarness() {
    const events = [];
    const service = {
        canCompact: vi.fn(() => true), compact: vi.fn(async () => undefined),
        hasPendingInteraction: vi.fn(() => false), sendMessage: vi.fn(async () => undefined), stop: vi.fn(), finish: vi.fn(),
    };
    const run = new ActionRun({context: request.context, project, rootAction: action, runId: 'run-1', runInput: {}}, { agentRunnerService: service, publisher: (event) => events.push(event) });
    run.activeAction = action;
    run.activeActionPhase = 'main';
    run.activeAgentProject = project;
    run.activeAgentRunId = 'agent-1';
    run.activeConversationId = request.conversationId;
    run.activeAgentProvider = request.provider;
    return { events, run, service };
}

function compactStates(events) {
    return events.filter((event) => event.update?.kind === 'agentCompact').map(({ update }) => update.request.state);
}

function runnerHarness() {
    const { run, events, service } = queueHarness();
    const conversation = {
        actionId: action.id, cardInternalId: null, entries: [{ kind: 'message' }], id: request.conversationId,
        providerSessions: [{ agent: 'codex', conversationId: 'session-1' }],
    };
    service.processes = new Map([['agent-1', { agent: 'codex', conversation }]]);
    const load = vi.fn(async () => conversation);
    const runner = new ActionRunnerService({ agentRunnerService: service, localGitService: { loadAgentConversation: load } });
    runner.requireReady = vi.fn();
    runner.project = project;
    runner.releasesFolder = 'design/releases';
    runner.runs.set(run.runId, run);
    run.publisher = runner.publish.bind(runner);
    runner.subscribe((event) => events.push(event));
    return { conversation, events, load, run, runner, service };
}

describe('compact scheduling', () => {
    it('holds later prompts behind compact during an active turn and releases them only after completion', async () => {
        const { events, run, service } = queueHarness();
        service.canCompact.mockReturnValue(false);
        await run.enqueueCompact(request);
        await run.enqueueAgentPrompt('Later prompt', 'prompt-1');
        await run.dispatchStreamingPrompt();
        expect(service.compact).not.toHaveBeenCalled();
        expect(service.sendMessage).not.toHaveBeenCalled();
        service.canCompact.mockReturnValue(true);
        await run.dispatchStreamingPrompt();
        expect(service.compact).toHaveBeenCalledExactlyOnceWith('agent-1', expect.objectContaining(request));
        expect(compactStates(events)).toEqual(['queued', 'running']);
        expect(service.sendMessage).not.toHaveBeenCalled();
        run.settleCompact({ requestId: request.requestId });
        await run.dispatchStreamingPrompt();
        expect(service.sendMessage).toHaveBeenCalledExactlyOnceWith('agent-1', 'Later prompt', 'prompt-1');
        expect(compactStates(events)).toEqual(['queued', 'running', 'completed']);
    });

    it('preserves repeated request order and prevents double dispatch', async () => {
        const { run, service } = queueHarness();
        await run.enqueueCompact(request);
        await run.enqueueCompact({ ...request, requestId: 'compact-2' });
        await run.dispatchStreamingPrompt();
        expect(service.compact).toHaveBeenCalledTimes(1);
        run.settleCompact({ requestId: 'compact-1' });
        await run.dispatchStreamingPrompt();
        expect(service.compact.mock.calls.map(([, compact]) => compact.requestId)).toEqual(['compact-1', 'compact-2']);
    });

    it('waits through startup and unanswered interactions', async () => {
        const { run, service } = queueHarness();
        run.activeAgentRunId = null;
        await run.enqueueCompact(request);
        await run.dispatchStreamingPrompt();
        expect(service.compact).not.toHaveBeenCalled();
        run.activeAgentRunId = 'agent-1';
        service.hasPendingInteraction.mockReturnValue(true);
        await run.dispatchStreamingPrompt();
        expect(service.compact).not.toHaveBeenCalled();
        service.hasPendingInteraction.mockReturnValue(false);
        await run.dispatchStreamingPrompt();
        expect(service.compact).toHaveBeenCalledTimes(1);
    });

    it.each(['cancel', 'finishAgent'])('%s fails outstanding requests and prevents later dispatch', async (operation) => {
        const { events, run, service } = queueHarness();
        await run.enqueueCompact(request);
        await run.enqueueCompact({ ...request, requestId: 'compact-2' });
        await run.dispatchStreamingPrompt();
        run[operation]();
        run.settleCompact({ requestId: 'compact-1' });
        await run.dispatchStreamingPrompt();
        expect(compactStates(events).filter((state) => state === 'failed')).toHaveLength(2);
        expect(service.compact).toHaveBeenCalledTimes(1);
    });

    it('keeps existing mid-turn prompt dispatch when no compact is pending', async () => {
        const { run, service } = queueHarness();
        service.canCompact.mockReturnValue(false);
        await run.enqueueAgentPrompt('Steer active turn', 'prompt-1');
        await run.dispatchStreamingPrompt();
        expect(service.sendMessage).toHaveBeenCalledWith('agent-1', 'Steer active turn', 'prompt-1');
    });

    it('starts saved sessions without action chains, history records, or automatic card-state finishing', async () => {
        const { run, service } = queueHarness();
        run.compactOnly = true;
        run.compactTarget = request;
        run.activeAgentRunId = null;
        run.agentExecutor = {
            execute: vi.fn(async (input) => {
                input.onActiveRunChange('agent-1');
                await run.dispatchStreamingPrompt();
                input.onEvent({ requestId: request.requestId, type: 'compactSettled' });
                input.onActiveRunChange(null);
                return { exitCode: 0, reference: request.reference, stdout: '', stderr: '' };
            }),
        };
        run.actionWorktreeRunService = { resolve: vi.fn(async () => ({ runProject: project })) };
        run.localGitService = { appendAndCommitActionActivity: vi.fn() };
        run.rootAction = { ...action, onBefore: [{ type: 'command' }], onAfter: [{ type: 'command' }] };
        await expect(run.run()).resolves.toMatchObject({ status: 'completed' });
        expect(run.agentExecutor.execute).toHaveBeenCalledTimes(1);
        expect(run.agentExecutor.execute.mock.calls[0][0].compactOnly).toBe(true);
        expect(run.localGitService.appendAndCommitActionActivity).not.toHaveBeenCalled();
        expect(service.compact).toHaveBeenCalledTimes(1);
    });
});

describe('compact captured targets', () => {
    it.each(['delete', 'finish'])('cancels saved-session startup during action loading after target %s', async (operation) => {
        const { runner } = runnerHarness();
        runner.runs.clear();
        const pendingAction = Promise.withResolvers();
        runner.loadRootAction = vi.fn(async () => pendingAction.promise);
        const accepted = runner.compactConversation(request);
        await vi.waitFor(() => expect(runner.loadRootAction).toHaveBeenCalled());
        if (operation === 'delete') await runner.cancelCompactsForPath('activity.json');
        else await runner.cancelCompactsForConversation(request.conversationId);
        pendingAction.resolve(action);
        await expect(accepted).rejects.toThrow('Compaction cancelled');
        expect(runner.runs.size).toBe(0);
    });

    it.each(['cancel', 'finishAgentRun'])('does not resurrect compact after %s during target validation', async (operation) => {
        const { runner, load, conversation, run, service } = runnerHarness();
        const pendingLoad = Promise.withResolvers();
        load.mockImplementation(async () => pendingLoad.promise);
        const accepted = runner.compactConversation(request);
        await Promise.resolve();
        runner[operation](run.runId);
        runner.runs.clear();
        pendingLoad.resolve(conversation);
        await expect(accepted).rejects.toThrow('stopped or finished');
        expect(service.compact).not.toHaveBeenCalled();
    });

    it('blocks later prompts while compact target validation is still loading', async () => {
        const { runner, load, conversation, service, run } = runnerHarness();
        const pendingLoad = Promise.withResolvers();
        load.mockImplementation(async () => pendingLoad.promise);
        const accepted = runner.compactConversation(request);
        const prompt = runner.enqueueAgentPrompt(run.runId, 'Later prompt', 'prompt-1');
        await Promise.resolve();
        expect(service.sendMessage).not.toHaveBeenCalled();
        pendingLoad.resolve(conversation);
        await accepted;
        await prompt;
        await run.dispatchStreamingPrompt();
        expect(service.compact).toHaveBeenCalledTimes(1);
        expect(service.sendMessage).not.toHaveBeenCalled();
        run.settleCompact({ requestId: request.requestId });
        await run.dispatchStreamingPrompt();
        expect(service.sendMessage).toHaveBeenCalledWith('agent-1', 'Later prompt', 'prompt-1');
    });

    it('deduplicates request IDs and validates loaded conversation ownership', async () => {
        const { runner, service, conversation } = runnerHarness();
        await runner.compactConversation(request);
        await runner.compactConversation(request);
        expect(service.compact).toHaveBeenCalledTimes(1);
        await expect(runner.compactConversation({ ...request, conversationId: 'other' })).rejects.toThrow('another target');
        conversation.cardInternalId = 'another-card';
        await expect(runner.compactConversation({ ...request, requestId: 'compact-2' })).rejects.toThrow('ownership');
    });

    it('rejects empty history, missing saved sessions, and different loaded identities', async () => {
        const { runner, conversation } = runnerHarness();
        conversation.entries = [];
        await expect(runner.compactConversation(request)).rejects.toThrow('nothing to compact');
        conversation.entries = [{ kind: 'message' }];
        conversation.id = 'other-conversation';
        await expect(runner.compactConversation(request)).rejects.toThrow('identity');
        conversation.id = request.conversationId;
        runner.runs.clear();
        conversation.providerSessions = [];
        await expect(runner.compactConversation(request)).rejects.toThrow('Missing provider session');
    });

    it('cancels during project shutdown while target loading is pending', async () => {
        const { runner, load, conversation } = runnerHarness();
        const pendingLoad = Promise.withResolvers();
        load.mockImplementation(async () => pendingLoad.promise);
        const accepted = runner.compactConversation(request);
        await Promise.resolve();
        runner.runs.clear();
        await runner.stop();
        pendingLoad.resolve(conversation);
        await expect(accepted).rejects.toThrow('project shutdown');
    });

    it('cancels only matching targets before deletion', async () => {
        const { runner, run, events } = runnerHarness();
        await runner.compactConversation(request);
        await runner.cancelCompactsForPath('unrelated.json');
        expect(run.controller.signal.aborted).toBe(false);
        await runner.cancelCompactsForPath('activity.json');
        expect(run.controller.signal.aborted).toBe(true);
        expect(compactStates(events).at(-1)).toBe('failed');
    });
});
