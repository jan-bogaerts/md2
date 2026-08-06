import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiffView } from './diff_view'
import { resolveClickedLine } from './diff_line_mapping'
import type { CommitReference, DiffFile, DiffResult } from '../../../data/electron_action_bridge'
import { DialogDisplay } from '../../dialog_display'

function diffFile(overrides: Partial<DiffFile> = {}): DiffFile {
    return {
        newLineNumbers: [10, 11, 12],
        newValue: 'unchanged\nnew line\ntrailing',
        oldLineNumbers: [10, 12],
        oldValue: 'unchanged\ntrailing',
        path: 'design/F-010.md',
        ...overrides,
    }
}

const commitReference: CommitReference = {
    actionId: 'action-commit',
    actionName: 'Commit changes',
    branch: 'main',
    commit: 'abc1234',
    committedAt: '2026-07-05T10:00:00.000Z',
    deletions: 0,
    filePaths: ['design/F-010.md'],
    filesChanged: 1,
    insertions: 1,
    repositoryRoot: 'C:/repo',
}

function diffResult(): DiffResult {
    return { commit: 'abc1234', files: [diffFile()] }
}

describe('resolveClickedLine', () => {
    it('maps a right-side click to the real new file line', () => {
        expect(resolveClickedLine(diffFile(), 'R-2')).toEqual({ line: 11, path: 'design/F-010.md' })
    })

    it('maps a left-side click to the real old file line', () => {
        expect(resolveClickedLine(diffFile(), 'L-2')).toEqual({ line: 12, path: 'design/F-010.md' })
    })

    it('returns null for a line index outside the parsed range', () => {
        expect(resolveClickedLine(diffFile(), 'R-9')).toBeNull()
    })
})

describe('DiffView', () => {
    afterEach(cleanup)

    it('renders the diff files returned by the diff service', async () => {
        const generateDiff = vi.fn(async () => diffResult())
        render(<DiffView commitReference={commitReference} generateDiff={generateDiff} openDiffLine={vi.fn()} />)

        await waitFor(() => expect(screen.getByRole('region', { name: 'Commit diff' })).toBeInTheDocument())
        expect(screen.getAllByText('design/F-010.md').length).toBeGreaterThan(0)
        expect(generateDiff).toHaveBeenCalledWith(commitReference)
    })

    it('shows a clear error when the diff command fails', async () => {
        const generateDiff = vi.fn(async () => {
            throw new Error('Diff command failed: fatal: bad object')
        })
        render(
            <>
                <DialogDisplay />
                <DiffView commitReference={commitReference} generateDiff={generateDiff} openDiffLine={vi.fn()} />
            </>,
        )

        await waitFor(() => expect(screen.getByText('Diff command failed: fatal: bad object')).toBeInTheDocument())
        expect(screen.getByText('Diff unavailable.')).toBeInTheDocument()
    })

    it('renders an already loaded worktree result with old and new rename paths', () => {
        const file = diffFile({ changeType: 'renamed', oldPath: 'design/old.md', path: 'design/new.md' })

        render(<DiffView label="Worktree diff" openDiffLine={vi.fn()} result={{ files: [file], repositoryRoot: 'C:/worktree' }} />)

        expect(screen.getByRole('region', { name: 'Worktree diff' })).toBeInTheDocument()
        expect(screen.getAllByText('design/old.md').length).toBeGreaterThan(0)
        expect(screen.getAllByText('design/new.md').length).toBeGreaterThan(0)
    })
})
