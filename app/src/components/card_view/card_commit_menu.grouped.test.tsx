import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import type { CardCommit } from '../../services/actions/card_commit_history'
import { CardCommitMenu } from './card_commit_menu'

function commit(runId: string, hashCharacter: string): CardCommit {
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
            runId,
            details: { command: 'edit', output: '', type: 'command' },
            origin: { cardInternalId: 'card-060', kind: 'card' },
            rootActionId: 'implement',
            rootActionLabel: 'Implement',
            startedAt: committedAt,
            status: 'completed',
        },
    }
}

function renderMenu(commits: CardCommit[], error: Error | null, onSelectCommit = vi.fn(), currentWorktreeAvailable = false) {
    const onSelectWorktree = vi.fn()
    render(
        <AppThemeProvider>
            <CardCommitMenu
                commits={commits}
                currentWorktreeAvailable={currentWorktreeAvailable}
                error={error}
                onSelectCommit={onSelectCommit}
                onSelectWorktree={onSelectWorktree}
            />
        </AppThemeProvider>,
    )

    return { onSelectCommit, onSelectWorktree }
}

afterEach(cleanup)

describe('CardCommitMenu', () => {
    it('hides without commits and shows a count for multiple commits', () => {
        const { rerender } = render(
            <AppThemeProvider>
                <CardCommitMenu
                    commits={[]}
                    currentWorktreeAvailable={false}
                    error={null}
                    onSelectCommit={vi.fn()}
                    onSelectWorktree={vi.fn()}
                />
            </AppThemeProvider>,
        )
        expect(screen.queryByRole('button', { name: 'Card commit history' })).not.toBeInTheDocument()

        rerender(
            <AppThemeProvider>
                <CardCommitMenu
                    commits={[commit('one', 'a'), commit('two', 'b')]}
                    currentWorktreeAvailable={false}
                    error={null}
                    onSelectCommit={vi.fn()}
                    onSelectWorktree={vi.fn()}
                />
            </AppThemeProvider>,
        )
        expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('lists metadata and selects one commit', () => {
        const commits = [commit('one', 'a')]
        const { onSelectCommit } = renderMenu(commits, null)

        fireEvent.click(screen.getByRole('button', { name: 'Card commit history' }))
        expect(screen.getByText(/aaaaaaa/)).toHaveTextContent('+2/−1')
        fireEvent.click(screen.getByRole('button', { name: /Implement/ }))

        expect(onSelectCommit).toHaveBeenCalledWith(commits[0])
    })

    it('shows malformed activity as a visible error', () => {
        renderMenu([], new Error('Malformed activity file'))

        expect(screen.getByRole('alert')).toHaveAttribute('title', 'Malformed activity file')
    })

    it('lists current worktree first and selects it without changing commit order', () => {
        const commits = [commit('newer', 'b'), commit('older', 'a')]
        const { onSelectWorktree } = renderMenu(commits, null, vi.fn(), true)

        fireEvent.click(screen.getByRole('button', { name: 'Card commit history' }))
        const entries = screen.getAllByRole('button').filter((button) => button.closest('[role="presentation"]'))
        expect(entries.map((entry) => entry.textContent)).toEqual([
            'Current worktree changesNot committed',
            expect.stringContaining('bbbbbbb'),
            expect.stringContaining('aaaaaaa'),
        ])
        fireEvent.click(screen.getByRole('button', { name: /Current worktree changes/ }))
        expect(onSelectWorktree).toHaveBeenCalledOnce()
    })
})
