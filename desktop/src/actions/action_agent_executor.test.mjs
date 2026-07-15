import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { ActionAgentExecutor } = require('./action_agent_executor')

const action = { agent: 'codex', id: 'main', label: 'Main', model: 'GPT 5.5', prompt: 'Review {{file}}', type: 'agent' }
const cardContext = { file: 'design/card.md', kind: 'card' }
const project = { branch: 'main', rootPath: 'C:/repo' }

function conversation(overrides = {}) {
    return {
        cardPath: cardContext.file,
        events: [],
        id: 'conversation-1',
        messages: [{ content: 'old answer', id: 'm1', role: 'assistant', timestamp: '2026-01-01T00:00:00.000Z' }],
        providerSessions: [],
        ...overrides,
    }
}

function createExecutor(overrides = {}) {
    const agentRunnerService = {
        start: vi.fn(async (_project, _request, _onEvent, onComplete) => {
            onComplete(0, {
                conversation: { id: 'run-conversation' }, missingSession: false, reference: 'run.json',
                stderr: '', stdout: 'done', turnStarted: true,
            })

            return { runId: 'active-run' }
        }),
        stop: vi.fn(),
    }
    const localGitService = { loadAgentConversation: vi.fn(async () => conversation()) }
    const executor = new ActionAgentExecutor({
        agentConfigProvider: () => ({ agent: 'codex', agentProfiles: [], model: '' }),
        agentRunnerService,
        localGitService,
        ...overrides,
    })

    return { agentRunnerService, executor, localGitService }
}

function executionInput(overrides = {}) {
    return {
        action,
        context: cardContext,
        onActiveRunChange: vi.fn(),
        onEvent: vi.fn(),
        project,
        runInput: { extraPrompt: '' },
        signal: new AbortController().signal,
        ...overrides,
    }
}

describe('ActionAgentExecutor', () => {
    it('runs initial card action with runtime overrides and active-run hooks', async () => {
        const { agentRunnerService, executor } = createExecutor()
        const input = executionInput({ runInput: { agent: 'codex', extraPrompt: 'focus', model: 'GPT 5.5', thinkingLevel: 'high' } })

        await expect(executor.execute(input)).resolves.toMatchObject({
            agent: 'codex', exitCode: 0, model: 'GPT 5.5', prompt: 'Review design/card.md\n\nfocus', thinkingLevel: 'high',
        })
        expect(agentRunnerService.start).toHaveBeenCalledWith(project, expect.objectContaining({
            cardPath: cardContext.file, prompt: 'Review design/card.md\n\nfocus', scopePath: cardContext.file,
        }), expect.any(Function), expect.any(Function), expect.any(Function))
        expect(input.onActiveRunChange.mock.calls.map(([runId]) => runId)).toEqual(['active-run', null])
    })

    it('runs project-wide action without card path', async () => {
        const { agentRunnerService, executor } = createExecutor()
        const projectAction = { ...action, prompt: '{{prompt}}' }

        await executor.execute(executionInput({
            action: projectAction, context: { kind: 'project' }, runInput: { extraPrompt: 'review project' },
        }))

        const request = agentRunnerService.start.mock.calls[0][1]
        expect(request).toMatchObject({ prompt: 'review project', scopePath: 'project' })
        expect(request).not.toHaveProperty('cardPath')
    })

    it('resumes same provider after cursor with normalized reference and explicit prompt', async () => {
        const profile = {
            command: 'agent start', models: ['default'], name: 'custom', resumeCommand: 'agent resume {{sessionId}}',
        }
        const agentConfigProvider = () => ({ agent: 'custom', agentProfiles: [profile], model: 'default' })
        const { agentRunnerService, executor, localGitService } = createExecutor({ agentConfigProvider })
        localGitService.loadAgentConversation.mockResolvedValueOnce(conversation({
            messages: [
                { content: 'old', id: 'm1', role: 'assistant', timestamp: '2026-01-01T00:00:00.000Z' },
                { agent: 'other', content: 'new', id: 'm2', role: 'assistant', timestamp: '2026-01-01T00:00:01.000Z' },
            ],
            providerSessions: [{ agent: 'custom', conversationId: 'session-1', synchronizedThroughMessageId: 'm1' }],
        }))
        const customAction = { ...action, agent: 'custom', model: 'default' }

        await executor.execute(executionInput({
            action: customAction,
            runInput: { continueFrom: 'worktree:2:.md2-agent-logs/source.json', extraPrompt: 'next' },
        }))

        expect(localGitService.loadAgentConversation).toHaveBeenCalledWith(project, '.md2-agent-logs/source.json')
        expect(agentRunnerService.start.mock.calls[0][1]).toMatchObject({
            command: 'agent resume session-1', contextInput: expect.stringContaining('new'),
            prompt: 'next', providerConversationId: 'session-1', reference: '.md2-agent-logs/source.json',
        })
    })

    it('switches provider with full normalized context and default continue prompt', async () => {
        const { agentRunnerService, executor, localGitService } = createExecutor()
        localGitService.loadAgentConversation.mockResolvedValueOnce(conversation({
            messages: [{ agent: 'claude', content: 'answer', id: 'm1', role: 'assistant', timestamp: '2026-01-01T00:00:00.000Z' }],
            providerSessions: [{ agent: 'claude', conversationId: 'claude-1', synchronizedThroughMessageId: 'm1' }],
        }))

        await executor.execute(executionInput({ runInput: { continueFrom: 'source.json', extraPrompt: '' } }))

        expect(agentRunnerService.start.mock.calls[0][1]).toMatchObject({
            contextInput: expect.stringContaining('[Assistant (claude)]'), prompt: 'continue', reference: 'source.json',
        })
        expect(agentRunnerService.start.mock.calls[0][1]).not.toHaveProperty('providerConversationId')
    })

    it('rejects conversation from another context card', async () => {
        const { agentRunnerService, executor, localGitService } = createExecutor()
        localGitService.loadAgentConversation.mockResolvedValueOnce(conversation({ cardPath: 'design/other.md' }))

        await expect(executor.execute(executionInput({ runInput: { continueFrom: 'source.json', extraPrompt: '' } })))
            .rejects.toThrow('Agent log belongs to design/other.md, not design/card.md')
        expect(agentRunnerService.start).not.toHaveBeenCalled()
    })

    it('retries one confirmed pre-turn missing session with producing run data and full context', async () => {
        const { agentRunnerService, executor, localGitService } = createExecutor()
        const sourceConversation = conversation({
            providerSessions: [{ agent: 'codex', conversationId: 'missing', synchronizedThroughMessageId: 'm1' }],
        })
        localGitService.loadAgentConversation.mockResolvedValueOnce(sourceConversation)
        agentRunnerService.start
            .mockImplementationOnce(async (_project, _request, _onEvent, onComplete) => {
                onComplete(1, {
                    conversation: sourceConversation, missingSession: true, reference: 'producing.json',
                    stderr: 'missing', stdout: '', turnStarted: false,
                })

                return { runId: 'first' }
            })
            .mockImplementationOnce(async (_project, _request, _onEvent, onComplete) => {
                onComplete(0, {
                    conversation: sourceConversation, missingSession: false, reference: 'producing.json',
                    stderr: '', stdout: 'done', turnStarted: true,
                })

                return { runId: 'second' }
            })

        await executor.execute(executionInput({ runInput: { continueFrom: 'source.json', extraPrompt: 'next' } }))

        expect(agentRunnerService.start).toHaveBeenCalledTimes(2)
        expect(agentRunnerService.start.mock.calls[1][1]).toMatchObject({
            contextInput: expect.stringContaining('old answer'), conversation: sourceConversation,
            reference: 'producing.json', reuseLastUserMessage: true,
        })
        expect(agentRunnerService.start.mock.calls[1][1]).not.toHaveProperty('providerConversationId')
    })

    it.each([
        ['no requested session', { continueFrom: undefined }, { missingSession: true, turnStarted: false }],
        ['unrelated failure', { continueFrom: 'source.json' }, { missingSession: false, turnStarted: false }],
        ['post-turn failure', { continueFrom: 'source.json' }, { missingSession: true, turnStarted: true }],
    ])('does not retry %s', async (_label, runInput, processResult) => {
        const { agentRunnerService, executor, localGitService } = createExecutor()
        if (runInput.continueFrom) {
            localGitService.loadAgentConversation.mockResolvedValueOnce(conversation({
                providerSessions: [{ agent: 'codex', conversationId: 'session-1', synchronizedThroughMessageId: 'm1' }],
            }))
        }
        agentRunnerService.start.mockImplementationOnce(async (_project, _request, _onEvent, onComplete) => {
            onComplete(1, {
                conversation: { id: 'failed' }, reference: 'failed.json', stderr: 'failed', stdout: '', ...processResult,
            })

            return { runId: 'failed' }
        })

        await executor.execute(executionInput({ runInput: { extraPrompt: '', ...runInput } }))

        expect(agentRunnerService.start).toHaveBeenCalledTimes(1)
    })

    it('propagates completion rejection and clears active run', async () => {
        const { agentRunnerService, executor } = createExecutor()
        agentRunnerService.start.mockImplementationOnce(async (_project, _request, _onEvent, _onComplete, onReject) => {
            onReject(new Error('persist failed'))

            return { runId: 'failed' }
        })
        const input = executionInput()

        await expect(executor.execute(input)).rejects.toThrow('persist failed')
        expect(input.onActiveRunChange.mock.calls.map(([runId]) => runId)).toEqual(['failed', null])
    })

    it('stops run when cancellation occurs before start returns', async () => {
        const controller = new AbortController()
        const { agentRunnerService, executor } = createExecutor()
        agentRunnerService.start.mockImplementationOnce(async (_project, _request, _onEvent, onComplete) => {
            controller.abort()
            onComplete(1, {
                conversation: { id: 'cancelled' }, missingSession: false, reference: 'cancelled.json',
                stderr: '', stdout: '', turnStarted: false,
            })

            return { runId: 'late-run' }
        })

        await executor.execute(executionInput({ signal: controller.signal }))

        expect(agentRunnerService.stop).toHaveBeenCalledWith('late-run')
    })
})
