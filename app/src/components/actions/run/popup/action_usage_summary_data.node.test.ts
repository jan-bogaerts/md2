import { describe, expect, it } from 'vitest'
import type { AgentConversation } from '../../../../data/data_types'
import type { ActionRunHistoryEntry, CommitReference } from '../../../../data/electron_action_bridge'
import { contextWindowUsedPercent, scopedActionUsage } from './action_usage_summary_data'

function conversation(id: string, totalTokens?: number): AgentConversation {
    return {
        actionId: 'implement',
        cardInternalId: 'card-1',
        cardPath: 'design/F-1.md',
        completedAt: 'now',
        entries: [],
        hasExplicitTitle: true,
        id,
        path: `logs/${id}.json`,
        providerSessions: [],
        startedAt: 'now',
        status: 'completed',
        title: id,
        viewed: true,
        ...(totalTokens === undefined ? {} : {
            usage: {
                cachedInputTokens: 0,
                inputTokens: totalTokens,
                outputTokens: 0,
                reasoningTokens: 0,
                totalTokens,
            },
        }),
    }
}

function commit(commitHash: string, insertions: number, deletions: number): CommitReference {
    return {
        actionId: 'implement',
        actionName: 'Implement',
        branch: 'main',
        commit: commitHash.padEnd(40, commitHash[0]),
        committedAt: 'now',
        deletions,
        filePaths: [],
        filesChanged: 1,
        insertions,
        repositoryRoot: 'C:/project',
    }
}

describe('contextWindowUsedPercent', () => {
    it('rounds occupancy and caps values above capacity', () => {
        expect(contextWindowUsedPercent({ capacityTokens: 258_400, usedTokens: 42_000 })).toBe(16)
        expect(contextWindowUsedPercent({ capacityTokens: 100, usedTokens: 125 })).toBe(100)
    })

    it.each([
        undefined,
        null,
        { capacityTokens: 0, usedTokens: 1 },
        { capacityTokens: -1, usedTokens: 1 },
        { capacityTokens: '100', usedTokens: 1 },
        { capacityTokens: 100, usedTokens: -1 },
        { capacityTokens: 100, usedTokens: Number.NaN },
    ])('returns null for unavailable or malformed snapshot %#', (snapshot) => {
        expect(contextWindowUsedPercent(snapshot)).toBeNull()
    })
})

function historyEntry(rootConversationId: string, commits: CommitReference[]): ActionRunHistoryEntry {
    return {
        commits,
        completedAt: 'now',
        rootConversationId,
        startedAt: 'before',
        status: 'completed',
        type: 'agent',
    }
}

describe('scopedActionUsage', () => {
    it('deduplicates live conversation by id in action/card totals', () => {
        const persistedConversation = conversation('conversation-1', 10)
        const liveConversation = conversation('conversation-1', 15)

        const result = scopedActionUsage(
            [persistedConversation, conversation('conversation-2', 20)],
            liveConversation,
            liveConversation,
            [],
            'implement',
            'card-1',
        )

        expect(result.actionCard.tokens.totalTokens).toBe(35)
        expect(result.conversation?.tokens.totalTokens).toBe(15)
    })

    it('sums completed file-change patches and returns zero for missing usage', () => {
        const displayedConversation = conversation('conversation-1')
        displayedConversation.entries = [
            {
                content: 'completed', deletions: 2, id: 'file-1', insertions: 3, kind: 'event',
                providerItemId: 'file-1', status: 'completed', timestamp: 'now', type: 'fileChange',
            },
            {
                content: 'pending', deletions: 8, id: 'file-2', insertions: 9, kind: 'event',
                providerItemId: 'file-2', status: 'inProgress', timestamp: 'later', type: 'fileChange',
            },
        ]

        const result = scopedActionUsage(
            [displayedConversation, conversation('conversation-2')],
            null,
            displayedConversation,
            [],
            'implement',
            'card-1',
        )

        expect(result.actionCard.changes).toEqual({ deletions: 2, insertions: 3 })
        expect(result.conversation?.changes).toEqual({ deletions: 2, insertions: 3 })
        expect(result.actionCard.tokens.totalTokens).toBe(0)
    })

    it('matches conversation commits only through rootConversationId', () => {
        const displayedConversation = conversation('conversation-1', 10)
        const matchingCommit = commit('abc1234', 5, 2)
        const otherCommit = commit('def5678', 9, 4)
        const history = [
            historyEntry(displayedConversation.id, [matchingCommit]),
            historyEntry('conversation-2', [otherCommit]),
        ]

        const result = scopedActionUsage(
            [displayedConversation],
            null,
            displayedConversation,
            history,
            'implement',
            'card-1',
        )

        expect(result.conversation?.lines).toMatchObject({ deletions: 2, insertions: 5 })
        expect(result.conversation?.lines.commits).toEqual([matchingCommit])
        expect(result.actionCard.lines).toMatchObject({ deletions: 6, insertions: 14 })
    })

    it('marks conversation values unavailable when no conversation is displayed', () => {
        const result = scopedActionUsage([], null, null, [], 'implement', 'card-1')

        expect(result.conversation).toBeNull()
        expect(result.actionCard.changes).toEqual({ deletions: 0, insertions: 0 })
        expect(result.actionCard.lines).toMatchObject({ commits: [], deletions: 0, filesChanged: 0, insertions: 0 })
        expect(result.actionCard.tokens.totalTokens).toBe(0)
    })
})
