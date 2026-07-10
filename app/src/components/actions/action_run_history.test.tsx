import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ActionRunHistoryEntry } from '../../data/electron_action_bridge'
import { DialogDisplay } from '../dialog_display'
import { ActionRunHistory } from './action_run_history'

describe('ActionRunHistory', () => {
    afterEach(cleanup)

    it('renders empty history state', () => {
        render(<ActionRunHistory entries={[]} error={null} />)

        expect(screen.getByText('Run history')).toBeInTheDocument()
        expect(screen.getByText('No previous runs')).toBeInTheDocument()
    })

    it('reports history load errors through the dialog display', async () => {
        render(
            <>
                <DialogDisplay />
                <ActionRunHistory entries={[]} error="Could not load run history" />
            </>,
        )

        expect(await screen.findByText('Could not load run history')).toBeInTheDocument()
        expect(screen.getByText('Run history unavailable.')).toBeInTheDocument()
    })

    it('renders agent and model labels', () => {
        const entries: ActionRunHistoryEntry[] = [{
            agent: 'codex',
            completedAt: '2026-07-05T10:00:00.000Z',
            model: 'gpt-5',
            output: 'done',
            prompt: 'run',
            status: 'completed',
        }]

        render(<ActionRunHistory entries={entries} error={null} />)

        expect(screen.getByText('completed (codex / gpt-5): done')).toBeInTheDocument()
    })

    it('toggles diff view for commit entries', () => {
        const entries: ActionRunHistoryEntry[] = [{
            command: 'git commit',
            commit: {
                actionName: 'commit',
                branch: 'main',
                commit: 'abc1234',
                completedAt: '2026-07-05T10:00:00.000Z',
                filePaths: ['design/F-010.md'],
                repositoryRoot: 'C:/repo',
            },
            completedAt: '2026-07-05T10:00:00.000Z',
            output: 'committed',
            prompt: '',
            status: 'completed',
        }]

        render(<ActionRunHistory entries={entries} error={null} />)

        fireEvent.click(screen.getByRole('button', { name: 'Show diff' }))
        expect(screen.getByRole('button', { name: 'Hide diff' })).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Hide diff' }))
        expect(screen.getByRole('button', { name: 'Show diff' })).toBeInTheDocument()
    })
})
