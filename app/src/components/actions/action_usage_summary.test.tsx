import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AgentConversation } from '../../data/data_types'
import type { ActionRunHistoryEntry, CommitReference } from '../../data/electron_action_bridge'
import { ActionUsageSummary } from './action_usage_summary'

function conversation(actionId: string, cardInternalId: string, totalTokens: number): AgentConversation {
    return {
        actionId,
        cardInternalId,
        cardPath: 'design/F-1.md',
        completedAt: 'now',
        entries: [],
        hasExplicitTitle: true,
        id: `${actionId}-${cardInternalId}`,
        path: `logs/${actionId}.json`,
        providerSessions: [],
        startedAt: 'now',
        status: 'completed',
        title: 'Run',
        viewed: true,
        usage: { cachedInputTokens: 0, inputTokens: totalTokens, outputTokens: 0, reasoningTokens: 0, totalTokens },
    }
}

function commit(commitHash: string, overrides: Partial<CommitReference> = {}): CommitReference {
    return {
        actionId: 'implement',
        actionName: 'Implement',
        branch: 'main',
        commit: commitHash.padEnd(40, commitHash[0]),
        committedAt: 'now',
        deletions: 0,
        filePaths: [],
        filesChanged: 1,
        insertions: 0,
        repositoryRoot: `C:/${commitHash}`,
        ...overrides,
    }
}

function historyEntry(commits: CommitReference[], status: ActionRunHistoryEntry['status']): ActionRunHistoryEntry {
    return { commits, completedAt: 'now', output: '', prompt: '', status }
}

describe('ActionUsageSummary', () => {
    it('shows filtered tokens and hides lines when history has no commits', () => {
        render(<ActionUsageSummary
            actionId="implement"
            cardInternalId="card-1"
            conversations={[
                conversation('implement', 'card-1', 12),
                conversation('review', 'card-1', 30),
                conversation('implement', 'card-2', 40),
            ]}
            history={[]}
        />)

        expect(screen.getByText('tokens: 12')).toBeInTheDocument()
        expect(screen.queryByText(/lines:/u)).not.toBeInTheDocument()
    })

    it('shows zero for binary-only commits and ordered aggregate details across worktrees and failed runs', async () => {
        const firstCommit = commit('abc1234', { filesChanged: 2, repositoryRoot: 'C:/first' })
        const secondCommit = commit('def5678', { deletions: 3, filesChanged: 1, insertions: 5, repositoryRoot: 'D:/second' })
        render(<ActionUsageSummary
            actionId="implement"
            cardInternalId="card-1"
            conversations={[]}
            history={[historyEntry([firstCommit], 'completed'), historyEntry([secondCommit], 'failed')]}
        />)

        const lines = screen.getByText('lines: 8')
        fireEvent.mouseOver(lines)

        const tooltip = await screen.findByRole('tooltip')
        expect(tooltip).toHaveTextContent('files changed: 3, insertions: 5, deletions: 3')
        expect(tooltip).toHaveTextContent('abc1234: +0 / -0')
        expect(tooltip).toHaveTextContent('def5678: +5 / -3')
        expect(tooltip.textContent?.indexOf('abc1234')).toBeLessThan(tooltip.textContent?.indexOf('def5678') ?? 0)
    })

    it('shows lines zero when commits exist without textual changes', () => {
        render(<ActionUsageSummary
            actionId="implement"
            cardInternalId="card-1"
            conversations={[]}
            history={[historyEntry([commit('abc1234')], 'completed')]}
        />)

        expect(screen.getByText('lines: 0')).toBeInTheDocument()
    })
})
