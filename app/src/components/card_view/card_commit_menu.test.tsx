import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import type { CardCommit } from '../../services/actions/card_commit_history'
import { CardCommitMenu } from './card_commit_menu'

function commit(executionId: string, hashCharacter: string): CardCommit {
    const committedAt = '2026-07-20T10:00:00.000Z'

    return {
        branch: 'main',
        commit: hashCharacter.repeat(40),
        committedAt,
        deletions: 1,
        filePaths: ['design/F-060.md'],
        filesChanged: 1,
        insertions: 2,
        record: {
            commits: [],
            completedAt: committedAt,
            conversationIds: [],
            executionId,
            history: { completedAt: committedAt, output: '', prompt: '', status: 'completed' },
            origin: { cardInternalId: 'card-060', kind: 'card' },
            rootActionId: 'implement',
            rootActionLabel: 'Implement',
            startedAt: committedAt,
            status: 'completed',
        },
    }
}

function renderMenu(commits: CardCommit[], error: Error | null, onSelect = vi.fn()) {
    render(
        <AppThemeProvider>
            <CardCommitMenu commits={commits} error={error} onSelect={onSelect} />
        </AppThemeProvider>,
    )

    return onSelect
}

afterEach(cleanup)

describe('CardCommitMenu', () => {
    it('hides without commits and shows a count for multiple commits', () => {
        const { rerender } = render(
            <AppThemeProvider><CardCommitMenu commits={[]} error={null} onSelect={vi.fn()} /></AppThemeProvider>,
        )
        expect(screen.queryByRole('button', { name: 'Card commit history' })).not.toBeInTheDocument()

        rerender(
            <AppThemeProvider>
                <CardCommitMenu commits={[commit('one', 'a'), commit('two', 'b')]} error={null} onSelect={vi.fn()} />
            </AppThemeProvider>,
        )
        expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('lists metadata and selects one commit', () => {
        const commits = [commit('one', 'a')]
        const onSelect = renderMenu(commits, null)

        fireEvent.click(screen.getByRole('button', { name: 'Card commit history' }))
        expect(screen.getByText(/aaaaaaa/)).toHaveTextContent('+2/−1')
        fireEvent.click(screen.getByRole('button', { name: /Implement/ }))

        expect(onSelect).toHaveBeenCalledWith(commits[0])
    })

    it('shows malformed activity as a visible error', () => {
        renderMenu([], new Error('Malformed activity file'))

        expect(screen.getByRole('alert')).toHaveAttribute('title', 'Malformed activity file')
    })
})
