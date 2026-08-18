import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation } from '../../../../data/data_types'
import type { ActionRunHistoryEntry, CommitReference } from '../../../../data/electron_action_bridge'
import { createAppTheme } from '../../../../theme/app_theme'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import { ActionUsageSummary } from './action_usage_summary'
import type { ActionUsageScope } from './action_usage_scope_store'

afterEach(cleanup)

function conversation(id: string, totalTokens: number, insertions = 0, deletions = 0): AgentConversation {
    return {
        actionId: 'implement',
        cardInternalId: 'card-1',
        cardPath: 'design/F-1.md',
        completedAt: 'now',
        entries: insertions === 0 && deletions === 0 ? [] : [{
            content: 'edit', deletions, id: `${id}-file`, insertions, kind: 'event',
            providerItemId: `${id}-file`, status: 'completed', timestamp: 'now', type: 'fileChange',
        }],
        hasExplicitTitle: true,
        id,
        path: `logs/${id}.json`,
        providerSessions: [],
        startedAt: 'now',
        status: 'completed',
        title: id,
        usage: { cachedInputTokens: 0, inputTokens: totalTokens, outputTokens: 0, reasoningTokens: 0, totalTokens },
        viewed: true,
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

interface RenderSummaryOptions {
    conversation?: AgentConversation | null
    conversations?: AgentConversation[]
    history?: ActionRunHistoryEntry[]
    onToggleScope?: () => void
    scope?: ActionUsageScope
}

function renderSummary(options: RenderSummaryOptions = {}) {
    const displayedConversation = options.conversation === undefined
        ? conversation('conversation-1', 12, 2, 1)
        : options.conversation

    return render(
        <AppThemeProvider>
            <ActionUsageSummary
                actionId="implement"
                cardInternalId="card-1"
                conversation={displayedConversation}
                conversations={options.conversations ?? (displayedConversation ? [displayedConversation] : [])}
                history={options.history ?? []}
                liveConversation={null}
                onToggleScope={options.onToggleScope ?? vi.fn()}
                scope={options.scope ?? 'actionCard'}
            />
        </AppThemeProvider>,
    )
}

describe('ActionUsageSummary', () => {
    it('always renders tokens but hides zero changes and lines', () => {
        renderSummary({ conversation: null })

        const tokens = screen.getByRole('button', { name: 'Tokens, Action/card scope' })
        expect(tokens).toHaveAttribute('type', 'button')
        expect(tokens).toHaveAttribute('tabindex', '0')
        expect(tokens).toHaveTextContent('tokens: 0')
        expect(screen.queryByRole('button', { name: 'Changes, Action/card scope' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Lines, Action/card scope' })).not.toBeInTheDocument()
        expect(screen.queryByText(/context:/u)).not.toBeInTheDocument()
    })

    it('does not render displayed conversation context occupancy', () => {
        const displayedConversation = conversation('conversation-1', 12)
        displayedConversation.contextWindowUsage = { capacityTokens: 258_400, usedTokens: 42_000 }
        renderSummary({ conversation: displayedConversation })

        expect(screen.queryByText(/context:/u)).not.toBeInTheDocument()
    })

    it('invokes shared scope toggle through pointer and keyboard-synthesized clicks', () => {
        const onToggleScope = vi.fn()
        const displayedConversation = conversation('conversation-1', 12, 2, 1)
        renderSummary({
            conversation: displayedConversation,
            history: [historyEntry(displayedConversation.id, [commit('abc1234', 3, 2)])],
            onToggleScope,
        })

        fireEvent.click(screen.getByRole('button', { name: 'Tokens, Action/card scope' }), { detail: 1 })
        fireEvent.click(screen.getByRole('button', { name: 'Changes, Action/card scope' }))
        const lines = screen.getByRole('button', { name: 'Lines, Action/card scope' })
        lines.focus()
        fireEvent.click(lines, { detail: 0 })

        expect(onToggleScope).toHaveBeenCalledTimes(3)
    })

    it('renders conversation values for every metric under conversation scope', () => {
        const displayedConversation = conversation('conversation-1', 12, 2, 1)
        const otherConversation = conversation('conversation-2', 20, 5, 4)
        const matchingCommit = commit('abc1234', 6, 3)
        const otherCommit = commit('def5678', 8, 7)
        renderSummary({
            conversation: displayedConversation,
            conversations: [displayedConversation, otherConversation],
            history: [
                historyEntry(displayedConversation.id, [matchingCommit]),
                historyEntry(otherConversation.id, [otherCommit]),
            ],
            scope: 'conversation',
        })

        expect(screen.getByRole('button', { name: 'Tokens, Conversation scope' })).toHaveTextContent('tokens: 12')
        expect(screen.getByRole('button', { name: 'Changes, Conversation scope' })).toHaveTextContent('changes: +2 / -1')
        expect(screen.getByRole('button', { name: 'Lines, Conversation scope' })).toHaveTextContent('lines: 9 (+6 / -3)')
    })

    it('renders total, insertion, and deletion values under action/card scope', () => {
        const displayedConversation = conversation('conversation-1', 12)
        const otherConversation = conversation('conversation-2', 20)
        renderSummary({
            conversation: displayedConversation,
            conversations: [displayedConversation, otherConversation],
            history: [
                historyEntry(displayedConversation.id, [commit('abc1234', 6, 3)]),
                historyEntry(otherConversation.id, [commit('def5678', 8, 7)]),
            ],
        })

        expect(screen.getByRole('button', { name: 'Lines, Action/card scope' })).toHaveTextContent('lines: 24 (+14 / -10)')
    })

    it.each([
        { deletions: 0, expected: 'lines: 6 (+6 / -0)', insertions: 6, name: 'additions-only' },
        { deletions: 3, expected: 'lines: 3 (+0 / -3)', insertions: 0, name: 'deletions-only' },
    ])('renders explicit zero side for $name commit history', ({ deletions, expected, insertions }) => {
        renderSummary({ history: [historyEntry('conversation-1', [commit('abc1234', insertions, deletions)])] })

        expect(screen.getByRole('button', { name: 'Lines, Action/card scope' })).toHaveTextContent(expected)
    })

    it('keeps compactable prefixes separate while preserving accessible names and change colors', () => {
        renderSummary({ history: [historyEntry('conversation-1', [commit('abc1234', 3, 2)])] })
        const tokens = screen.getByRole('button', { name: 'Tokens, Action/card scope' })
        const changes = screen.getByRole('button', { name: 'Changes, Action/card scope' })
        const lines = screen.getByRole('button', { name: 'Lines, Action/card scope' })
        const palette = createAppTheme('light').palette

        expect(tokens.querySelector('[data-usage-prefix]')).toHaveTextContent('tokens:')
        expect(changes.querySelector('[data-usage-prefix]')).toHaveTextContent('changes:')
        expect(lines.querySelector('[data-usage-prefix]')).toHaveTextContent('lines:')
        expect(changes.querySelector('[data-usage-prefix]')?.nextElementSibling).toHaveStyle({ color: palette.success.main })
        expect(changes.querySelector('[data-usage-prefix]')?.nextElementSibling?.nextElementSibling).toHaveStyle({ color: palette.error.main })
        expect(lines).toHaveTextContent('lines: 5 (+3 / -2)')
        expect(lines.querySelector('[data-usage-prefix]')?.nextElementSibling).toHaveStyle({ color: palette.success.main })
        expect(lines.querySelector('[data-usage-prefix]')?.nextElementSibling?.nextElementSibling).toHaveStyle({ color: palette.error.main })
    })

    it('explains metric, switching, both values, and active-scope commit details', async () => {
        const displayedConversation = conversation('conversation-1', 12)
        const otherConversation = conversation('conversation-2', 20)
        const matchingCommit = commit('abc1234', 6, 3)
        const otherCommit = commit('def5678', 8, 7)
        renderSummary({
            conversation: displayedConversation,
            conversations: [displayedConversation, otherConversation],
            history: [
                historyEntry(displayedConversation.id, [matchingCommit]),
                historyEntry(otherConversation.id, [otherCommit]),
            ],
            scope: 'conversation',
        })

        fireEvent.mouseOver(screen.getByRole('button', { name: 'Lines, Conversation scope' }))

        const tooltip = await screen.findByRole('tooltip')
        expect(tooltip).toHaveTextContent('Lines are additions plus deletions in captured Git commit diffs.')
        expect(tooltip).toHaveTextContent('Active scope: Conversation. Click to switch to Action/card.')
        expect(tooltip).toHaveTextContent('Conversation (active): 9 lines (+6 / -3)')
        expect(tooltip).toHaveTextContent('Action/card: 24 lines (+14 / -10)')
        expect(tooltip).toHaveTextContent('files changed: 1, insertions: 6, deletions: 3')
        expect(tooltip).toHaveTextContent('abc1234: +6 / -3')
        expect(tooltip).not.toHaveTextContent('def5678: +8 / -7')
    })

    it('shows unavailable conversation values and keeps action/card active without a displayed conversation', async () => {
        renderSummary({ conversation: null, scope: 'conversation' })

        const tokens = screen.getByRole('button', { name: 'Tokens, Action/card scope' })
        fireEvent.mouseOver(tokens)

        const tooltip = await screen.findByRole('tooltip')
        expect(tooltip).toHaveTextContent('Conversation unavailable; clicking keeps Action/card scope.')
        expect(tooltip).toHaveTextContent('Conversation: unavailable')
        expect(tooltip).toHaveTextContent('Action/card (active): 0 tokens')
    })
})
