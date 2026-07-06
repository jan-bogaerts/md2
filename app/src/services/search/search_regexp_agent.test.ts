import { describe, expect, it, vi } from 'vitest'
import type { AgentExecutionRequest, AgentExecutionResult, ElectronActionBridge } from '../../data/electron_action_bridge'
import type { AgentConversation, AgentRunEvent } from '../../data/data_types'
import { createSearchRegexpAgent, extractRegexpExpression, isSearchRegexpAgentAvailable } from './search_regexp_agent'

function conversation(request: AgentExecutionRequest): AgentConversation {
    return {
        cardPath: request.cardPath,
        completedAt: '2026-01-01T00:01:00.000Z',
        events: [],
        id: 'agent-1',
        messages: [{ content: request.prompt, id: 'm1', role: 'stdout', timestamp: '2026-01-01T00:01:00.000Z' }],
        path: '.md2-agent-logs/one.json',
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'completed',
        title: 'Search RegExp',
    }
}

function agentResult(request: AgentExecutionRequest, overrides: Partial<AgentExecutionResult> = {}): AgentExecutionResult {
    return {
        command: request.command,
        conversation: conversation(request),
        exitCode: 0,
        prompt: request.prompt,
        reference: '.md2-agent-logs/one.json',
        runId: 'agent-1',
        stderr: '',
        stdout: request.prompt,
        ...overrides,
    }
}

function makeBridge(runAgent: ElectronActionBridge['runAgent']): ElectronActionBridge {
    return {
        appendActionRunHistory: vi.fn(async () => []),
        generateDiff: vi.fn(async () => ({ commit: '', files: [] })),
        loadActionRunHistory: vi.fn(async () => []),
        openInEditor: vi.fn(async () => {}),
        runAgent,
        runCommand: vi.fn(async () => ({ command: '', exitCode: 0, stderr: '', stdout: '' })),
    }
}

describe('extractRegexpExpression', () => {
    it('returns the pattern unchanged for a plain valid pattern string', () => {
        expect(extractRegexpExpression('foo.*bar')).toBe('foo.*bar')
    })

    it('unwraps a fenced code block with a language tag on the opening fence', () => {
        expect(extractRegexpExpression('```regex\nfoo.*bar\n```')).toBe('foo.*bar')
    })

    it('unwraps a fenced code block without a language tag on the opening fence', () => {
        expect(extractRegexpExpression('```\nfoo.*bar\n```')).toBe('foo.*bar')
    })

    it('unwraps a /pattern/flags regex-literal wrapper and drops the flags', () => {
        expect(extractRegexpExpression('/foo.*bar/gi')).toBe('foo.*bar')
    })

    it('throws a clear message for an empty result', () => {
        expect(() => extractRegexpExpression('')).toThrow('Agent returned an empty regular expression')
    })

    it('throws a clear message for a whitespace-only result', () => {
        expect(() => extractRegexpExpression('   \n  ')).toThrow('Agent returned an empty regular expression')
    })

    it('throws a clear message for a syntactically invalid regular expression', () => {
        expect(() => extractRegexpExpression('(unmatched')).toThrow(/Agent returned an invalid regular expression/)
    })
})

describe('isSearchRegexpAgentAvailable', () => {
    it('returns true when the injected bridgeProvider returns a non-null bridge', () => {
        expect(isSearchRegexpAgentAvailable(() => makeBridge(vi.fn()))).toBe(true)
    })

    it('returns false when the injected bridgeProvider returns null', () => {
        expect(isSearchRegexpAgentAvailable(() => null)).toBe(false)
    })
})

describe('createSearchRegexpAgent', () => {
    it('throws when the bridge is not available and never calls runAgent', async () => {
        const runAgent = vi.fn()
        const commandProvider = vi.fn(() => 'test-agent')
        const runEventObserver = vi.fn()
        const agent = createSearchRegexpAgent({ bridgeProvider: () => null, commandProvider, runEventObserver })

        await expect(agent('find the beta card')).rejects.toThrow('RegExp agent is not available')
        expect(runAgent).not.toHaveBeenCalled()
        expect(commandProvider).not.toHaveBeenCalled()
        expect(runEventObserver).not.toHaveBeenCalled()
    })

    it('runs the agent with the expected request and returns the extracted expression', async () => {
        const runAgent = vi.fn(async (request: AgentExecutionRequest, callback?: (event: AgentRunEvent) => void) => {
            callback?.({ content: '', conversation: conversation(request), runId: 'agent-1', type: 'started' })
            callback?.({ content: '', conversation: conversation(request), runId: 'agent-1', type: 'closed' })

            return agentResult(request, { stdout: '```\nfoo.*bar\n```' })
        })
        const bridge = makeBridge(runAgent)
        const commandProvider = vi.fn(() => 'test-agent-cmd')
        const runEventObserver = vi.fn()
        const agent = createSearchRegexpAgent({ bridgeProvider: () => bridge, commandProvider, runEventObserver })

        const expression = await agent('find the beta card')

        expect(expression).toBe('foo.*bar')
        expect(runAgent).toHaveBeenCalledWith(
            expect.objectContaining({
                cardPath: '.md2-search-regexp',
                command: 'test-agent-cmd',
                prompt: expect.stringContaining('find the beta card'),
                title: 'Search RegExp',
            }),
            runEventObserver,
        )
    })

    it('forwards every event emitted by runAgent to the injected runEventObserver in order', async () => {
        const runAgent = vi.fn(async (request: AgentExecutionRequest, callback?: (event: AgentRunEvent) => void) => {
            callback?.({ content: '', conversation: conversation(request), runId: 'agent-1', type: 'started' })
            callback?.({ content: '', conversation: conversation(request), runId: 'agent-1', type: 'closed' })

            return agentResult(request, { stdout: 'foo.*bar' })
        })
        const bridge = makeBridge(runAgent)
        const runEventObserver = vi.fn()
        const agent = createSearchRegexpAgent({ bridgeProvider: () => bridge, commandProvider: () => 'test-agent', runEventObserver })

        await agent('find the beta card')

        expect(runEventObserver).toHaveBeenCalledTimes(2)
        expect(runEventObserver.mock.calls[0][0]).toMatchObject({ type: 'started' })
        expect(runEventObserver.mock.calls[1][0]).toMatchObject({ type: 'closed' })
    })

    it('propagates a rejection from runAgent unchanged', async () => {
        const runAgent = vi.fn(async () => {
            throw new Error('agent process crashed')
        })
        const bridge = makeBridge(runAgent)
        const agent = createSearchRegexpAgent({ bridgeProvider: () => bridge, commandProvider: () => 'test-agent', runEventObserver: vi.fn() })

        await expect(agent('find the beta card')).rejects.toThrow('agent process crashed')
    })

    it('propagates the extraction error when stdout is not a valid expression', async () => {
        const runAgent = vi.fn(async (request: AgentExecutionRequest, callback?: (event: AgentRunEvent) => void) => {
            callback?.({ content: '', conversation: conversation(request), runId: 'agent-1', type: 'started' })
            callback?.({ content: '', conversation: conversation(request), runId: 'agent-1', type: 'closed' })

            return agentResult(request, { stdout: 'Sorry, I cannot comply with (this request' })
        })
        const bridge = makeBridge(runAgent)
        const runEventObserver = vi.fn()
        const agent = createSearchRegexpAgent({ bridgeProvider: () => bridge, commandProvider: () => 'test-agent', runEventObserver })

        await expect(agent('find the beta card')).rejects.toThrow(/Agent returned an invalid regular expression/)
        expect(runEventObserver).toHaveBeenCalledTimes(2)
    })
})
