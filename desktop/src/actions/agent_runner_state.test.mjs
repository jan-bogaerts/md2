import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { AgentRunnerService } = require('./agent_runner_service');

describe('AgentRunnerService state handling', () => {
    it('reports one diagnosed Codex cache error and suppresses repeats', async () => {
        const diagnoseCodexCacheError = vi.fn(async () => 'Codex versions differ. Update Codex.');
        const service = new AgentRunnerService({ diagnoseCodexCacheError });
        const run = {
            agent: 'codex',
            child: {},
            codexCacheErrorReported: false,
            conversation: { events: [], messages: [] },
            environment: { Path: 'C:\\tools' },
            executable: 'codex.cmd',
            id: 'run-1',
            nextSequence: 1,
            onEvent: vi.fn(),
            secretValues: new Set(),
            stderr: '',
            stderrBuffer: '',
            stderrHandling: Promise.resolve(),
        };
        service.processes.set('run-1', run);

        service.handleOutput('run-1', 'stderr', Buffer.from('failed to load models cache: broken\n'));
        service.handleOutput('run-1', 'stderr', Buffer.from('failed to renew cache TTL: broken\n'));
        await run.stderrHandling;

        expect(diagnoseCodexCacheError).toHaveBeenCalledOnce();
        expect(diagnoseCodexCacheError).toHaveBeenCalledWith(
            'failed to load models cache: broken',
            'codex.cmd',
            { Path: 'C:\\tools' },
        );
        expect(run.stderr).toBe('Codex versions differ. Update Codex.\n');
        expect(run.conversation.events).toHaveLength(1);
        expect(run.onEvent).toHaveBeenCalledOnce();
    });

    it('consumes one queued revision exactly once', async () => {
        const sendMessage = vi.fn();
        const service = new AgentRunnerService({
            persistConversation: vi.fn(async () => undefined),
            persistConversationCheckpoint: vi.fn(async () => undefined),
        });
        service.processes.set('run-1', {
            conversation: { messages: [], status: 'running' },
            id: 'run-1',
            onEvent: vi.fn(),
            persistence: Promise.resolve(),
            queuedMessage: null,
            queuedMessageRevision: -1,
            queuedMessageSessionId: 0,
            sentQueuedMessageRevision: -1,
            streaming: true,
            streamingAdapter: { sendMessage },
            turnActive: true,
            turnIndex: 1,
        });

        const sessionId = service.beginQueuedMessageDraft('run-1');
        service.setQueuedMessage('run-1', sessionId, 'approved', 0);
        await expect(service.sendQueuedMessage('run-1', sessionId, 0)).resolves.toEqual({ sent: true });
        await expect(service.sendQueuedMessage('run-1', sessionId, 0)).rejects.toThrow('already sent');

        expect(sendMessage).toHaveBeenCalledOnce();
        expect(sendMessage).toHaveBeenCalledWith('approved');
    });

    it('accepts revision zero from a new prompt session after renderer restart', () => {
        const service = new AgentRunnerService();
        const run = {
            id: 'run-1',
            queuedMessage: { content: 'old', revision: 4 },
            queuedMessageRevision: 4,
            queuedMessageSessionId: 1,
            sentQueuedMessageRevision: 3,
        };
        service.processes.set('run-1', run);

        const sessionId = service.beginQueuedMessageDraft('run-1');
        const result = service.setQueuedMessage('run-1', sessionId, 'new', 0);

        expect(result).toEqual({ accepted: true });
        expect(run.queuedMessage).toEqual({ content: 'new', revision: 0 });
        expect(() => service.setQueuedMessage('run-1', 1, 'stale', 5)).toThrow('session expired');
    });

    it('checkpoints the complete transcript when a turn starts waiting for input', async () => {
        const persistConversationCheckpoint = vi.fn(async () => undefined);
        const service = new AgentRunnerService({ persistConversationCheckpoint });
        const run = {
            agent: 'codex',
            conversation: {
                events: [],
                messages: [{ content: 'Done', id: 'assistant-1', role: 'assistant', timestamp: 'now' }],
                providerSessions: [],
                status: 'running',
            },
            currentAssistantMessageId: 'assistant-1',
            finishing: false,
            id: 'run-1',
            missingSession: false,
            nextSequence: 2,
            onEvent: vi.fn(),
            persistence: Promise.resolve(),
            providerConversationId: 'provider-1',
            queuedMessage: null,
            request: {},
            streaming: true,
            turnActive: true,
            turnIndex: 1,
            waitingForQuestion: false,
        };
        service.processes.set('run-1', run);

        await service.handleStreamingEvent('run-1', { type: 'turnCompleted' });

        expect(persistConversationCheckpoint).toHaveBeenCalledWith(expect.objectContaining({
            conversation: expect.objectContaining({
                messages: [expect.objectContaining({ content: 'Done' })],
                status: 'waitingForInput',
            }),
        }));
    });

    it('waits for close processing after terminating every run', async () => {
        const { promise: closed, resolve: resolveClosed } = Promise.withResolvers();
        const service = new AgentRunnerService({ terminateProcessTree: vi.fn(async () => undefined) });
        service.processes.set('run-1', {
            cancelled: false,
            child: {},
            closed,
            termination: null,
        });
        let completed = false;

        const stopping = service.stopAll().then(() => {
            completed = true;
        });
        await Promise.resolve();
        expect(completed).toBe(false);
        resolveClosed();
        await stopping;
        expect(completed).toBe(true);
    });

    it('persists a suspended waiting run as resumable', async () => {
        const persistConversation = vi.fn(async () => undefined);
        const service = new AgentRunnerService({ persistConversation });
        const run = {
            agent: 'codex',
            cancelled: false,
            changedPaths: new Set(),
            child: { pid: 10 },
            conversation: {
                completedAt: null,
                events: [],
                id: 'conversation-1',
                messages: [{ content: 'Done', id: 'assistant-1', role: 'assistant', timestamp: 'now' }],
                providerSessions: [],
                status: 'waitingForInput',
            },
            currentAssistantMessageId: null,
            finishing: false,
            id: 'run-1',
            missingSession: false,
            onComplete: vi.fn(),
            onEvent: vi.fn(),
            persistence: Promise.resolve(),
            protocolHandling: Promise.resolve(),
            request: {},
            startedAt: '2026-07-30T10:00:00.000Z',
            stderr: '',
            stderrBuffer: '',
            stdout: '',
            streaming: true,
            streamingFailure: null,
            suspended: true,
            termination: Promise.resolve(),
            turnUsage: null,
        };
        service.processes.set('run-1', run);
        service.runningConversationIds.add('conversation-1');

        await service.handleClose('run-1', 1);

        expect(persistConversation).toHaveBeenCalledWith(expect.objectContaining({
            conversation: expect.objectContaining({
                completedAt: null,
                status: 'waitingForInput',
            }),
            stderr: '',
        }));
    });

    it('redacts secret answers from stored and emitted activity', async () => {
        let releaseAnswer;
        const answerQuestion = vi.fn(() => new Promise((resolve) => {
            releaseAnswer = resolve;
        }));
        const service = new AgentRunnerService({
            persistConversation: vi.fn(async () => undefined),
            persistConversationCheckpoint: vi.fn(async () => undefined),
        });
        const run = {
            conversation: { events: [], messages: [], status: 'waitingForInput' },
            id: 'run-1',
            onEvent: vi.fn(),
            pendingQuestions: [{ id: 'token', isSecret: true }],
            persistence: Promise.resolve(),
            streaming: true,
            streamingAdapter: { answerQuestion },
            stdout: '',
            turnIndex: 1,
            waitingForQuestion: true,
        };
        service.processes.set('run-1', run);
        const answers = { token: ['top-secret'] };

        const answering = service.answerQuestion('run-1', 7, answers);
        await vi.waitFor(() => expect(answerQuestion).toHaveBeenCalled());
        await service.handleStreamingEvent('run-1', { content: 'echo top-secret', type: 'assistant' });
        releaseAnswer();
        await answering;

        const answerMessage = run.conversation.messages.find(({ role }) => role === 'user');
        expect(answerMessage.content).toContain('token: [secret]');
        expect(run.stdout).toContain('echo [secret]');
        expect(JSON.stringify(run.onEvent.mock.calls)).not.toContain('top-secret');
    });

    it('creates separate assistant messages around intervening activity', async () => {
        const service = new AgentRunnerService();
        const run = {
            activityEventIndexes: new Map(),
            agent: 'codex',
            assistantItemIndex: 0,
            assistantItems: new Map(),
            conversation: { events: [], messages: [], status: 'running' },
            currentAssistantMessageId: null,
            id: 'run-1',
            nextSequence: 2,
            onEvent: vi.fn(),
            secretValues: new Set(),
            stdout: '',
            streaming: true,
            turnIndex: 1,
        };
        service.processes.set('run-1', run);

        await service.handleStreamingEvent('run-1', { itemId: 'message-1', type: 'assistantStarted' });
        await service.handleStreamingEvent('run-1', { content: 'First', itemId: 'message-1', type: 'assistant' });
        await service.handleStreamingEvent('run-1', {
            activity: {
                content: 'Thinking',
                label: 'Reasoning',
                providerItemId: 'reasoning-1',
                status: 'completed',
                type: 'reasoning',
            },
            type: 'activity',
        });
        await service.handleStreamingEvent('run-1', { itemId: 'message-2', type: 'assistantStarted' });
        await service.handleStreamingEvent('run-1', { content: 'Done', itemId: 'message-2', type: 'assistant' });

        expect(run.conversation.messages).toEqual([
            expect.objectContaining({ content: 'First', sequence: 2 }),
            expect.objectContaining({ content: 'Done', sequence: 4 }),
        ]);
        expect(run.conversation.events).toEqual([
            expect.objectContaining({ providerItemId: 'reasoning-1', sequence: 3 }),
        ]);
    });

    it('updates an indexed activity without scanning or appending conversation history', async () => {
        const service = new AgentRunnerService();
        const existingActivity = {
            content: 'Running',
            id: 'activity-1',
            label: 'Command',
            providerItemId: 'command-1',
            sequence: 7,
            status: 'inProgress',
            timestamp: 'earlier',
            type: 'commandExecution',
        };
        const events = [
            { content: 'started', id: 'started-1', sequence: 1, timestamp: 'earlier', type: 'started' },
            existingActivity,
            { content: 'unrelated', id: 'event-1', sequence: 8, timestamp: 'earlier', type: 'diagnostic' },
        ];
        events.findIndex = vi.fn(() => { throw new Error('conversation history was scanned'); });
        const run = {
            activityEventIndexes: new Map([['command-1', 1]]),
            conversation: { events, messages: [], status: 'running' },
            id: 'run-1',
            nextSequence: 9,
            onEvent: vi.fn(),
            secretValues: new Set(),
        };
        service.processes.set('run-1', run);

        await service.handleStreamingEvent('run-1', {
            activity: {
                content: 'Completed',
                label: 'Command',
                providerItemId: 'command-1',
                status: 'completed',
                type: 'commandExecution',
            },
            type: 'activity',
        });

        expect(events.findIndex).not.toHaveBeenCalled();
        expect(run.conversation.events).toHaveLength(3);
        expect(run.conversation.events[1]).toMatchObject({
            content: 'Completed',
            id: 'activity-1',
            providerItemId: 'command-1',
            sequence: 7,
            status: 'completed',
        });
        expect(run.onEvent).toHaveBeenCalledWith(expect.objectContaining({
            activity: expect.objectContaining({ content: 'Completed', id: 'activity-1' }),
            type: 'agentActivity',
        }));
    });

    it('does not append a user message when the provider write fails', async () => {
        const writeError = new Error('stdin write failed');
        const service = new AgentRunnerService({
            persistConversation: vi.fn(async () => undefined),
            persistConversationCheckpoint: vi.fn(async () => undefined),
            terminateProcessTree: vi.fn(async () => undefined),
        });
        const run = {
            child: { stdin: { end: vi.fn() } },
            conversation: {
                events: [],
                messages: [{ content: 'initial', id: 'user-1', role: 'user', timestamp: 'now' }],
                status: 'waitingForInput',
            },
            id: 'run-1',
            onEvent: vi.fn(),
            pendingQuestions: [],
            persistence: Promise.resolve(),
            queuedMessage: null,
            secretValues: new Set(),
            stderr: '',
            streaming: true,
            streamingAdapter: { sendMessage: vi.fn(async () => { throw writeError; }) },
            turnIndex: 1,
            waitingForQuestion: false,
        };
        service.processes.set('run-1', run);

        await expect(service.sendMessage('run-1', 'ghost')).rejects.toThrow(writeError);
        expect(run.conversation.messages).toHaveLength(1);
        expect(run.conversation.status).toBe('failed');
    });

    it('routes account runtime updates without conversation persistence', () => {
        const persistConversation = vi.fn();
        const codexRuntimeService = {
            publishRateLimits: vi.fn(),
            publishUnavailable: vi.fn(),
        };
        const service = new AgentRunnerService({ codexRuntimeService, persistConversation });
        const payload = { rateLimits: { limitId: 'codex' } };

        service.handleCodexRuntimeEvent({ kind: 'update', observedAt: 10, payload });
        service.handleCodexRuntimeEvent({ kind: 'unavailable', observedAt: 11 });

        expect(codexRuntimeService.publishRateLimits).toHaveBeenCalledWith(payload, 10, true);
        expect(codexRuntimeService.publishUnavailable).toHaveBeenCalledWith(11);
        expect(persistConversation).not.toHaveBeenCalled();
    });
});
