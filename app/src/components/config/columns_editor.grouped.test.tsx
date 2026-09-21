import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultColumnAccent, type StateConfig } from '../../data/data_types'
import { ColumnsEditor } from './columns_editor'
import { reorderColumns } from './column_reorder'

vi.mock('../hooks/use_actions', () => ({useActions: () => ({ actions: [{ id: 'plan', label: 'Plan' }, { id: 'implement', label: 'Implement' }], error: null })}))

const columns: StateConfig[] = [
    { alwaysVisible: true, color: '#0d47a1', state: 'new' },
    { alwaysVisible: false, color: '#ffee58', defaultActionId: 'plan', state: 'design' },
    { alwaysVisible: true, color: '#4caf50', state: 'ready' },
]

function renderEditor(value: StateConfig[], onChange = vi.fn(), onValidityChange = vi.fn()) {
    render(<ColumnsEditor onChange={onChange} onValidityChange={onValidityChange} value={value} />)

    return { onChange, onValidityChange }
}

function selectDefaultAction(optionLabel: string) {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Default action' }))
    fireEvent.click(within(screen.getByRole('listbox')).getByText(optionLabel))
}

describe('ColumnsEditor', () => {
    afterEach(() => {
        cleanup()
    })

    it('shows one coloured button per column in board order', () => {
        renderEditor(columns)

        const buttons = screen.getAllByRole('button').map((button) => button.textContent)

        expect(buttons).toEqual(['new', 'design', 'ready', 'Add column'])
        expect(screen.getByRole('button', { name: 'new' })).toHaveStyle({ color: '#ffffff' })
        expect(screen.getByRole('button', { name: 'design' })).toHaveStyle({ color: '#000000' })
    })

    it('adds a column with the next default accent and always visible on', () => {
        const { onChange } = renderEditor(columns)

        fireEvent.click(screen.getByRole('button', { name: 'Add column' }))
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'done' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(onChange).toHaveBeenCalledWith([
            ...columns,
            { alwaysVisible: true, color: defaultColumnAccent(columns.length), state: 'done' },
        ])
    })

    it('round-trips always visible and default action through the popup', () => {
        const { onChange } = renderEditor(columns)

        fireEvent.click(screen.getByRole('button', { name: 'new' }))
        fireEvent.click(screen.getByLabelText('Always visible'))
        selectDefaultAction('Implement')
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(onChange).toHaveBeenCalledWith([
            { alwaysVisible: false, color: '#0d47a1', defaultActionId: 'implement', state: 'new' },
            columns[1],
            columns[2],
        ])
    })

    it('omits defaultActionId entirely when None is selected', () => {
        const { onChange } = renderEditor(columns)

        fireEvent.click(screen.getByRole('button', { name: 'design' }))
        selectDefaultAction('None')
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        const savedColumn = onChange.mock.calls[0]![0][1]

        expect(savedColumn).toEqual({ alwaysVisible: false, color: '#ffee58', state: 'design' })
        expect('defaultActionId' in savedColumn).toBe(false)
    })

    it('discards an edit when the popup is cancelled', () => {
        const { onChange } = renderEditor(columns)

        fireEvent.click(screen.getByRole('button', { name: 'new' }))
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'backlog' } })
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(onChange).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'new' })).toBeInTheDocument()
    })

    it('moves a column left and right without touching the other columns', () => {
        const { onChange } = renderEditor(columns)

        fireEvent.click(screen.getByRole('button', { name: 'design' }))
        fireEvent.click(screen.getByRole('button', { name: 'Move left' }))

        expect(onChange).toHaveBeenLastCalledWith([columns[1], columns[0], columns[2]])

        cleanup()
        const second = renderEditor(columns)
        fireEvent.click(screen.getByRole('button', { name: 'design' }))
        fireEvent.click(screen.getByRole('button', { name: 'Move right' }))

        expect(second.onChange).toHaveBeenLastCalledWith([columns[0], columns[2], columns[1]])
    })

    it('disables moving at the first and last position', () => {
        renderEditor(columns)

        fireEvent.click(screen.getByRole('button', { name: 'new' }))

        expect(screen.getByRole('button', { name: 'Move left' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Move right' })).toBeEnabled()

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        fireEvent.click(screen.getByRole('button', { name: 'ready' }))

        expect(screen.getByRole('button', { name: 'Move right' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Move left' })).toBeEnabled()
    })

    it('blocks saving duplicate or empty column names', () => {
        renderEditor(columns)

        fireEvent.click(screen.getByRole('button', { name: 'new' }))
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'design' } })

        expect(screen.getByRole('alert')).toHaveTextContent('Duplicate column: design')
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } })

        expect(screen.getByRole('alert')).toHaveTextContent('Name is required.')
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    it('deletes a column and blocks deleting the last one', () => {
        const { onChange } = renderEditor(columns)

        fireEvent.click(screen.getByRole('button', { name: 'design' }))
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

        expect(onChange).toHaveBeenCalledWith([columns[0], columns[2]])

        cleanup()
        renderEditor([columns[0]!])
        fireEvent.click(screen.getByRole('button', { name: 'new' }))

        expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    })

    it('reports a stored value with duplicate column names as invalid', () => {
        const onValidityChange = vi.fn()

        renderEditor([columns[0]!, { ...columns[1]!, state: 'new' }], vi.fn(), onValidityChange)

        expect(onValidityChange).toHaveBeenLastCalledWith(false)
    })
})

describe('reorderColumns', () => {
    it('moves the dragged column to the target position', () => {
        expect(reorderColumns(columns, 'ready', 'new')).toEqual([columns[2], columns[0], columns[1]])
    })

    it('keeps the order when the column is dropped on itself or on an unknown target', () => {
        expect(reorderColumns(columns, 'new', 'new')).toBe(columns)
        expect(reorderColumns(columns, 'new', 'missing')).toBe(columns)
    })
})
