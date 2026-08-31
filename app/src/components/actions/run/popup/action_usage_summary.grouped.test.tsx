import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation } from '../../../../data/data_types'
import type { ActionRunHistoryEntry, CommitReference } from '../../../../data/electron_action_bridge'
import { createAppTheme } from '../../../../theme/app_theme'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import { ActionUsageSummary } from './action_usage_summary'
import type { ActionUsageScope } from './action_usage_scope_store'
import { scopedActionUsage } from './action_usage_summary_data'

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

/** Conversation carrying a completed file-change event whose patch totals zero on both sides. */
function zeroChangeConversation(id: string, totalTokens: number): AgentConversation {
    const built = conversation(id, totalTokens)
    built.entries = [{
        content: 'edit', deletions: 0, id: `${id}-file`, insertions: 0, kind: 'event',
        providerItemId: `${id}-file`, status: 'completed', timestamp: 'now', type: 'fileChange',
    }]

    return built
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
    const usage = scopedActionUsage(
        options.conversations ?? (displayedConversation ? [displayedConversation] : []),
        null,
        displayedConversation,
        options.history ?? [],
        'implement',
        'card-1',
    )
    const requestedScope = options.scope ?? 'actionCard'
    const activeScope = requestedScope === 'conversation' && usage.conversation ? 'conversation' : 'actionCard'

    return render(
        <AppThemeProvider>
            <ActionUsageSummary
                onToggleScope={options.onToggleScope ?? vi.fn()}
                snapshot={{ ...usage, activeScope, conversationAvailable: !!displayedConversation }}
            />
        </AppThemeProvider>,
    )
}

describe('ActionUsageSummary', () => {
    it('always renders tokens but hides changes when neither source has data', () => {
        renderSummary({ conversation: null })

        const tokens = screen.getByRole('button', { name: 'Tokens, Action/card scope' })
        expect(tokens).toHaveAttribute('type', 'button')
        expect(tokens).toHaveAttribute('tabindex', '0')
        expect(tokens).toHaveTextContent('tokens: 0')
        expect(screen.queryByRole('button', { name: 'Changes, Action/card scope' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Lines, Action/card scope' })).not.toBeInTheDocument()
        expect(screen.queryByText(/context:/u)).not.toBeInTheDocument()
    })

    it('hides changes when the conversation reports nothing and commit totals are zero', () => {
        renderSummary({
            conversation: conversation('conversation-1', 12),
            history: [historyEntry('conversation-1', [commit('abc1234', 0, 0)])],
        })

        expect(screen.queryByRole('button', { name: 'Changes, Action/card scope' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Tokens, Action/card scope' })).toBeInTheDocument()
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
        const changes = screen.getByRole('button', { name: 'Changes, Action/card scope' })
        changes.focus()
        fireEvent.click(changes, { detail: 0 })

        expect(screen.queryByRole('button', { name: 'Lines, Action/card scope' })).not.toBeInTheDocument()
        expect(onToggleScope).toHaveBeenCalledTimes(2)
    })

    it('prefers the conversation file-change count over commit totals in both scopes', () => {
        const displayedConversation = conversation('conversation-1', 12, 2, 1)
        const otherConversation = conversation('conversation-2', 20, 5, 4)
        renderSummary({
            conversation: displayedConversation,
            conversations: [displayedConversation, otherConversation],
            history: [
                historyEntry(displayedConversation.id, [commit('abc1234', 6, 3)]),
                historyEntry(otherConversation.id, [commit('def5678', 8, 7)]),
            ],
            scope: 'conversation',
        })

        expect(screen.getByRole('button', { name: 'Tokens, Conversation scope' })).toHaveTextContent('tokens: 12')
        const changes = screen.getByRole('button', { name: 'Changes, Conversation scope' })
        expect(changes).toHaveTextContent('changes: +2 / -1')
        expect(changes).not.toHaveTextContent('6')
    })

    it('falls back to commit totals when the conversation reports no file changes', () => {
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

        expect(screen.getByRole('button', { name: 'Changes, Action/card scope' })).toHaveTextContent('changes: +14 / -10')
    })

    it('renders a zero-total conversation count instead of falling back to commits', () => {
        const displayedConversation = zeroChangeConversation('conversation-1', 12)
        renderSummary({
            conversation: displayedConversation,
            history: [historyEntry(displayedConversation.id, [commit('abc1234', 6, 3)])],
        })

        expect(screen.getByRole('button', { name: 'Changes, Action/card scope' })).toHaveTextContent('changes: +0 / -0')
    })

    it.each([
        { deletions: 0, expected: 'changes: +6 / -0', insertions: 6, name: 'additions-only' },
        { deletions: 3, expected: 'changes: +0 / -3', insertions: 0, name: 'deletions-only' },
    ])('renders explicit zero side for $name commit history', ({ deletions, expected, insertions }) => {
        renderSummary({
            conversation: conversation('conversation-1', 12),
            history: [historyEntry('conversation-1', [commit('abc1234', insertions, deletions)])],
        })

        expect(screen.getByRole('button', { name: 'Changes, Action/card scope' })).toHaveTextContent(expected)
    })

    it('keeps compactable prefixes separate while preserving accessible names and change colors', () => {
        renderSummary({ history: [historyEntry('conversation-1', [commit('abc1234', 3, 2)])] })
        const tokens = screen.getByRole('button', { name: 'Tokens, Action/card scope' })
        const changes = screen.getByRole('button', { name: 'Changes, Action/card scope' })
        const palette = createAppTheme('light').palette

        expect(tokens.querySelector('[data-usage-prefix]')).toHaveTextContent('tokens:')
        expect(changes.querySelector('[data-usage-prefix]')).toHaveTextContent('changes:')
        expect(changes).toHaveTextContent('changes: +2 / -1')
        expect(changes.querySelector('[data-usage-prefix]')?.nextElementSibling).toHaveStyle({ color: palette.success.main })
        expect(changes.querySelector('[data-usage-prefix]')?.nextElementSibling?.nextElementSibling).toHaveStyle({ color: palette.error.main })
    })

    it('explains the commit source, switching, both values, and active-scope commit details', async () => {
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

        fireEvent.mouseOver(screen.getByRole('button', { name: 'Changes, Conversation scope' }))

        const tooltip = await screen.findByRole('tooltip')
        expect(tooltip).toHaveTextContent('Changes are additions plus deletions in captured Git commit diffs; the conversation reported no file changes.')
        expect(tooltip).toHaveTextContent('Active scope: Conversation. Click to switch to Action/card.')
        expect(tooltip).toHaveTextContent('Conversation (active): +6 / -3')
        expect(tooltip).toHaveTextContent('Action/card: +14 / -10')
        expect(tooltip).toHaveTextContent('files changed: 1, insertions: 6, deletions: 3')
        expect(tooltip).toHaveTextContent('abc1234: +6 / -3')
        expect(tooltip).not.toHaveTextContent('def5678: +8 / -7')
    })

    it('explains the conversation source and omits commit details', async () => {
        const displayedConversation = conversation('conversation-1', 12, 2, 1)
        renderSummary({
            conversation: displayedConversation,
            history: [historyEntry(displayedConversation.id, [commit('abc1234', 6, 3)])],
            scope: 'conversation',
        })

        fireEvent.mouseOver(screen.getByRole('button', { name: 'Changes, Conversation scope' }))

        const tooltip = await screen.findByRole('tooltip')
        expect(tooltip).toHaveTextContent('Changes are additions and deletions across completed provider file-change patches.')
        expect(tooltip).toHaveTextContent('Conversation (active): +2 / -1')
        expect(tooltip).toHaveTextContent('Action/card: +2 / -1')
        expect(tooltip).not.toHaveTextContent('files changed:')
        expect(tooltip).not.toHaveTextContent('abc1234:')
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
