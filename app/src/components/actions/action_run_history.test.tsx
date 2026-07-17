import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunHistoryEntry } from '../../data/electron_action_bridge'
import { DialogDisplay } from '../dialog_display'
import { ActionRunHistory } from './action_run_history'

vi.mock('./diff_view', () => ({DiffView: ({ commitReference }: { commitReference: { commit: string } }) => <div>Diff {commitReference.commit}</div>}))

describe('ActionRunHistory', () => {
    afterEach(cleanup)

    it('renders nothing when history is empty', () => {
        render(<ActionRunHistory entries={[]} error={null} />)

        expect(screen.queryByText('Run history')).not.toBeInTheDocument()
        expect(screen.queryByText('No previous runs')).not.toBeInTheDocument()
    })

    it('reports history load errors through the dialog display', async () => {
        render(
            <>
                <DialogDisplay />
                <ActionRunHistory entries={[]} error="Could not load run history" />
            </>,
        )

        expect(await screen.findByText('Could not load run history')).toBeInTheDocument()
        expect(screen.queryByText('Run history unavailable.')).not.toBeInTheDocument()
    })

    it('renders agent and model labels', () => {
        const entries: ActionRunHistoryEntry[] = [{
            agent: 'codex',
            completedAt: '2026-07-05T10:00:00.000Z',
            model: 'gpt-5',
            output: 'done',
            prompt: 'run',
            status: 'completed',
            thinkingLevel: 'high',
        }]

        render(<ActionRunHistory entries={entries} error={null} />)

        expect(screen.getByText('completed (codex / gpt-5 / high): done')).toBeInTheDocument()
    })

    it('shows commit date, performer, short hash, and independent diff toggles', () => {
        const firstCommittedAt = '2026-07-05T10:00:00.000Z'
        const secondCommittedAt = '2026-07-05T11:00:00.000Z'
        const entries: ActionRunHistoryEntry[] = [{
            command: 'git commit',
            commits: [
                {
                    actionId: 'action-first', actionName: 'Prepare', branch: 'main', commit: 'abc123456789',
                    committedAt: firstCommittedAt, filePaths: ['design/F-010.md'], repositoryRoot: 'C:/repo',
                },
                {
                    actionId: 'action-second', actionName: 'Finish', branch: 'topic', commit: 'def567890123',
                    committedAt: secondCommittedAt, filePaths: ['app/a.ts'], repositoryRoot: 'C:/worktree',
                },
            ],
            completedAt: '2026-07-05T10:00:00.000Z',
            output: 'committed',
            prompt: '',
            status: 'completed',
        }]

        render(<ActionRunHistory entries={entries} error={null} />)

        expect(screen.getByText(`${new Date(firstCommittedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} · Prepare · abc1234`)).toBeInTheDocument()
        expect(screen.getByText(`${new Date(secondCommittedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} · Finish · def5678`)).toBeInTheDocument()

        const showButtons = screen.getAllByRole('button', { name: 'Show diff' })
        fireEvent.click(showButtons[0])
        expect(screen.getByText('Diff abc123456789')).toBeInTheDocument()
        expect(screen.queryByText('Diff def567890123')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Hide diff' }))
        expect(screen.queryByText('Diff abc123456789')).not.toBeInTheDocument()
    })
})
