import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ActionAgentExecutor } = require('./action_agent_executor');

const action = { agent: 'codex', id: 'main', label: 'Main', model: 'gpt-5.5', prompt: 'Review {{card-file}}', type: 'agent' };
const cardContext = { cardInternalId: 'card-1', file: 'design/card.md', kind: 'card' };
const project = { branch: 'main', rootPath: 'C:/repo' };

function conversation(overrides = {}) {
    return {
        cardInternalId: cardContext.cardInternalId,
        cardPath: cardContext.file,
        entries: [{ content: 'old answer', id: 'm1', kind: 'message', role: 'assistant', timestamp: '2026-01-01T00:00:00.000Z' }],
        id: 'conversation-1',
        providerSessions: [],
        ...overrides,
    };
}

function createExecutor(overrides = {}) {
    const agentRunnerService = {
        start: vi.fn(async (_project, _request, _onEvent, onComplete) => {
            onComplete(0, {
                conversation: { id: 'run-conversation' }, missingSession: false, reference: 'run.json',
                stderr: '', stdout: 'done', turnStarted: true,
            });

            return { runId: 'active-run' };
        }),
        stop: vi.fn(),
    };
    const localGitService = { loadAgentConversation: vi.fn(async () => conversation()) };
    const executor = new ActionAgentExecutor({
        agentConfigProvider: () => ({ agent: 'codex', agentProfiles: [], model: '' }),
        agentRunnerService,
        localGitService,
        ...overrides,
    });

    return { agentRunnerService, executor, localGitService };
}

function executionInput(overrides = {}) {
    return {
        action,
        activityOrigin: { cardInternalId: 'card-1', kind: 'card' },
        context: cardContext,
        onActiveRunChange: vi.fn(),
        onEvent: vi.fn(),
        project,
        projectFolder: 'design',
        primaryProject: project,
        releasesFolder: 'design/releases',
        runInput: { extraPrompt: '' },
        signal: new AbortController().signal,
        ...overrides,
    };
}

describe('ActionAgentExecutor', () => {
    it('rejects unsupported streaming profiles before process start', async () => {
        const profile = { command: ['custom-agent'], models: ['default'], name: 'custom' };
        const agentConfigProvider = () => ({ agent: 'custom', agentProfiles: [profile], model: 'default' });
        const { agentRunnerService, executor } = createExecutor({ agentConfigProvider });
        const streamingAction = { ...action, agent: 'custom', model: 'default', streaming: true };

        await expect(executor.execute(executionInput({ action: streamingAction })))
            .rejects.toThrow('Agent profile does not support streaming: custom');
        expect(agentRunnerService.start).not.toHaveBeenCalled();
    });

    it('runs initial card action with runtime overrides and active-run hooks', async () => {
        const { agentRunnerService, executor } = createExecutor();
        const input = executionInput({ runInput: { agent: 'codex', extraPrompt: 'focus', model: 'gpt-5.5', thinkingLevel: 'high' } });

        await expect(executor.execute(input)).resolves.toMatchObject({agent: 'codex', conversationId: 'run-conversation', exitCode: 0, model: 'gpt-5.5', prompt: 'Review design/card.md\n\nfocus', thinkingLevel: 'high'});
        expect(agentRunnerService.start).toHaveBeenCalledWith(project, expect.objectContaining({activityOrigin: { cardInternalId: 'card-1', kind: 'card' }, cardPath: cardContext.file, prompt: 'Review design/card.md\n\nfocus'}), expect.any(Function), expect.any(Function), expect.any(Function));
        expect(input.onActiveRunChange.mock.calls.map(([runId]) => runId)).toEqual(['active-run', null]);
    });

    it('uses a root prompt override unchanged without tracked-file composition', async () => {
        const { agentRunnerService, executor } = createExecutor();
        const trackedAction = { ...action, prompt: 'Stored {{card-file}}', trackFileChanges: true };

        await executor.execute(executionInput({ action: trackedAction, runInput: { extraPrompt: 'legacy', prompt: 'Exact edited prompt' } }));

        expect(agentRunnerService.start.mock.calls[0][1].prompt).toBe('Exact edited prompt');
    });

    it('preserves an empty root prompt override by presence', async () => {
        const { agentRunnerService, executor } = createExecutor();

        await executor.execute(executionInput({ runInput: { extraPrompt: 'legacy', prompt: '' } }));

        expect(agentRunnerService.start.mock.calls[0][1].prompt).toBe('');
    });

    it('runs project-wide action without card path', async () => {
        const { agentRunnerService, executor } = createExecutor();
        const projectAction = { ...action, prompt: '{{card-prompt}}' };

        await executor.execute(executionInput({action: projectAction, activityOrigin: { kind: 'project' }, context: { kind: 'project' }, runInput: { extraPrompt: 'review project' }}));

        const request = agentRunnerService.start.mock.calls[0][1];
        expect(request).toMatchObject({ activityOrigin: { kind: 'project' }, prompt: 'review project' });
        expect(request).not.toHaveProperty('cardPath');
    });

    it('instructs tracked runs not to stage or self-commit', async () => {
        const { agentRunnerService, executor } = createExecutor();
        const trackedAction = { ...action, trackFileChanges: true };

        await executor.execute(executionInput({ action: trackedAction }));

        expect(agentRunnerService.start.mock.calls[0][1].prompt).toBe(
            'Review design/card.md\n\nDo not stage or commit changes. md2 will commit files captured from provider edit tools.',
        );
    });

    it('resumes same provider after cursor with normalized reference and explicit prompt', async () => {
        const profile = {command: ['agent', 'start'], models: ['default'], name: 'custom', resumeCommand: ['agent', 'resume', '{{sessionId}}']};
        const agentConfigProvider = () => ({ agent: 'custom', agentProfiles: [profile], model: 'default' });
        const { agentRunnerService, executor, localGitService } = createExecutor({ agentConfigProvider });
        localGitService.loadAgentConversation.mockResolvedValueOnce(conversation({
            entries: [
                { content: 'old', id: 'm1', kind: 'message', role: 'assistant', timestamp: '2026-01-01T00:00:00.000Z' },
                { agent: 'other', content: 'new', id: 'm2', kind: 'message', role: 'assistant', timestamp: '2026-01-01T00:00:01.000Z' },
            ],
            providerSessions: [{ agent: 'custom', conversationId: 'session-1', synchronizedThroughMessageId: 'm1' }],
        }));
        const customAction = { ...action, agent: 'custom', model: 'default' };

        await executor.execute(executionInput({
            action: customAction,
            runInput: { continueFrom: 'design/activity/card__card-1.json#conversation=conversation-1', extraPrompt: 'next' },
        }));

        expect(localGitService.loadAgentConversation).toHaveBeenCalledWith(project, 'design/activity/card__card-1.json#conversation=conversation-1');
        expect(agentRunnerService.start.mock.calls[0][1]).toMatchObject({
            command: ['agent', 'resume', 'session-1'], contextInput: expect.stringContaining('new'),
            prompt: 'next', providerConversationId: 'session-1', reference: 'design/activity/card__card-1.json#conversation=conversation-1',
        });
    });

    it('resumes restarted Codex streaming after its cursor', async () => {
        const { agentRunnerService, executor, localGitService } = createExecutor();
        localGitService.loadAgentConversation.mockResolvedValueOnce(conversation({
            entries: [
                { content: 'old', id: 'm1', kind: 'message', role: 'assistant', timestamp: '2026-01-01T00:00:00.000Z' },
                { agent: 'claude', content: 'new', id: 'm2', kind: 'message', role: 'assistant', timestamp: '2026-01-01T00:00:01.000Z' },
            ],
            providerSessions: [{ agent: 'codex', conversationId: 'thread-1', synchronizedThroughMessageId: 'm1' }],
        }));

        await executor.execute(executionInput({
            action: { ...action, streaming: true },
            runInput: { continueFrom: 'source.json', extraPrompt: 'next' },
        }));

        const request = agentRunnerService.start.mock.calls[0][1];
        expect(request).toMatchObject({
            command: ['codex', '--model', 'gpt-5.5', 'app-server', '--stdio'],
            contextInput: expect.stringContaining('new'),
            providerConversationId: 'thread-1',
        });
        expect(request.contextInput).not.toContain('old');
    });

    it('resumes restarted Claude streaming with its saved session', async () => {
        const { agentRunnerService, executor, localGitService } = createExecutor();
        localGitService.loadAgentConversation.mockResolvedValueOnce(conversation({
            entries: [
                { content: 'old', id: 'm1', kind: 'message', role: 'assistant', timestamp: '2026-01-01T00:00:00.000Z' },
                { agent: 'codex', content: 'new', id: 'm2', kind: 'message', role: 'assistant', timestamp: '2026-01-01T00:00:01.000Z' },
            ],
            providerSessions: [{ agent: 'claude', conversationId: 'session-1', synchronizedThroughMessageId: 'm1' }],
        }));
        const claudeAction = { ...action, agent: 'claude', model: 'default', streaming: true };

        await executor.execute(executionInput({
            action: claudeAction,
            runInput: { continueFrom: 'source.json', extraPrompt: 'next' },
        }));

        const request = agentRunnerService.start.mock.calls[0][1];
        expect(request).toMatchObject({
            command: [
                'claude', '--model', 'default', '--print', '--verbose', '--output-format', 'stream-json',
                '--input-format', 'stream-json', '--permission-prompt-tool', 'stdio', '--resume', 'session-1',
            ],
            contextInput: expect.stringContaining('new'),
            providerConversationId: 'session-1',
        });
        expect(request.contextInput).not.toContain('old');
    });

    it('starts streaming with full context when selected agent has no session', async () => {
        const { agentRunnerService, executor, localGitService } = createExecutor();
        localGitService.loadAgentConversation.mockResolvedValueOnce(conversation({
            entries: [
                { content: 'first', id: 'm1', kind: 'message', role: 'user', timestamp: '2026-01-01T00:00:00.000Z' },
                { agent: 'claude', content: 'answer', id: 'm2', kind: 'message', role: 'assistant', timestamp: '2026-01-01T00:00:01.000Z' },
            ],
            providerSessions: [{ agent: 'claude', conversationId: 'session-1', synchronizedThroughMessageId: 'm2' }],
        }));

        await executor.execute(executionInput({
            action: { ...action, streaming: true },
            runInput: { continueFrom: 'source.json', extraPrompt: 'next' },
        }));

        const request = agentRunnerService.start.mock.calls[0][1];
        expect(request.contextInput).toContain('first');
        expect(request.contextInput).toContain('answer');
        expect(request).not.toHaveProperty('providerConversationId');
    });

    it('switches provider with full normalized context and default continue prompt', async () => {
        const { agentRunnerService, executor, localGitService } = createExecutor();
        localGitService.loadAgentConversation.mockResolvedValueOnce(conversation({
            entries: [{ agent: 'claude', content: 'answer', id: 'm1', kind: 'message', role: 'assistant', timestamp: '2026-01-01T00:00:00.000Z' }],
            providerSessions: [{ agent: 'claude', conversationId: 'claude-1', synchronizedThroughMessageId: 'm1' }],
        }));

        await executor.execute(executionInput({ runInput: { continueFrom: 'source.json', extraPrompt: '' } }));

        expect(agentRunnerService.start.mock.calls[0][1]).toMatchObject({contextInput: expect.stringContaining('[Assistant (claude)]'), prompt: 'continue', reference: 'source.json'});
        expect(agentRunnerService.start.mock.calls[0][1]).not.toHaveProperty('providerConversationId');
    });

    it('rejects conversation from another context card', async () => {
        const { agentRunnerService, executor, localGitService } = createExecutor();
        localGitService.loadAgentConversation.mockResolvedValueOnce(conversation({ cardInternalId: 'card-2' }));

        await expect(executor.execute(executionInput({ runInput: { continueFrom: 'source.json', extraPrompt: '' } })))
            .rejects.toThrow('Agent conversation belongs to card-2, not card-1');
        expect(agentRunnerService.start).not.toHaveBeenCalled();
    });

    it('retries one confirmed pre-turn missing session with producing run data and full context', async () => {
        const { agentRunnerService, executor, localGitService } = createExecutor();
        const sourceConversation = conversation({providerSessions: [{ agent: 'codex', conversationId: 'missing', synchronizedThroughMessageId: 'm1' }]});
        localGitService.loadAgentConversation.mockResolvedValueOnce(sourceConversation);
        agentRunnerService.start
            .mockImplementationOnce(async (_project, _request, _onEvent, onComplete) => {
                onComplete(1, {
                    conversation: sourceConversation, missingSession: true, reference: 'producing.json',
                    stderr: 'missing', stdout: '', turnStarted: false,
                });

                return { runId: 'first' };
            })
            .mockImplementationOnce(async (_project, _request, _onEvent, onComplete) => {
                onComplete(0, {
                    conversation: sourceConversation, missingSession: false, reference: 'producing.json',
                    stderr: '', stdout: 'done', turnStarted: true,
                });

                return { runId: 'second' };
            });

        await executor.execute(executionInput({ runInput: { continueFrom: 'source.json', extraPrompt: 'next' } }));

        expect(agentRunnerService.start).toHaveBeenCalledTimes(2);
        expect(agentRunnerService.start.mock.calls[1][1]).toMatchObject({
            contextInput: expect.stringContaining('old answer'), conversation: sourceConversation,
            reference: 'producing.json', reuseLastUserMessage: true,
        });
        expect(agentRunnerService.start.mock.calls[1][1]).not.toHaveProperty('providerConversationId');
    });

    it('retries a missing streaming session once with full context and one user message', async () => {
        const { agentRunnerService, executor, localGitService } = createExecutor();
        const sourceConversation = conversation({providerSessions: [{ agent: 'codex', conversationId: 'missing', synchronizedThroughMessageId: 'm1' }]});
        localGitService.loadAgentConversation.mockResolvedValueOnce(sourceConversation);
        agentRunnerService.start
            .mockImplementationOnce(async (_project, _request, _onEvent, onComplete) => {
                const failedConversation = {
                    ...sourceConversation,
                    entries: [
                        ...sourceConversation.entries,
                        { content: 'next', id: 'current', kind: 'message', role: 'user', timestamp: 'now' },
                    ],
                };
                onComplete(1, {
                    conversation: failedConversation,
                    missingSession: true,
                    reference: 'producing.json',
                    stderr: 'missing',
                    stdout: '',
                    turnStarted: false,
                });

                return { runId: 'first' };
            })
            .mockImplementationOnce(async (_project, request, _onEvent, onComplete) => {
                onComplete(0, {
                    conversation: request.conversation,
                    missingSession: false,
                    reference: 'producing.json',
                    stderr: '',
                    stdout: 'done',
                    turnStarted: true,
                });

                return { runId: 'second' };
            });

        await executor.execute(executionInput({
            action: { ...action, streaming: true },
            runInput: { continueFrom: 'source.json', extraPrompt: 'next' },
        }));

        const fallbackRequest = agentRunnerService.start.mock.calls[1][1];
        expect(fallbackRequest.contextInput).toContain('old answer');
        expect(fallbackRequest.reuseLastUserMessage).toBe(true);
        expect(fallbackRequest.conversation.entries.filter(({ content, kind, role }) => kind === 'message' && role === 'user' && content === 'next')).toHaveLength(1);
        expect(fallbackRequest).not.toHaveProperty('providerConversationId');
    });

    it.each([
        ['no requested session', { continueFrom: undefined }, { missingSession: true, turnStarted: false }],
        ['unrelated failure', { continueFrom: 'source.json' }, { missingSession: false, turnStarted: false }],
        ['post-turn failure', { continueFrom: 'source.json' }, { missingSession: true, turnStarted: true }],
    ])('does not retry %s', async (_label, runInput, processResult) => {
        const { agentRunnerService, executor, localGitService } = createExecutor();
        if (runInput.continueFrom) {
            localGitService.loadAgentConversation.mockResolvedValueOnce(conversation({providerSessions: [{ agent: 'codex', conversationId: 'session-1', synchronizedThroughMessageId: 'm1' }]}));
        }
        agentRunnerService.start.mockImplementationOnce(async (_project, _request, _onEvent, onComplete) => {
            onComplete(1, {conversation: { id: 'failed' }, reference: 'failed.json', stderr: 'failed', stdout: '', ...processResult});

            return { runId: 'failed' };
        });

        await executor.execute(executionInput({ runInput: { extraPrompt: '', ...runInput } }));

        expect(agentRunnerService.start).toHaveBeenCalledTimes(1);
    });

    it('propagates completion rejection and clears active run', async () => {
        const { agentRunnerService, executor } = createExecutor();
        agentRunnerService.start.mockImplementationOnce(async (_project, _request, _onEvent, _onComplete, onReject) => {
            onReject(new Error('persist failed'));

            return { runId: 'failed' };
        });
        const input = executionInput();

        await expect(executor.execute(input)).rejects.toThrow('persist failed');
        expect(input.onActiveRunChange.mock.calls.map(([runId]) => runId)).toEqual(['failed', null]);
    });

    it('stops run when cancellation occurs before start returns', async () => {
        const controller = new AbortController();
        const { agentRunnerService, executor } = createExecutor();
        agentRunnerService.start.mockImplementationOnce(async (_project, _request, _onEvent, onComplete) => {
            controller.abort();
            onComplete(1, {
                conversation: { id: 'cancelled' }, missingSession: false, reference: 'cancelled.json',
                stderr: '', stdout: '', turnStarted: false,
            });

            return { runId: 'late-run' };
        });

        await executor.execute(executionInput({ signal: controller.signal }));

        expect(agentRunnerService.stop).toHaveBeenCalledWith('late-run');
    });
});
