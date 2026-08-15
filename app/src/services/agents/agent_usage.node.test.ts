import { describe, expect, it } from 'vitest'
import type { AgentConversation, AgentTokenUsage, Card, ProjectSnapshot } from '../../data/data_types'
import {
    actionCardAgentTokenUsage,
    cardAgentTokenUsage,
    conversationFileChangeUsage,
    projectAgentTokenUsage,
} from './agent_usage'

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

function card(path: string, usages: Array<AgentTokenUsage | undefined>): Card {
    const agentConversations = usages.map((agentUsage, index) => ({
        actionId: null,
        cardInternalId: path,
        cardPath: path,
        completedAt: 'now',
        entries: [],
        hasExplicitTitle: true,
        id: `conversation-${index}`,
        path: `logs/${index}.json`,
        providerSessions: [],
        startedAt: 'now',
        status: 'completed',
        title: 'Run',
        viewed: true,
        ...(agentUsage ? { usage: agentUsage } : {}),
    } satisfies AgentConversation))

    return {
        agentConversationErrors: [],
        agentConversations,
        content: '',
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id: path, internalId: path,
            owner: null, policy: {}, references: [], status: 'done', title: path,
        },
        hasFrontmatter:true,
        isActive: !path.includes('/history/'),
        path,
    }
}

describe('agent usage aggregation', () => {
    it('sums every completed countable patch in one conversation', () => {
        const conversation = card('design/F-1.md', [undefined]).agentConversations[0]
        conversation.status = 'failed'
        conversation.entries = [
            {
                content: 'first edit', deletions: 1, id: 'file-1', insertions: 2, kind: 'event',
                providerItemId: 'file-1', status: 'completed', timestamp: 'first', type: 'fileChange',
            },
            {
                content: 'same line edited again', deletions: 1, id: 'file-2', insertions: 1, kind: 'event',
                providerItemId: 'file-2', status: 'completed', timestamp: 'second', type: 'fileChange',
            },
            {
                content: 'still running', deletions: 8, id: 'file-3', insertions: 8, kind: 'event',
                providerItemId: 'file-3', status: 'inProgress', timestamp: 'third', type: 'fileChange',
            },
            {
                content: 'missing diff counts', id: 'file-4', kind: 'event', providerItemId: 'file-4',
                status: 'completed', timestamp: 'fourth', type: 'fileChange',
            },
        ]

        expect(conversationFileChangeUsage(conversation)).toEqual({ deletions: 2, insertions: 3 })
        expect(conversationFileChangeUsage({ ...conversation, entries: [] })).toBeNull()
        expect(conversationFileChangeUsage(null)).toBeNull()
    })

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

    it('sums every loaded conversation for a card and preserves reported cost', () => {
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

    it('returns zero for cards with no loaded or usage-bearing conversations', () => {
        expect(cardAgentTokenUsage(card('design/F-1.md', []))).toEqual({
            cachedInputTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            reasoningTokens: 0,
            totalTokens: 0,
        })
        expect(cardAgentTokenUsage(card('design/F-2.md', [undefined])).totalTokens).toBe(0)
    })

    it('aggregates configured archived and release folders without unrelated background cards', () => {
        const snapshot: ProjectSnapshot = {
            activeCards: [card('design/active/F-1.md', [usage(10, 2, 3, 1)])],
            backgroundCards: [
                card('design/records/releases/v1/F-2.md', [usage(20, 4, 6, 2, 0.02)]),
                card('design/records/releases/v1/nested/F-3.md', [usage(5, 1, 2, 0)]),
                card('design/records/releases/v2/F-4.md', [usage(30, 6, 9, 3)]),
                card('design/records/archived/F-6.md', [usage(7, 1, 2, 0)]),
                card('design/notes/F-5.md', [usage(999, 0, 0, 0)]),
            ],
            repositoryFiles: [],
            workingFolder: 'design/active',
        }

        const totals = projectAgentTokenUsage(
            snapshot,
            'design/records/releases',
            'design/records/archived',
        )

        expect(totals.current.usage.totalTokens).toBe(16)
        expect(totals.archived.usage.totalTokens).toBe(10)
        expect(totals.releases.map(({ name, usage: releaseUsage }) => [name, releaseUsage.totalTokens])).toEqual([
            ['v1', 40],
            ['v2', 48],
        ])
        expect(totals.project).toEqual({
            cachedInputTokens: 14,
            costUsd: 0.02,
            inputTokens: 72,
            outputTokens: 22,
            reasoningTokens: 6,
            totalTokens: 114,
        })
    })
})
