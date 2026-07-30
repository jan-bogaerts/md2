import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { AgentRunnerService } = require('./agent_runner_service');

describe('AgentRunnerService state handling', () => {
    it('consumes one queued revision exactly once', async () => {
        const sendMessage = vi.fn();
        const service = new AgentRunnerService({ persistConversation: vi.fn(async () => undefined) });
        service.processes.set('run-1', {
            conversation: { messages: [], status: 'running' },
            id: 'run-1',
            onEvent: vi.fn(),
            persistence: Promise.resolve(),
            queuedMessage: null,
            queuedMessageRevision: -1,
            sentQueuedMessageRevision: -1,
            streaming: true,
            streamingAdapter: { sendMessage },
            turnActive: true,
            turnIndex: 1,
        });

        service.setQueuedMessage('run-1', 'approved', 0);
        await service.sendQueuedMessage('run-1', 0);
        await service.sendQueuedMessage('run-1', 0);

        expect(sendMessage).toHaveBeenCalledOnce();
        expect(sendMessage).toHaveBeenCalledWith('approved');
    });

    it('redacts secret answers from stored and emitted activity', async () => {
        let releaseAnswer;
        const answerQuestion = vi.fn(() => new Promise((resolve) => {
            releaseAnswer = resolve;
        }));
        const service = new AgentRunnerService({ persistConversation: vi.fn(async () => undefined) });
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

    it('does not append a user message when the provider write fails', async () => {
        const writeError = new Error('stdin write failed');
        const service = new AgentRunnerService({
            persistConversation: vi.fn(async () => undefined),
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
