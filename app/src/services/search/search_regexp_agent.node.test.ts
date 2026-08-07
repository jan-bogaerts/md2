import { describe, expect, it, vi } from 'vitest'
import type { ElectronActionBridge } from '../../data/electron_action_bridge'
import type { AgentConversation, AgentRunEvent } from '../../data/data_types'
import { createSearchRegexpAgent, extractRegexpExpression, isSearchRegexpAgentAvailable } from './search_regexp_agent'

function conversation(): AgentConversation {
    return {
        cardPath: '.md2-search-regexp',
        completedAt: '2026-01-01T00:01:00.000Z',
        entries: [],
        hasExplicitTitle: true,
        id: 'agent-1',
        path: '.md2-agent-logs/one.json',
        providerSessions: [],
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'completed',
        title: 'Search RegExp',
        viewed: true,
    }
}

function makeBridge(runSearchRegexpAgent: ElectronActionBridge['runSearchRegexpAgent']): ElectronActionBridge {
    return {
        cancelActionRun: vi.fn(async () => {}),
        generateDiff: vi.fn(async () => ({ commit: '', files: [] })),
        generateWorktreeDiff: vi.fn(async () => ({ files: [], repositoryRoot: 'C:/worktree' })),
        loadActionRunHistory: vi.fn(async () => []),
        onActionRun: vi.fn(() => () => {}),
        openInEditor: vi.fn(async () => {}),
        prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        runSearchRegexpAgent,
        startAction: vi.fn(async () => 'action-1'),
    }
}

function emitAgentEvents(callback?: (event: AgentRunEvent) => void) {
    const agentConversation = conversation()
    const userMessage = { content: 'Find matches', id: 'message-1', kind: 'message' as const, role: 'user' as const, timestamp: agentConversation.startedAt }
    callback?.({
        conversation: { ...agentConversation, completedAt: null, entries: [userMessage], status: 'running' },
        runId: 'agent-1', type: 'started',
    })
    callback?.({ conversation: agentConversation, runId: 'agent-1', type: 'closed' })
}

describe('extractRegexpExpression', () => {
    it('returns a plain valid pattern', () => {
        expect(extractRegexpExpression('foo.*bar')).toBe('foo.*bar')
    })

    it('unwraps fenced code blocks', () => {
        expect(extractRegexpExpression('```regex\nfoo.*bar\n```')).toBe('foo.*bar')
        expect(extractRegexpExpression('```\nfoo.*bar\n```')).toBe('foo.*bar')
    })

    it('unwraps regex literals and drops flags', () => {
        expect(extractRegexpExpression('/foo.*bar/gi')).toBe('foo.*bar')
    })

    it('rejects empty and invalid expressions', () => {
        expect(() => extractRegexpExpression('')).toThrow('Agent returned an empty regular expression')
        expect(() => extractRegexpExpression('   \n  ')).toThrow('Agent returned an empty regular expression')
        expect(() => extractRegexpExpression('(unmatched')).toThrow(/Agent returned an invalid regular expression/)
    })
})

describe('isSearchRegexpAgentAvailable', () => {
    it('reflects Electron bridge availability', () => {
        expect(isSearchRegexpAgentAvailable(() => makeBridge(vi.fn()))).toBe(true)
        expect(isSearchRegexpAgentAvailable(() => null)).toBe(false)
    })
})

describe('createSearchRegexpAgent', () => {
    it('rejects unavailable Electron execution', async () => {
        const runEventObserver = vi.fn()
        const agent = createSearchRegexpAgent({ bridgeProvider: () => null, runEventObserver })

        await expect(agent('find the beta card')).rejects.toThrow('RegExp agent is not available')
        expect(runEventObserver).not.toHaveBeenCalled()
    })

    it('sends only natural-language input and extracts the returned expression', async () => {
        const runSearchRegexpAgent = vi.fn(async (_input: string, callback?: (event: AgentRunEvent) => void) => {
            emitAgentEvents(callback)

            return '```\nfoo.*bar\n```'
        })
        const runEventObserver = vi.fn()
        const agent = createSearchRegexpAgent({ bridgeProvider: () => makeBridge(runSearchRegexpAgent), runEventObserver })

        await expect(agent('find the beta card')).resolves.toBe('foo.*bar')
        expect(runSearchRegexpAgent).toHaveBeenCalledWith('find the beta card', runEventObserver)
        expect(runEventObserver.mock.calls.map((call) => call[0].type)).toEqual(['started', 'closed'])
    })

    it('propagates execution and extraction errors', async () => {
        const failedBridge = makeBridge(vi.fn(async () => {
            throw new Error('agent process crashed')
        }))
        const invalidBridge = makeBridge(vi.fn(async () => 'Sorry, I cannot comply with (this request'))

        await expect(createSearchRegexpAgent({ bridgeProvider: () => failedBridge })('find cards')).rejects.toThrow('agent process crashed')
        await expect(createSearchRegexpAgent({ bridgeProvider: () => invalidBridge })('find cards')).rejects.toThrow(/invalid regular expression/)
    })
})
