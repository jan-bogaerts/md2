import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionAppliesTo } from '../../data/action_types'
import type { WorktreeRecord } from '../../data/data_types'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ActionFilterEditor } from './action_filter_editor'

const worktrees: WorktreeRecord[] = [
    { branch: 'feature/one', error: null, path: 'C:\\work trees\\one', valid: true },
]

interface FilterEditorHarnessProps {
    initialValue?: ActionAppliesTo
    onChange?: (value: ActionAppliesTo | undefined) => void
    repositoryFiles?: string[]
    valueWorktrees?: WorktreeRecord[]
}

function FilterEditorHarness(props: FilterEditorHarnessProps) {
    const { initialValue, onChange, repositoryFiles = [], valueWorktrees = worktrees } = props
    const [value, setValue] = useState<ActionAppliesTo | undefined>(initialValue)

    const handleChange = (nextValue: ActionAppliesTo | undefined) => {
        setValue(nextValue)
        onChange?.(nextValue)
    }

    return (
        <AppThemeProvider>
            <ActionFilterEditor
                cardTypes={['feature', 'bug']}
                onChange={handleChange}
                repositoryFiles={repositoryFiles}
                specialContextTypes={['actions', 'history']}
                states={['design', 'ready']}
                value={value}
                worktrees={valueWorktrees}
            />
        </AppThemeProvider>
    )
}

describe('ActionFilterEditor', () => {
    afterEach(cleanup)

    it('builds field and type choices from context descriptors and configured types', () => {
        render(<FilterEditorHarness initialValue={{ type: 'legacy' }} />)

        fireEvent.mouseDown(screen.getByLabelText('Context field'))
        const fieldOptions = within(screen.getByRole('listbox'))
        expect(fieldOptions.getAllByRole('option').map((option) => option.textContent)).toEqual([
            'Target kind', 'Context type', 'Card state', 'Repository file', 'Repository folder', 'Worktree', 'Worktree error',
        ])
        fireEvent.click(fieldOptions.getByRole('option', { name: 'Context type' }))

        fireEvent.mouseDown(screen.getByLabelText('Context type'))
        const valueOptions = within(screen.getByRole('listbox'))
        expect(valueOptions.getByRole('option', { name: 'feature' })).toBeInTheDocument()
        expect(valueOptions.getByRole('option', { name: 'actions' })).toBeInTheDocument()
        expect(valueOptions.getByRole('option', { name: 'legacy (current)' })).toBeInTheDocument()
    })

    it('uses configured selectors for target kind and card state', () => {
        render(<FilterEditorHarness initialValue={{ kind: 'card', state: 'design' }} />)

        fireEvent.mouseDown(screen.getByLabelText('Target kind'))
        let options = within(screen.getByRole('listbox'))
        expect(options.getAllByRole('option').map((option) => option.textContent)).toEqual(['card', 'file', 'folder', 'project'])
        fireEvent.click(options.getByRole('option', { name: 'card' }))

        fireEvent.mouseDown(screen.getByLabelText('Card state'))
        options = within(screen.getByRole('listbox'))
        expect(options.getAllByRole('option').map((option) => option.textContent)).toEqual(['design', 'ready'])
    })

    it('offers repository files, folder names, and linked worktrees while retaining stale values', () => {
        const repositoryFiles = ['src\\feature folder\\file name.ts']
        render(
            <FilterEditorHarness
                initialValue={{ file: 'removed file.md', folder: 'feature folder', worktree: '3' }}
                repositoryFiles={repositoryFiles}
            />,
        )

        fireEvent.mouseDown(screen.getByLabelText('Repository file'))
        let options = within(screen.getByRole('listbox'))
        expect(options.getByRole('option', { name: repositoryFiles[0] })).toBeInTheDocument()
        expect(options.getByRole('option', { name: 'removed file.md (current)' })).toBeInTheDocument()
        fireEvent.click(options.getByRole('option', { name: 'removed file.md (current)' }))

        fireEvent.mouseDown(screen.getByLabelText('Repository folder'))
        options = within(screen.getByRole('listbox'))
        expect(options.getByRole('option', { name: 'feature folder' })).toBeInTheDocument()
        fireEvent.click(options.getByRole('option', { name: 'feature folder' }))

        fireEvent.mouseDown(screen.getByLabelText('Worktree'))
        options = within(screen.getByRole('listbox'))
        expect(options.getByRole('option', { name: '1 — C:\\work trees\\one' })).toBeInTheDocument()
        expect(options.getByRole('option', { name: '3 (current)' })).toBeInTheDocument()
    })

    it('keeps stale values visible when repository and worktrees are not loaded', () => {
        render(
            <FilterEditorHarness
                initialValue={{ file: 'design/old file.md', worktree: '2' }}
                valueWorktrees={[]}
            />,
        )

        expect(screen.getByLabelText('Repository file')).toHaveTextContent('design/old file.md (current)')
        expect(screen.getByLabelText('Worktree')).toHaveTextContent('2 (current)')
    })

    it('clears the old value when changing fields and preserves filter order', () => {
        const onChange = vi.fn()
        render(<FilterEditorHarness initialValue={{ state: 'ready', kind: 'card', type: 'feature' }} onChange={onChange} />)

        expect(screen.getAllByLabelText('Context field').map((field) => field.textContent)).toEqual([
            'Card state', 'Target kind', 'Context type',
        ])

        fireEvent.mouseDown(screen.getAllByLabelText('Context field')[0])
        fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Repository file' }))

        expect(onChange).toHaveBeenLastCalledWith({ file: '', kind: 'card', type: 'feature' })
    })

    it('disables fields already used by another filter', () => {
        render(<FilterEditorHarness initialValue={{ kind: 'card', state: 'ready' }} />)

        fireEvent.mouseDown(screen.getAllByLabelText('Context field')[0])
        const options = within(screen.getByRole('listbox'))

        expect(options.getByRole('option', { name: 'Card state' })).toHaveAttribute('aria-disabled', 'true')
        expect(options.getByRole('option', { name: 'Target kind' })).not.toHaveAttribute('aria-disabled', 'true')
    })

    it('edits descriptor-backed custom text values', () => {
        const onChange = vi.fn()
        render(<FilterEditorHarness initialValue={{ worktreeError: 'missing' }} onChange={onChange} />)

        fireEvent.change(screen.getByLabelText('Worktree error'), { target: { value: 'unavailable' } })

        expect(onChange).toHaveBeenLastCalledWith({ worktreeError: 'unavailable' })
    })

    it('adds an empty required value and removes the final filter', () => {
        const onChange = vi.fn()
        render(<FilterEditorHarness onChange={onChange} />)

        fireEvent.click(screen.getByRole('button', { name: 'Add filter' }))
        expect(screen.getByText('Required value')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Add filter' })).toBeDisabled()
        expect(onChange).toHaveBeenLastCalledWith({ kind: '' })

        fireEvent.click(screen.getByRole('button', { name: 'Remove kind filter' }))
        expect(onChange).toHaveBeenLastCalledWith(undefined)
    })
})
