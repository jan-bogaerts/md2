import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { AGENT_RESULT_MAX_LENGTH } from '../../../../shared/agent_conversations.mjs';

const require = createRequire(import.meta.url);
const { AGENT_FINISH_GRACE_MS, AgentRunnerService } = require('./agent_runner_service');

function diagnosticStreamingEvent(content, providerItemId) {
    return {
        event: { content, label: 'Codex protocol diagnostic', providerItemId, status: 'completed', type: 'diagnostic' },
        type: 'event',
    };
}

describe('AgentRunnerService state handling', () => {
    it('persists a new conversation before spawning its process and publishing started', async () => {
        const initialCheckpoint = Promise.withResolvers();
        const child = new EventEmitter();
        child.pid = 42;
        child.stdin = new PassThrough();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        const persistConversationCheckpoint = vi.fn(async () => initialCheckpoint.promise);
        const persistConversation = vi.fn(async () => undefined);
        const spawn = vi.fn(() => child);
        const onEvent = vi.fn();
        const service = new AgentRunnerService({
            executableResolver: { find: vi.fn(async () => '/tools/fake-agent') },
            persistConversation,
            persistConversationCheckpoint,
            spawn,
        });
        const project = { rootPath: resolve(import.meta.dirname, '../../../..') };
        const request = { command: ['fake-agent'], projectFolder: 'design', prompt: 'Start work' };

        const start = service.start(project, request, onEvent, vi.fn(), vi.fn());
        await vi.waitFor(() => expect(persistConversationCheckpoint).toHaveBeenCalledOnce());

        expect(spawn).not.toHaveBeenCalled();
        expect(onEvent).not.toHaveBeenCalled();

        initialCheckpoint.resolve();
        const result = await start;

        expect(persistConversationCheckpoint.mock.invocationCallOrder[0]).toBeLessThan(spawn.mock.invocationCallOrder[0]);
        expect(spawn.mock.invocationCallOrder[0]).toBeLessThan(onEvent.mock.invocationCallOrder[0]);
        expect(persistConversationCheckpoint).toHaveBeenCalledWith(expect.objectContaining({
            conversation: expect.objectContaining({
                entries: [expect.objectContaining({ content: 'Start work', role: 'user' })],
                id: result.conversation.id,
                status: 'running',
            }),
            request: expect.objectContaining({ activityProject: project, projectFolder: 'design' }),
        }));
        expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
            conversation: result.conversation,
            type: 'started',
        }));

        child.emit('close', 0);
        await vi.waitFor(() => expect(persistConversation).toHaveBeenCalledOnce());
    });

    it('does not require an installed agent when the service is constructed', () => {
        const find = vi.fn();

        expect(() => new AgentRunnerService({
            claudeUsagePoller: { requestPoll: vi.fn(), stop: vi.fn() },
            executableResolver: { find },
        })).not.toThrow();
        expect(find).not.toHaveBeenCalled();
    });

    it('rejects an unresolved selected executable before persistence, usage polling, or spawn', async () => {
        const claudeUsagePoller = { requestPoll: vi.fn(), stop: vi.fn() };
        const persistConversationCheckpoint = vi.fn();
        const spawn = vi.fn();
        const service = new AgentRunnerService({
            claudeUsagePoller,
            executableResolver: { find: vi.fn(async () => null) },
            persistConversationCheckpoint,
            spawn,
        });
        const project = { rootPath: resolve(import.meta.dirname, '../../../..') };
        const request = { agent: 'claude', command: ['missing-claude'], projectFolder: 'design', prompt: 'Start work' };

        await expect(service.start(project, request, vi.fn(), vi.fn(), vi.fn()))
            .rejects.toThrow('Executable not found for claude: missing-claude');
        expect(persistConversationCheckpoint).not.toHaveBeenCalled();
        expect(claudeUsagePoller.requestPoll).not.toHaveBeenCalled();
        expect(spawn).not.toHaveBeenCalled();
    });

    it('persists timer transitions before publishing pause and resume states', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:10.000Z'));
        try {
            const persistConversationCheckpoint = vi.fn(async () => undefined);
            const service = new AgentRunnerService({ persistConversationCheckpoint });
            const run = {
                conversation: {
                    entries: [],
                    providerSessions: [],
                    status: 'running',
                    timer: { elapsedMs: 0, runningStartedAt: '2026-01-01T00:00:00.000Z' },
                },
                id: 'run-1',
                interactionWrites: Promise.resolve(),
                nextSequence: 1,
                onEvent: vi.fn(),
                pendingApprovals: new Map(),
                pendingQuestions: [],
                persistence: Promise.resolve(),
                secretValues: new Set(),
                streaming: true,
                streamingAdapter: { answerQuestion: vi.fn(async () => undefined) },
                waitingForQuestion: false,
            };
            service.processes.set('run-1', run);
            const pausedTimer = { elapsedMs: 10_000, runningStartedAt: null };
            const pausedCheckpoint = expect.objectContaining({ conversation: expect.objectContaining({ timer: pausedTimer }) });

            await service.handleStreamingEvent('run-1', {questions: [{ id: 'choice', isSecret: false }], requestId: 7, type: 'question'});
            expect(run.conversation.timer).toEqual(pausedTimer);
            expect(persistConversationCheckpoint).toHaveBeenLastCalledWith(pausedCheckpoint);
            const pauseStateCallIndex = run.onEvent.mock.calls.findIndex(([event]) => event.type === 'state');
            expect(persistConversationCheckpoint.mock.invocationCallOrder[0])
                .toBeLessThan(run.onEvent.mock.invocationCallOrder[pauseStateCallIndex]);

            vi.setSystemTime(new Date('2026-01-01T00:00:20.000Z'));
            await service.answerQuestion('run-1', 7, { choice: 'continue' });

            expect(run.conversation.timer).toEqual({
                elapsedMs: 10_000,
                runningStartedAt: '2026-01-01T00:00:20.000Z',
            });
            expect(persistConversationCheckpoint).toHaveBeenLastCalledWith(expect.objectContaining({conversation: expect.objectContaining({timer: { elapsedMs: 10_000, runningStartedAt: '2026-01-01T00:00:20.000Z' }})}));
        } finally {
            vi.useRealTimers();
        }
    });

    it('reports one diagnosed Codex cache error and suppresses repeats', async () => {
        const diagnoseCodexCacheError = vi.fn(async () => ({
            cacheVersion: '0.146.0',
            message: 'Codex versions differ. Update Codex.',
            runningVersion: '0.144.6',
            updateRequired: true,
        }));
        const codexRuntimeService = { publishUpdateRequired: vi.fn() };
        const service = new AgentRunnerService({ codexRuntimeService, diagnoseCodexCacheError });
        const run = {
            agent: 'codex',
            child: {},
            codexCacheErrorReported: false,
            conversation: { entries: [] },
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
        expect(run.conversation.entries).toHaveLength(1);
        expect(run.onEvent).toHaveBeenCalledOnce();
        expect(codexRuntimeService.publishUpdateRequired).toHaveBeenCalledWith('0.144.6', '0.146.0');
    });

    it('keeps matching or unknown cache versions local to the action', async () => {
        const diagnoseCodexCacheError = vi.fn(async () => ({
            cacheVersion: null,
            message: 'Codex cache failed without confirmed mismatch.',
            runningVersion: '0.146.0',
            updateRequired: false,
        }));
        const codexRuntimeService = { publishUpdateRequired: vi.fn() };
        const service = new AgentRunnerService({ codexRuntimeService, diagnoseCodexCacheError });
        const run = {
            agent: 'codex',
            codexCacheErrorReported: false,
            conversation: { entries: [] },
            environment: {},
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
        await run.stderrHandling;

        expect(run.stderr).toContain('without confirmed mismatch');
        expect(codexRuntimeService.publishUpdateRequired).not.toHaveBeenCalled();
    });

    it('checkpoints the complete transcript when a turn starts waiting for input', async () => {
        const persistConversationCheckpoint = vi.fn(async () => undefined);
        const service = new AgentRunnerService({ persistConversationCheckpoint });
        const run = {
            agent: 'codex',
            conversation: {
                contextWindowUsage: { capacityTokens: 100, usedTokens: 20 },
                entries: [{ content: 'Done', id: 'assistant-1', kind: 'message', role: 'assistant', timestamp: 'now' }],
                providerSessions: [],
                status: 'running',
            },
            currentAssistantMessageId: 'assistant-1',
            finishing: false,
            id: 'run-1',
            missingSession: false,
            nextSequence: 2,
            onEvent: vi.fn(),
            pendingApprovals: new Map(),
            persistence: Promise.resolve(),
            providerConversationId: 'provider-1',
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
                entries: [expect.objectContaining({ content: 'Done', kind: 'message' })],
                providerSessions: [expect.objectContaining({
                    agent: 'codex',
                    conversationId: 'provider-1',
                    synchronizedThroughMessageId: 'assistant-1',
                })],
                status: 'waitingForInput',
            }),
        }));
    });

    it('replaces live turn usage and commits the latest snapshot once at turn completion', async () => {
        const persistConversationCheckpoint = vi.fn(async () => undefined);
        const usageMetricsService = { recordTokenUsage: vi.fn(async () => true) };
        const service = new AgentRunnerService({ persistConversationCheckpoint, usageMetricsService });
        const onEvent = vi.fn();
        const persistedUsage = {
            cachedInputTokens: 1,
            inputTokens: 4,
            outputTokens: 3,
            reasoningTokens: 2,
            totalTokens: 10,
        };
        const firstSnapshot = {
            cachedInputTokens: 0,
            inputTokens: 3,
            outputTokens: 2,
            reasoningTokens: 0,
            totalTokens: 5,
        };
        const latestSnapshot = { ...firstSnapshot, inputTokens: 5, totalTokens: 7 };
        const run = {
            agent: 'codex',
            conversation: {
                entries: [{ content: 'Done', id: 'assistant-1', kind: 'message', role: 'assistant', timestamp: 'now' }],
                providerSessions: [],
                status: 'running',
                usage: persistedUsage,
            },
            currentAssistantMessageId: 'assistant-1',
            finishing: false,
            id: 'run-1',
            liveTurnUsage: null,
            missingSession: false,
            nextSequence: 2,
            onEvent,
            pendingApprovals: new Map(),
            persistence: Promise.resolve(),
            providerConversationId: 'provider-1',
            request: {},
            streaming: true,
            turnActive: true,
            turnIndex: 1,
            waitingForQuestion: false,
        };
        service.processes.set('run-1', run);

        const firstContextWindowUsage = { capacityTokens: 100_000, usedTokens: 5_000 };
        const latestContextWindowUsage = { capacityTokens: 258_400, usedTokens: 42_000 };
        await service.handleStreamingEvent('run-1', {
            contextWindowUsage: firstContextWindowUsage,
            type: 'usage',
            usage: firstSnapshot,
        });
        await service.handleStreamingEvent('run-1', {
            contextWindowUsage: latestContextWindowUsage,
            type: 'usage',
            usage: latestSnapshot,
        });

        expect(run.conversation.usage).toEqual(persistedUsage);
        expect(run.conversation).not.toHaveProperty('contextWindowUsage');
        expect(onEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({
            contextWindowUsage: firstContextWindowUsage,
            type: 'usage',
            usage: expect.objectContaining({ totalTokens: 15 }),
        }));
        expect(onEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({
            contextWindowUsage: latestContextWindowUsage,
            type: 'usage',
            usage: expect.objectContaining({ totalTokens: 17 }),
        }));

        await service.handleStreamingEvent('run-1', {
            contextWindowUsage: latestContextWindowUsage,
            type: 'turnCompleted',
            usage: latestSnapshot,
        });

        expect(run.conversation.usage).toEqual(expect.objectContaining({ totalTokens: 17 }));
        expect(run.conversation.contextWindowUsage).toEqual(latestContextWindowUsage);
        expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
            contextWindowUsage: latestContextWindowUsage,
            type: 'usage',
            usage: expect.objectContaining({ totalTokens: 17 }),
        }));
        const expectedConversation = expect.objectContaining({
            contextWindowUsage: latestContextWindowUsage,
            usage: expect.objectContaining({ totalTokens: 17 }),
        });
        expect(persistConversationCheckpoint).toHaveBeenCalledWith(expect.objectContaining({ conversation: expectedConversation }));
        expect(usageMetricsService.recordTokenUsage).toHaveBeenCalledWith(
            'codex',
            latestSnapshot,
            expect.any(Number),
        );
    });

    it('does not persist an unconfirmed live snapshot when the streaming turn fails', async () => {
        const service = new AgentRunnerService({ terminateProcessTree: vi.fn(async () => true) });
        const persistedUsage = {
            cachedInputTokens: 0,
            inputTokens: 10,
            outputTokens: 0,
            reasoningTokens: 0,
            totalTokens: 10,
        };
        const run = {
            child: { stdin: { end: vi.fn() } },
            conversation: { entries: [], status: 'running', usage: persistedUsage },
            id: 'run-1',
            liveTurnUsage: null,
            nextSequence: 1,
            onEvent: vi.fn(),
            secretValues: new Set(),
            stderr: '',
            streamingFailure: null,
            termination: null,
            waitingForQuestion: false,
        };
        service.processes.set('run-1', run);

        await service.handleStreamingEvent('run-1', {
            contextWindowUsage: { capacityTokens: 258_400, usedTokens: 42_000 },
            type: 'usage',
            usage: { cachedInputTokens: 0, inputTokens: 5, outputTokens: 0, reasoningTokens: 0, totalTokens: 5 },
        });
        service.failStreamingRun(run, new Error('Turn failed'));

        expect(run.conversation.usage).toBe(persistedUsage);
        expect(run.conversation).not.toHaveProperty('contextWindowUsage');
        expect(run.liveTurnUsage).toEqual(expect.objectContaining({ totalTokens: 5 }));
    });

    it('keeps streaming process stderr out of canonical conversation entries', () => {
        const service = new AgentRunnerService();
        const run = {
            conversation: { entries: [] },
            id: 'run-1',
            onEvent: vi.fn(),
            secretValues: new Set(),
            stderr: '',
            streaming: true,
        };
        service.processes.set('run-1', run);

        service.recordOutput('run-1', 'stderr', 'Codex internal runtime output\n');

        expect(run.stderr).toBe('Codex internal runtime output\n');
        expect(run.conversation.entries).toEqual([]);
        expect(run.onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    });

    it('waits for close processing after terminating every run', async () => {
        const { promise: closed, resolve: resolveClosed } = Promise.withResolvers();
        const service = new AgentRunnerService({ terminateProcessTree: vi.fn(async () => undefined) });
        service.processes.set('run-1', {
            cancelled: false,
            child: {},
            closed,
            conversation: { status: 'running' },
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

    it('terminates cancellation through the owned child handle', async () => {
        const terminateProcessTree = vi.fn(async () => true);
        const service = new AgentRunnerService({ terminateProcessTree });
        const child = {};
        service.processes.set('run-1', {
            cancelled: false,
            child,
            conversation: { status: 'running' },
            termination: null,
        });

        await service.stop('run-1');

        expect(terminateProcessTree).toHaveBeenCalledWith(child);
    });

    it('does not scan for descendants after a process closes normally', async () => {
        const persistConversation = vi.fn(async () => undefined);
        const terminateProcessTree = vi.fn(async () => undefined);
        const service = new AgentRunnerService({ persistConversation, terminateProcessTree });
        const run = {
            agent: 'codex',
            cancelled: false,
            changedPaths: new Set(),
            child: { pid: 10 },
            conversation: {
                completedAt: null,
                entries: [{ content: 'Done', id: 'assistant-1', kind: 'message', role: 'assistant', timestamp: 'now' }],
                id: 'conversation-1',
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
            termination: null,
            turnUsage: null,
        };
        service.processes.set('run-1', run);
        service.runningConversationIds.add('conversation-1');

        await service.handleClose('run-1', 1);

        expect(persistConversation).toHaveBeenCalledWith(expect.objectContaining({
            conversation: expect.objectContaining({
                completedAt: null,
                entries: [expect.objectContaining({ content: 'Done', kind: 'message' })],
                status: 'waitingForInput',
            }),
            stderr: '',
        }));
        expect(terminateProcessTree).not.toHaveBeenCalled();
    });

    it('publishes the terminal conversation when terminal persistence fails', async () => {
        const persistenceError = new Error('Token summary could not be written');
        const persistConversation = vi.fn(async () => {
            throw persistenceError;
        });
        const service = new AgentRunnerService({ persistConversation });
        const run = {
            agent: 'codex',
            cancelled: true,
            changedPaths: new Set(),
            child: { pid: 10 },
            conversation: {
                completedAt: null,
                entries: [{ content: 'Stopped', id: 'assistant-1', kind: 'message', role: 'assistant', timestamp: 'now' }],
                id: 'conversation-1',
                providerSessions: [],
                status: 'running',
            },
            currentAssistantMessageId: null,
            finishing: false,
            id: 'run-1',
            missingSession: false,
            onComplete: vi.fn(),
            onCompletionError: vi.fn(),
            onEvent: vi.fn(),
            persistence: Promise.resolve(),
            protocolHandling: Promise.resolve(),
            request: {},
            startedAt: '2026-07-30T10:00:00.000Z',
            stderr: '',
            stderrBuffer: '',
            stderrHandling: Promise.resolve(),
            stdout: '',
            streaming: false,
            streamingFailure: null,
            suspended: false,
            termination: Promise.resolve(),
            turnUsage: null,
        };
        service.processes.set('run-1', run);
        service.runningConversationIds.add('conversation-1');

        await service.handleClose('run-1', 1);

        expect(run.onEvent).toHaveBeenCalledWith(expect.objectContaining({
            conversation: expect.objectContaining({ completedAt: expect.any(String), status: 'cancelled' }),
            type: 'closed',
        }));
        expect(run.onCompletionError).toHaveBeenCalledWith(persistenceError);
        expect(run.onComplete).not.toHaveBeenCalled();
        expect(service.processes.has('run-1')).toBe(false);
    });

    it('records one-shot Claude usage only after successful process completion', async () => {
        const claudeUsagePoller = { requestPoll: vi.fn(), stop: vi.fn() };
        const persistConversation = vi.fn(async () => undefined);
        const usageMetricsService = { recordTokenUsage: vi.fn(async () => true) };
        const service = new AgentRunnerService({ claudeUsagePoller, persistConversation, usageMetricsService });
        const turnUsage = {
            cachedInputTokens: 2,
            inputTokens: 5,
            outputTokens: 3,
            reasoningTokens: 0,
            totalTokens: 10,
        };
        const run = {
            agent: 'claude',
            cancelled: false,
            changedPaths: new Set(),
            child: { pid: 10 },
            conversation: {
                completedAt: null,
                entries: [{ content: 'Done', id: 'assistant-1', kind: 'message', role: 'assistant', timestamp: 'now' }],
                id: 'conversation-1',
                providerSessions: [],
                status: 'running',
            },
            currentAssistantMessageId: null,
            environment: { PATH: '/bin' },
            executable: '/tools/claude',
            finishing: false,
            id: 'run-1',
            missingSession: false,
            onComplete: vi.fn(),
            onEvent: vi.fn(),
            persistence: Promise.resolve(),
            protocolHandling: Promise.resolve(),
            request: {},
            rootPath: '/project',
            startedAt: '2026-07-30T10:00:00.000Z',
            stderr: '',
            stderrBuffer: '',
            stderrHandling: Promise.resolve(),
            stdout: '',
            streaming: false,
            streamingFailure: null,
            suspended: false,
            termination: null,
            turnUsage,
        };
        service.processes.set('run-1', run);
        service.runningConversationIds.add('conversation-1');

        await service.handleClose('run-1', 0);

        expect(usageMetricsService.recordTokenUsage).toHaveBeenCalledWith(
            'claude',
            turnUsage,
            expect.any(Number),
        );
        expect(run.onComplete).toHaveBeenCalledWith(0, run);
    });

    it('leaves persisted continuation unchanged when provider turn never starts', async () => {
        const persistConversation = vi.fn(async () => undefined);
        const service = new AgentRunnerService({ persistConversation });
        const sourceConversation = {
            entries: [{ content: 'Earlier answer', id: 'assistant-1', kind: 'message', role: 'assistant', timestamp: 'earlier' }],
            id: 'conversation-1',
            providerSessions: [],
            status: 'completed',
        };
        const run = {
            agent: 'codex',
            cancelled: false,
            changedPaths: new Set(),
            child: { pid: 10 },
            conversation: {
                ...sourceConversation,
                entries: [
                    ...sourceConversation.entries,
                    { content: 'Unsent request', id: 'user-2', kind: 'message', role: 'user', timestamp: 'now' },
                ],
                status: 'running',
            },
            currentAssistantMessageId: null,
            finishing: false,
            id: 'run-1',
            missingSession: false,
            onComplete: vi.fn(),
            onEvent: vi.fn(),
            persistence: Promise.resolve(),
            protocolHandling: Promise.resolve(),
            request: { conversation: sourceConversation },
            startedAt: '2026-07-30T10:00:00.000Z',
            stderr: 'provider startup failed',
            stderrBuffer: '',
            stdout: '',
            streaming: true,
            streamingFailure: new Error('provider startup failed'),
            suspended: false,
            termination: null,
            turnStarted: false,
            turnUsage: null,
        };
        service.processes.set('run-1', run);
        service.runningConversationIds.add('conversation-1');

        await service.handleClose('run-1', 1);

        expect(persistConversation).not.toHaveBeenCalled();
        expect(run.onEvent).toHaveBeenCalledWith(expect.objectContaining({
            conversation: expect.objectContaining({ status: 'failed' }),
            type: 'closed',
        }));
        expect(run.onComplete).toHaveBeenCalledWith(1, run);
    });

    it('persists earlier transcript and concrete failure after provider turn starts', async () => {
        const persistConversation = vi.fn(async () => undefined);
        const service = new AgentRunnerService({ persistConversation });
        const sourceConversation = {
            entries: [{ content: 'Earlier answer', id: 'assistant-1', kind: 'message', role: 'assistant', timestamp: 'earlier' }],
            id: 'conversation-1',
            providerSessions: [],
            status: 'completed',
        };
        const run = {
            agent: 'claude',
            cancelled: false,
            changedPaths: new Set(),
            child: { pid: 10 },
            conversation: {
                ...sourceConversation,
                entries: [
                    ...sourceConversation.entries,
                    { content: 'Sent request', id: 'user-2', kind: 'message', role: 'user', timestamp: 'now' },
                    { content: 'Claude provider failed: quota exhausted', id: 'error-3', kind: 'event', timestamp: 'now', type: 'error' },
                ],
                status: 'running',
            },
            currentAssistantMessageId: null,
            finishing: false,
            id: 'run-1',
            missingSession: false,
            onComplete: vi.fn(),
            onEvent: vi.fn(),
            persistence: Promise.resolve(),
            protocolHandling: Promise.resolve(),
            request: { conversation: sourceConversation },
            startedAt: '2026-07-30T10:00:00.000Z',
            stderr: 'Claude provider failed: quota exhausted',
            stderrBuffer: '',
            stdout: '',
            streaming: true,
            streamingFailure: new Error('Claude provider failed: quota exhausted'),
            suspended: false,
            termination: null,
            turnStarted: true,
            turnUsage: null,
        };
        service.processes.set('run-1', run);
        service.runningConversationIds.add('conversation-1');

        await service.handleClose('run-1', 1);

        expect(persistConversation).toHaveBeenCalledWith(expect.objectContaining({
            conversation: expect.objectContaining({
                entries: [
                    expect.objectContaining({ id: 'assistant-1' }),
                    expect.objectContaining({ content: 'Sent request', id: 'user-2' }),
                    expect.objectContaining({ content: 'Claude provider failed: quota exhausted', type: 'error' }),
                ],
                id: 'conversation-1',
                status: 'failed',
            }),
        }));
    });

    it('forces termination when graceful Finish exceeds its deadline', async () => {
        const setTimeout = vi.fn(() => 7);
        const terminateProcessTree = vi.fn(async () => true);
        const service = new AgentRunnerService({ setTimeout, terminateProcessTree });
        const child = { pid: 10, stdin: { end: vi.fn() } };
        service.processes.set('run-1', {
            child,
            finishTimeout: null,
            finishing: false,
            id: 'run-1',
            streaming: true,
            termination: null,
            turnActive: false,
            waitingForQuestion: false,
        });

        service.finish('run-1');

        expect(child.stdin.end).toHaveBeenCalledOnce();
        expect(setTimeout).toHaveBeenCalledWith(service.handleFinishTimeout, AGENT_FINISH_GRACE_MS, 'run-1');
        await service.handleFinishTimeout('run-1');
        expect(terminateProcessTree).toHaveBeenCalledWith(child);
        expect(service.processes.get('run-1').finishForced).toBe(true);
    });

    it('starts graceful Finish only after the active turn completes', async () => {
        const setTimeout = vi.fn(() => 7);
        const child = { stdin: { end: vi.fn() } };
        const service = new AgentRunnerService({ setTimeout });
        service.processes.set('run-1', {
            agent: 'codex',
            child,
            conversation: {
                entries: [{ content: 'Done', id: 'assistant-1', kind: 'message', role: 'assistant', timestamp: 'now' }],
                providerSessions: [],
                status: 'running',
            },
            currentAssistantMessageId: 'assistant-1',
            finishTimeout: null,
            finishing: true,
            id: 'run-1',
            missingSession: false,
            nextSequence: 2,
            onEvent: vi.fn(),
            pendingApprovals: new Map(),
            persistence: Promise.resolve(),
            providerConversationId: 'provider-1',
            request: {},
            streaming: true,
            turnActive: true,
            turnIndex: 1,
            waitingForQuestion: false,
        });

        await service.handleStreamingEvent('run-1', { type: 'turnCompleted' });

        expect(child.stdin.end).toHaveBeenCalledOnce();
        expect(setTimeout).toHaveBeenCalledWith(service.handleFinishTimeout, AGENT_FINISH_GRACE_MS, 'run-1');
    });

    it('redacts secret answers from stored and emitted events', async () => {
        let releaseAnswer;
        const answerQuestion = vi.fn(() => new Promise((resolve) => {
            releaseAnswer = resolve;
        }));
        const service = new AgentRunnerService({
            persistConversation: vi.fn(async () => undefined),
            persistConversationCheckpoint: vi.fn(async () => undefined),
        });
        const run = {
            conversation: { entries: [], providerSessions: [], status: 'waitingForInput' },
            id: 'run-1',
            onEvent: vi.fn(),
            pendingApprovals: new Map(),
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

        const answerMessage = run.conversation.entries.find((entry) => entry.kind === 'message' && entry.role === 'user');
        expect(answerMessage.content).toContain('token: [secret]');
        expect(run.stdout).toContain('echo [secret]');
        expect(JSON.stringify(run.onEvent.mock.calls)).not.toContain('top-secret');
    });

    it('creates separate assistant messages around intervening event', async () => {
        const service = new AgentRunnerService();
        const run = {
            providerEventEntryIndexes: new Map(),
            agent: 'codex',
            assistantItemIndex: 0,
            assistantItems: new Map(),
            conversation: { entries: [], providerSessions: [], status: 'running' },
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
        await service.handleStreamingEvent('run-1', {
            event: {
                content: 'Thinking',
                label: 'Reasoning',
                providerItemId: 'reasoning-1',
                status: 'completed',
                type: 'reasoning',
            },
            type: 'event',
        });
        await service.handleStreamingEvent('run-1', { content: 'First', itemId: 'message-1', type: 'assistant' });
        await service.handleStreamingEvent('run-1', { itemId: 'message-2', type: 'assistantStarted' });
        await service.handleStreamingEvent('run-1', { content: 'Done', itemId: 'message-2', type: 'assistant' });

        expect(run.conversation.entries).toEqual([
            expect.objectContaining({ content: 'First', sequence: 2 }),
            expect.objectContaining({ providerItemId: 'reasoning-1', sequence: 3 }),
            expect.objectContaining({ content: 'Done', sequence: 4 }),
        ]);
    });

    it('replaces streamed assistant text with authoritative provider completion', async () => {
        const service = new AgentRunnerService();
        const run = {
            agent: 'claude',
            assistantItemIndex: 0,
            assistantItems: new Map(),
            conversation: { entries: [], status: 'running' },
            currentAssistantMessageId: null,
            id: 'run-1',
            nextSequence: 1,
            onEvent: vi.fn(),
            secretValues: new Set(),
            stdout: '',
            streaming: true,
            turnIndex: 1,
        };
        service.processes.set('run-1', run);

        await service.handleStreamingEvent('run-1', { itemId: 'message-1:text:0', type: 'assistantStarted' });
        await service.handleStreamingEvent('run-1', { content: 'dra', itemId: 'message-1:text:0', type: 'assistant' });
        await service.handleStreamingEvent('run-1', {
            content: 'draft',
            itemId: 'message-1:text:0',
            type: 'assistantCompleted',
        });

        expect(run.stdout).toBe('draft');
        expect(run.conversation.entries).toEqual([expect.objectContaining({ content: 'draft', sequence: 1 })]);
        expect(run.onEvent).toHaveBeenLastCalledWith(expect.objectContaining({
            content: 'draft',
            previousContent: 'dra',
            replace: true,
            type: 'output',
        }));
    });

    it('updates an indexed event without scanning or appending conversation history', async () => {
        const service = new AgentRunnerService();
        const existingEvent = {
            content: 'Running',
            id: 'activity-1',
            kind: 'event',
            label: 'Command',
            providerItemId: 'command-1',
            sequence: 7,
            status: 'inProgress',
            timestamp: 'earlier',
            type: 'commandExecution',
        };
        const entries = [
            { content: 'started', id: 'started-1', kind: 'event', sequence: 1, timestamp: 'earlier', type: 'started' },
            existingEvent,
            { content: 'unrelated', id: 'event-1', kind: 'event', sequence: 8, timestamp: 'earlier', type: 'diagnostic' },
        ];
        entries.findIndex = vi.fn(() => { throw new Error('conversation history was scanned'); });
        const run = {
            providerEventEntryIndexes: new Map([['command-1', 1]]),
            conversation: { entries, status: 'running' },
            id: 'run-1',
            nextSequence: 9,
            onEvent: vi.fn(),
            secretValues: new Set(),
        };
        service.processes.set('run-1', run);

        await service.handleStreamingEvent('run-1', {
            event: {
                content: 'Completed',
                label: 'Command',
                providerItemId: 'command-1',
                status: 'completed',
                type: 'commandExecution',
            },
            type: 'event',
        });

        expect(entries.findIndex).not.toHaveBeenCalled();
        expect(run.conversation.entries).toHaveLength(3);
        expect(run.conversation.entries[1]).toMatchObject({
            content: 'Completed',
            id: 'activity-1',
            providerItemId: 'command-1',
            sequence: 7,
            status: 'completed',
        });
        expect(run.onEvent).toHaveBeenCalledWith(expect.objectContaining({
            event: expect.objectContaining({ content: 'Completed', id: 'activity-1' }),
            type: 'agentEvent',
        }));
    });

    it('redacts secrets before bounding provider results in runtime conversation', async () => {
        const service = new AgentRunnerService();
        const run = {
            providerEventEntryIndexes: new Map(),
            conversation: { entries: [], status: 'running' },
            id: 'run-1',
            nextSequence: 1,
            onEvent: vi.fn(),
            secretValues: new Set(['top-secret']),
        };
        service.processes.set('run-1', run);

        await service.handleStreamingEvent('run-1', {
            event: {
                content: `${'head'.repeat(1_500)}top-secret${'tail'.repeat(1_500)}`,
                label: 'Command',
                providerItemId: 'command-1',
                status: 'completed',
                type: 'commandExecution',
            },
            type: 'event',
        });

        expect(run.conversation.entries[0].content).toHaveLength(AGENT_RESULT_MAX_LENGTH);
        expect(run.conversation.entries[0].content).not.toContain('top-secret');
        expect(run.conversation.entries[0].content).toMatch(/tail$/u);
    });

    it('groups consecutive diagnostics while preserving first identity and recognized event boundaries', async () => {
        const service = new AgentRunnerService();
        const run = {
            providerEventEntryIndexes: new Map(),
            conversation: { entries: [], status: 'running' },
            id: 'run-1',
            nextSequence: 1,
            onEvent: vi.fn(),
            secretValues: new Set(),
        };
        service.processes.set('run-1', run);

        await service.handleStreamingEvent('run-1', diagnosticStreamingEvent('item/started: futureTool (future-1)', 'diagnostic:future-1:1'));
        await service.handleStreamingEvent('run-1', diagnosticStreamingEvent('item/completed: futureTool (future-1)', 'diagnostic:future-1:2'));
        await service.handleStreamingEvent('run-1', {
            event: { content: 'Search', label: 'Web search', providerItemId: 'search-1', status: 'completed', type: 'webSearch' },
            type: 'event',
        });
        await service.handleStreamingEvent('run-1', diagnosticStreamingEvent('item/started: futureTool (future-2)', 'diagnostic:future-2:3'));
        await service.handleStreamingEvent('run-1', diagnosticStreamingEvent('item/completed: futureTool (future-2)', 'diagnostic:future-2:4'));

        expect(run.conversation.entries).toEqual([
            expect.objectContaining({
                content: 'item/started: futureTool (future-1)\nitem/completed: futureTool (future-1)',
                id: 'run-1-event-1',
                providerItemId: 'diagnostic:future-1:1',
                sequence: 1,
            }),
            expect.objectContaining({ providerItemId: 'search-1', sequence: 2 }),
            expect.objectContaining({
                content: 'item/started: futureTool (future-2)\nitem/completed: futureTool (future-2)',
                id: 'run-1-event-3',
                providerItemId: 'diagnostic:future-2:3',
                sequence: 3,
            }),
        ]);
        expect(run.onEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({
            event: expect.objectContaining({
                content: 'item/started: futureTool (future-1)\nitem/completed: futureTool (future-1)',
                providerItemId: 'diagnostic:future-1:1',
            }),
            type: 'agentEvent',
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
                entries: [{ content: 'initial', id: 'user-1', kind: 'message', role: 'user', timestamp: 'now' }],
                status: 'waitingForInput',
            },
            id: 'run-1',
            onEvent: vi.fn(),
            pendingQuestions: [],
            persistence: Promise.resolve(),
            secretValues: new Set(),
            stderr: '',
            streaming: true,
            streamingAdapter: { sendMessage: vi.fn(async () => { throw writeError; }) },
            turnIndex: 1,
            waitingForQuestion: false,
        };
        service.processes.set('run-1', run);

        await expect(service.sendMessage('run-1', 'ghost')).rejects.toThrow(writeError);
        expect(run.conversation.entries.filter(({ kind }) => kind === 'message')).toHaveLength(1);
        expect(run.conversation.status).toBe('failed');
    });

    it('routes Codex account updates to runtime state and originating project metrics', async () => {
        const persistConversation = vi.fn();
        const snapshot = { available: true, buckets: [], observedAt: 10 };
        const codexRuntimeService = {
            getSnapshot: vi.fn(() => snapshot),
            publishRateLimits: vi.fn(() => true),
            publishUnavailable: vi.fn(),
        };
        const usageMetricsService = { recordAccountUsage: vi.fn(async () => true) };
        const service = new AgentRunnerService({ codexRuntimeService, persistConversation, usageMetricsService });
        const payload = { rateLimits: { limitId: 'codex' } };

        await service.handleCodexRuntimeEvent({ kind: 'update', observedAt: 10, payload });
        await service.handleCodexRuntimeEvent({ kind: 'unavailable', observedAt: 11 });

        expect(codexRuntimeService.publishRateLimits).toHaveBeenCalledWith(payload, 10, true);
        expect(codexRuntimeService.publishUnavailable).toHaveBeenCalledWith(11);
        expect(usageMetricsService.recordAccountUsage).toHaveBeenCalledWith('codex', snapshot);
        expect(persistConversation).not.toHaveBeenCalled();
    });

    it('routes Claude account updates to active project metrics and polls for Claude runs only', async () => {
        const snapshot = { available: true, observedAt: 10, windows: [] };
        const claudeRuntimeService = {
            getSnapshot: vi.fn(() => snapshot),
            publishRateLimits: vi.fn(() => true),
            publishUnavailable: vi.fn(),
        };
        const claudeUsagePoller = { requestPoll: vi.fn(), stop: vi.fn() };
        const usageMetricsService = { recordAccountUsage: vi.fn(async () => true) };
        const service = new AgentRunnerService({ claudeRuntimeService, claudeUsagePoller, usageMetricsService });
        const payload = { windows: [{ id: 'five_hour' }] };

        await service.handleClaudeRuntimeEvent({
            kind: 'snapshot',
            observedAt: 10,
            payload,
        });
        await service.handleClaudeRuntimeEvent({ kind: 'unavailable', observedAt: 11 });
        const environment = { PATH: '/bin' };
        service.requestUsagePoll({ agent: 'claude', environment, executable: '/tools/claude', rootPath: '/project' });
        service.requestUsagePoll({ agent: 'codex', environment, executable: '/tools/codex', rootPath: '/project' });

        expect(claudeRuntimeService.publishRateLimits).toHaveBeenCalledWith(payload, 10);
        expect(claudeRuntimeService.publishUnavailable).toHaveBeenCalledWith(11);
        expect(usageMetricsService.recordAccountUsage).toHaveBeenCalledOnce();
        expect(usageMetricsService.recordAccountUsage).toHaveBeenCalledWith('claude', snapshot);
        expect(claudeUsagePoller.requestPoll).toHaveBeenCalledOnce();
        expect(claudeUsagePoller.requestPoll).toHaveBeenCalledWith({
            cwd: '/project',
            env: environment,
            executable: '/tools/claude',
        });
    });

    it('refreshes each configured built-in provider in the active project folder', async () => {
        const claudeUsagePoller = { requestPoll: vi.fn(), stop: vi.fn() };
        const codexUsagePoller = { requestPoll: vi.fn(), stop: vi.fn() };
        const executableResolver = { find: vi.fn(async (executable) => `/tools/${executable}.cmd`) };
        const service = new AgentRunnerService({
            claudeUsagePoller,
            codexUsagePoller,
            executableResolver,
            now: () => 10,
            setTimeout: vi.fn(),
        });
        const profiles = [
            { command: ['claude', '--configured'], name: 'claude' },
            { command: ['codex', '--configured'], name: 'codex' },
            { command: ['custom'], name: 'custom' },
        ];

        service.requestProjectUsageRefresh({ rootPath: '/projects/md2' }, profiles);
        await vi.waitFor(() => expect(codexUsagePoller.requestPoll).toHaveBeenCalledOnce());

        expect(executableResolver.find).toHaveBeenCalledTimes(2);
        const environment = executableResolver.find.mock.calls[0][1].env;
        expect(environment).not.toHaveProperty('NODE_OPTIONS');
        // The folder is the whole point: Claude's trust question is asked per folder, and a poll
        // started outside the project hits a folder Claude may never have run in.
        expect(claudeUsagePoller.requestPoll).toHaveBeenCalledWith({
            cwd: '/projects/md2',
            env: environment,
            executable: '/tools/claude.cmd',
            observedAt: 10,
            onRuntimeEvent: service.handleAccountClaudeRuntimeEvent,
        });
        expect(codexUsagePoller.requestPoll).toHaveBeenCalledWith({
            argumentsList: ['--configured'],
            cwd: '/projects/md2',
            env: environment,
            executable: '/tools/codex.cmd',
            observedAt: 10,
        });
    });

    it('moves later polls to the new project folder on a project switch', async () => {
        const ticks = [];
        const claudeUsagePoller = { requestPoll: vi.fn(), stop: vi.fn() };
        const codexUsagePoller = { requestPoll: vi.fn(), stop: vi.fn() };
        const service = new AgentRunnerService({
            claudeUsagePoller,
            codexUsagePoller,
            executableResolver: { find: vi.fn(async () => '/tools/claude') },
            setTimeout: (callback) => {
                ticks.push(callback);

                return ticks.length;
            },
        });
        const profiles = [{ command: ['claude'], name: 'claude' }];

        service.requestProjectUsageRefresh({ rootPath: '/first' }, profiles);
        await vi.waitFor(() => expect(claudeUsagePoller.requestPoll).toHaveBeenCalledOnce());
        service.requestProjectUsageRefresh({ rootPath: '/second' }, profiles);
        await vi.waitFor(() => expect(claudeUsagePoller.requestPoll).toHaveBeenCalledTimes(2));
        ticks.at(-1)();

        expect(claudeUsagePoller.requestPoll).toHaveBeenCalledTimes(3);
        expect(claudeUsagePoller.requestPoll).toHaveBeenLastCalledWith(expect.objectContaining({ cwd: '/second' }));
    });

    it('rejects a refresh without a project folder', () => {
        const service = new AgentRunnerService({
            claudeUsagePoller: { requestPoll: vi.fn(), stop: vi.fn() },
            codexUsagePoller: { requestPoll: vi.fn(), stop: vi.fn() },
        });

        expect(() => service.requestProjectUsageRefresh(null, [])).toThrow('Missing local Git project rootPath');
    });

    it('skips missing profiles and publishes unavailable for missing executables without metrics', async () => {
        const claudeRuntimeService = { publishRateLimits: vi.fn(), publishUnavailable: vi.fn() };
        const usageMetricsService = { recordAccountUsage: vi.fn() };
        const claudeUsagePoller = { requestPoll: vi.fn(), stop: vi.fn() };
        const codexUsagePoller = { requestPoll: vi.fn(), stop: vi.fn() };
        const service = new AgentRunnerService({
            claudeRuntimeService,
            claudeUsagePoller,
            codexUsagePoller,
            executableResolver: { find: vi.fn(async () => null) },
            now: () => 20,
            usageMetricsService,
        });

        service.requestProjectUsageRefresh({ rootPath: '/project' }, [{ command: ['claude'], name: 'claude' }]);
        await vi.waitFor(() => expect(claudeRuntimeService.publishUnavailable).toHaveBeenCalledWith(20));

        expect(claudeUsagePoller.requestPoll).not.toHaveBeenCalled();
        expect(codexUsagePoller.requestPoll).not.toHaveBeenCalled();
        expect(usageMetricsService.recordAccountUsage).not.toHaveBeenCalled();
    });

    it('publishes startup results without metrics and maps rejected runtime payloads to unavailable', async () => {
        const claudeRuntimeService = { publishRateLimits: vi.fn(() => true), publishUnavailable: vi.fn() };
        const codexRuntimeService = { publishRateLimits: vi.fn(() => false), publishUnavailable: vi.fn() };
        const usageMetricsService = { recordAccountUsage: vi.fn() };
        const service = new AgentRunnerService({ claudeRuntimeService, codexRuntimeService, usageMetricsService });
        const claudePayload = { windows: [] };
        const codexPayload = { rateLimits: {} };

        await service.handleAccountClaudeRuntimeEvent({ kind: 'snapshot', observedAt: 30, payload: claudePayload });
        await service.handleAccountCodexRuntimeEvent({ kind: 'snapshot', observedAt: 31, payload: codexPayload });

        expect(claudeRuntimeService.publishRateLimits).toHaveBeenCalledWith(claudePayload, 30);
        expect(codexRuntimeService.publishRateLimits).toHaveBeenCalledWith(codexPayload, 31, false);
        expect(codexRuntimeService.publishUnavailable).toHaveBeenCalledWith(31);
        expect(usageMetricsService.recordAccountUsage).not.toHaveBeenCalled();
    });

    it('stops both pollers and ignores executable resolution completing during shutdown', async () => {
        const resolution = Promise.withResolvers();
        const claudeUsagePoller = { requestPoll: vi.fn(), stop: vi.fn() };
        const codexUsagePoller = { requestPoll: vi.fn(), stop: vi.fn(async () => undefined) };
        const service = new AgentRunnerService({
            claudeUsagePoller,
            codexUsagePoller,
            executableResolver: { find: vi.fn(async () => resolution.promise) },
        });

        service.requestProjectUsageRefresh({ rootPath: '/project' }, [{ command: ['claude'], name: 'claude' }]);
        const stopped = service.stopAll();
        resolution.resolve('C:\\tools\\claude.cmd');
        await stopped;
        await Promise.resolve();

        expect(claudeUsagePoller.stop).toHaveBeenCalledOnce();
        expect(codexUsagePoller.stop).toHaveBeenCalledOnce();
        expect(claudeUsagePoller.requestPoll).not.toHaveBeenCalled();
    });

    it('polls Claude usage at run start and again after the run closes', async () => {
        const child = new EventEmitter();
        child.pid = 43;
        child.stdin = new PassThrough();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        const claudeUsagePoller = { requestPoll: vi.fn(), stop: vi.fn() };
        const executable = '/tools/custom-claude';
        const service = new AgentRunnerService({
            claudeUsagePoller,
            executableResolver: { find: vi.fn(async () => executable) },
            persistConversation: vi.fn(async () => undefined),
            persistConversationCheckpoint: vi.fn(async () => undefined),
            setTimeout: vi.fn(),
            spawn: vi.fn(() => child),
        });
        const project = { rootPath: resolve(import.meta.dirname, '../../../..') };
        const request = { agent: 'claude', command: ['fake-agent'], projectFolder: 'design', prompt: 'Start work' };

        await service.start(project, request, vi.fn(), vi.fn(), vi.fn());

        expect(claudeUsagePoller.requestPoll).toHaveBeenCalledOnce();
        expect(claudeUsagePoller.requestPoll).toHaveBeenCalledWith({
            cwd: project.rootPath,
            env: expect.objectContaining({}),
            executable,
        });

        child.emit('close', 0);
        await vi.waitFor(() => expect(claudeUsagePoller.requestPoll).toHaveBeenCalledTimes(2));
        expect(claudeUsagePoller.requestPoll).toHaveBeenNthCalledWith(2, {
            cwd: project.rootPath,
            env: expect.objectContaining({}),
            executable,
        });
    });

    // Before this, one failed poll left the display empty until the user happened to start a run.
    it('keeps the interval running through repeated failures and with no Claude run active', async () => {
        const ticks = [];
        // The poller swallows its own failures, so a failing poll looks exactly like this one.
        const claudeUsagePoller = { requestPoll: vi.fn(), stop: vi.fn() };
        const cleared = [];
        const service = new AgentRunnerService({
            claudeUsagePoller,
            clearTimeout: (handle) => cleared.push(handle),
            codexUsagePoller: { requestPoll: vi.fn(), stop: vi.fn(async () => undefined) },
            executableResolver: { find: vi.fn(async () => '/tools/claude') },
            setTimeout: (callback) => {
                ticks.push(callback);

                return ticks.length;
            },
        });

        service.requestProjectUsageRefresh({ rootPath: '/project' }, [{ command: ['claude'], name: 'claude' }]);
        await vi.waitFor(() => expect(claudeUsagePoller.requestPoll).toHaveBeenCalledOnce());
        // Three consecutive polls that report nothing, with no run in the service at any point.
        for (let index = 0; index < 3; index += 1) ticks.at(-1)();

        expect(service.processes.size).toBe(0);
        expect(claudeUsagePoller.requestPoll).toHaveBeenCalledTimes(4);
        expect(claudeUsagePoller.requestPoll).toHaveBeenLastCalledWith({
            cwd: '/project',
            env: expect.objectContaining({}),
            executable: '/tools/claude',
        });
        // A fourth poll is still scheduled after the third failure.
        expect(service.usagePollTimer).not.toBeNull();

        await service.stopAll();

        expect(cleared).toContain(ticks.length);
        expect(service.usagePollTimer).toBeNull();
        ticks.at(-1)();
        expect(claudeUsagePoller.requestPoll).toHaveBeenCalledTimes(4);
    });

    it('leaves usage polling alone for agents that report usage inside their protocol', async () => {
        const child = new EventEmitter();
        child.pid = 44;
        child.stdin = new PassThrough();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        const ticks = [];
        const claudeUsagePoller = { requestPoll: vi.fn(), stop: vi.fn() };
        const service = new AgentRunnerService({
            claudeUsagePoller,
            executableResolver: { find: vi.fn(async () => '/tools/codex') },
            persistConversation: vi.fn(async () => undefined),
            persistConversationCheckpoint: vi.fn(async () => undefined),
            setTimeout: (callback) => ticks.push(callback),
            spawn: vi.fn(() => child),
        });
        const project = { rootPath: resolve(import.meta.dirname, '../../../..') };
        const request = { agent: 'codex', command: ['fake-agent'], projectFolder: 'design', prompt: 'Start work' };

        await service.start(project, request, vi.fn(), vi.fn(), vi.fn());

        expect(claudeUsagePoller.requestPoll).not.toHaveBeenCalled();
        expect(ticks).toHaveLength(0);
    });

    it('keeps approval state separate from conversation persistence and other pending input', async () => {
        const persistConversationCheckpoint = vi.fn(async () => undefined);
        const answerApproval = vi.fn(async () => undefined);
        const service = new AgentRunnerService({ persistConversationCheckpoint });
        const run = {
            conversation: { entries: [], providerSessions: [], status: 'running' },
            id: 'run-1',
            interactionWrites: Promise.resolve(),
            onEvent: vi.fn(),
            pendingApprovals: new Map(),
            pendingQuestions: [],
            persistence: Promise.resolve(),
            streaming: true,
            streamingAdapter: { answerApproval },
            turnActive: true,
            waitingForQuestion: true,
        };
        service.processes.set('run-1', run);
        const approval = {
            command: 'npm test',
            itemId: 'command-1',
            kind: 'commandExecution',
            requestId: 41,
            threadId: 'thread-1',
            turnId: 'turn-1',
        };

        await service.handleStreamingEvent('run-1', { approval, type: 'approval' });
        await service.answerApproval('run-1', 41, 'accept');
        await service.handleStreamingEvent('run-1', { requestId: 41, type: 'approvalSubmitted' });
        await service.handleStreamingEvent('run-1', { requestId: 41, type: 'approvalResolved' });

        expect(answerApproval).toHaveBeenCalledWith(41, 'accept');
        expect(run.conversation.entries).toEqual([]);
        expect(run.conversation.status).toBe('waitingForInput');
        expect(persistConversationCheckpoint).toHaveBeenCalledTimes(2);
        expect(run.onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'approval' }));
        const approvalCallIndex = run.onEvent.mock.calls.findIndex(([event]) => event.type === 'approval');
        expect(persistConversationCheckpoint.mock.invocationCallOrder[0])
            .toBeLessThan(run.onEvent.mock.invocationCallOrder[approvalCallIndex]);
        expect(run.onEvent).toHaveBeenCalledWith(expect.objectContaining({ state: 'waitingForInput', type: 'approvalResolved' }));
    });

    it('rejects an invalid approval decision without failing the active run', async () => {
        const service = new AgentRunnerService();
        const run = {
            conversation: { entries: [], status: 'waitingForInput' },
            id: 'run-1',
            pendingApprovals: new Map([[41, { requestId: 41 }]]),
            streaming: true,
            streamingAdapter: { answerApproval: vi.fn(async () => { throw new Error('Unsupported decision'); }) },
        };
        service.processes.set('run-1', run);

        await expect(service.answerApproval('run-1', 41, 'accept')).rejects.toThrow('Unsupported decision');

        expect(run.conversation.status).toBe('waitingForInput');
        expect(run.pendingApprovals.has(41)).toBe(true);
    });
});
