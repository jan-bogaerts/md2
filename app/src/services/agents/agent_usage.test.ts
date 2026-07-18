import { describe, expect, it } from 'vitest'
import type { AgentConversation, AgentTokenUsage, ProjectCard, ProjectSnapshot } from '../../data/data_types'
import { actionCardAgentTokenUsage, cardAgentTokenUsage, projectAgentTokenUsage } from './agent_usage'

function usage(
    inputTokens: number,
    cachedInputTokens: number,
    outputTokens: number,
    reasoningTokens: number,
    costUsd?: number,
): AgentTokenUsage {
    return {
        cachedInputTokens,
        ...(costUsd === undefined ? {} : { costUsd }),
        inputTokens,
        outputTokens,
        reasoningTokens,
        totalTokens: inputTokens + cachedInputTokens + outputTokens + reasoningTokens,
    }
}

function card(path: string, usages: Array<AgentTokenUsage | undefined>): ProjectCard {
    const agentConversations = usages.map((agentUsage, index) => ({
        actionId: null,
        cardPath: path,
        completedAt: 'now',
        events: [],
        hasExplicitTitle: true,
        id: `conversation-${index}`,
        messages: [],
        path: `logs/${index}.json`,
        providerSessions: [],
        startedAt: 'now',
        status: 'completed',
        title: 'Run',
        ...(agentUsage ? { usage: agentUsage } : {}),
    } satisfies AgentConversation))

    return {
        agentConversationErrors: [],
        agentConversations,
        content: '',
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id: path, internalId: path,
            owner: null, policy: {}, status: 'done', title: path,
        },
        headerFields: {},
        isActive: !path.includes('/history/'),
        path,
    }
}

describe('agent usage aggregation', () => {
    it('sums only conversations matching both action and card', () => {
        const conversations = [
            ...card('design/F-1.md', [usage(10, 2, 3, 1), usage(20, 4, 6, 2)]).agentConversations,
            ...card('design/F-2.md', [usage(100, 0, 0, 0)]).agentConversations,
        ]
        conversations[0].actionId = 'implement'
        conversations[1].actionId = 'review'
        conversations[2].actionId = 'implement'

        expect(actionCardAgentTokenUsage(conversations, 'implement', 'design/F-1.md')).toEqual({
            cachedInputTokens: 2,
            inputTokens: 10,
            outputTokens: 3,
            reasoningTokens: 1,
            totalTokens: 16,
        })
    })

    it('sums every loaded log for a card and preserves reported cost', () => {
        const total = cardAgentTokenUsage(card('design/F-1.md', [usage(10, 2, 3, 1, 0.01), usage(20, 4, 6, 2), undefined]))

        expect(total).toEqual({
            cachedInputTokens: 6,
            costUsd: 0.01,
            inputTokens: 30,
            outputTokens: 9,
            reasoningTokens: 3,
            totalTokens: 48,
        })
    })

    it('returns zero for cards with no loaded or usage-bearing logs', () => {
        expect(cardAgentTokenUsage(card('design/F-1.md', []))).toEqual({
            cachedInputTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            reasoningTokens: 0,
            totalTokens: 0,
        })
        expect(cardAgentTokenUsage(card('design/F-2.md', [undefined])).totalTokens).toBe(0)
    })

    it('aggregates current cards, releases, and project without unrelated background cards', () => {
        const snapshot: ProjectSnapshot = {
            activeCards: [card('design/active/F-1.md', [usage(10, 2, 3, 1)])],
            backgroundCards: [
                card('design/history/v1/F-2.md', [usage(20, 4, 6, 2, 0.02)]),
                card('design/history/v1/nested/F-3.md', [usage(5, 1, 2, 0)]),
                card('design/history/v2/F-4.md', [usage(30, 6, 9, 3)]),
                card('design/notes/F-5.md', [usage(999, 0, 0, 0)]),
            ],
            repositoryFiles: [],
            workingFolder: 'design/active',
        }

        const totals = projectAgentTokenUsage(snapshot, 'design')

        expect(totals.current.usage.totalTokens).toBe(16)
        expect(totals.releases.map(({ name, usage: releaseUsage }) => [name, releaseUsage.totalTokens])).toEqual([
            ['v1', 40],
            ['v2', 48],
        ])
        expect(totals.project).toEqual({
            cachedInputTokens: 13,
            costUsd: 0.02,
            inputTokens: 65,
            outputTokens: 20,
            reasoningTokens: 6,
            totalTokens: 104,
        })
    })
})
