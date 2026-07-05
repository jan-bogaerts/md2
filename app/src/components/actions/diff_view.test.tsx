import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiffView } from './diff_view'
import { resolveClickedLine } from './diff_line_mapping'
import type { ActionRunHistoryEntry, DiffFile, DiffResult } from '../../data/electron_action_bridge'

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

const commit = {
    actionName: 'commit',
    branch: 'main',
    commit: 'abc1234',
    completedAt: '2026-07-05T10:00:00.000Z',
    filePaths: ['design/F-010.md'],
    repositoryRoot: 'C:/repo',
}

const entry: ActionRunHistoryEntry = { command: 'git commit', commit, completedAt: commit.completedAt, output: '', prompt: '', status: 'completed' }

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
        render(<DiffView entry={entry} generateDiff={generateDiff} openDiffLine={vi.fn()} />)

        await waitFor(() => expect(screen.getByRole('region', { name: 'Commit diff' })).toBeInTheDocument())
        expect(screen.getAllByText('design/F-010.md').length).toBeGreaterThan(0)
        expect(generateDiff).toHaveBeenCalledWith(entry)
    })

    it('shows a clear error when the diff command fails', async () => {
        const generateDiff = vi.fn(async () => {
            throw new Error('Diff command failed: fatal: bad object')
        })
        render(<DiffView entry={entry} generateDiff={generateDiff} openDiffLine={vi.fn()} />)

        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Diff command failed: fatal: bad object'))
    })
})
