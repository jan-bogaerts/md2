import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CardTypeConfig } from '../../data/data_types'
import { CardTypesEditor } from './card_types_editor'

const cardTypes: CardTypeConfig[] = [
    { color: '#0d47a1', idPrefix: 'F', label: 'Feature', type: 'feature' },
    { color: '#ffee58', idPrefix: 'J', label: 'Job', type: 'job' },
]

function renderEditor(value: CardTypeConfig[], onChange = vi.fn(), onValidityChange = vi.fn()) {
    render(<CardTypesEditor onChange={onChange} onValidityChange={onValidityChange} value={value} />)

    return { onChange, onValidityChange }
}

describe('CardTypesEditor', () => {
    afterEach(() => {
        cleanup()
    })

    it('shows one coloured button per card type with readable text', () => {
        renderEditor(cardTypes)

        expect(screen.getByRole('button', { name: 'Feature' })).toHaveStyle({ color: '#ffffff' })
        expect(screen.getByRole('button', { name: 'Job' })).toHaveStyle({ color: '#000000' })
    })

    it('adds a card type from the popup', () => {
        const { onChange } = renderEditor(cardTypes)

        fireEvent.click(screen.getByRole('button', { name: 'Add card type' }))
        fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Bug' } })
        fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'bug' } })
        fireEvent.change(screen.getByLabelText('ID prefix'), { target: { value: 'B' } })
        fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#ff0000' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(onChange).toHaveBeenCalledWith([
            ...cardTypes,
            { color: '#ff0000', idPrefix: 'B', label: 'Bug', type: 'bug' },
        ])
    })

    it('edits the label and colour of an existing card type', () => {
        const { onChange } = renderEditor(cardTypes)

        fireEvent.click(screen.getByRole('button', { name: 'Feature' }))
        fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Epic' } })
        fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#00ff00' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(onChange).toHaveBeenCalledWith([
            { color: '#00ff00', idPrefix: 'F', label: 'Epic', type: 'feature' },
            cardTypes[1],
        ])
    })

    it('warns that renaming a type leaves existing cards behind', () => {
        renderEditor(cardTypes)

        fireEvent.click(screen.getByRole('button', { name: 'Feature' }))

        expect(screen.getByText(/lose their colour and ID prefix/u)).toBeInTheDocument()
    })

    it('discards an edit when the popup is cancelled', () => {
        const { onChange } = renderEditor(cardTypes)

        fireEvent.click(screen.getByRole('button', { name: 'Feature' }))
        fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Epic' } })
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(onChange).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Feature' })).toBeInTheDocument()
    })

    it('deletes a card type and blocks deleting the last one', () => {
        const { onChange } = renderEditor(cardTypes)

        fireEvent.click(screen.getByRole('button', { name: 'Job' }))
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

        expect(onChange).toHaveBeenCalledWith([cardTypes[0]])

        cleanup()
        renderEditor([cardTypes[0]!])
        fireEvent.click(screen.getByRole('button', { name: 'Feature' }))

        expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    })

    it('blocks saving duplicate type or ID prefix values', () => {
        renderEditor(cardTypes)

        fireEvent.click(screen.getByRole('button', { name: 'Feature' }))
        fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'job' } })

        expect(screen.getByRole('alert')).toHaveTextContent('Duplicate card type: job')
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

        fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'feature' } })
        fireEvent.change(screen.getByLabelText('ID prefix'), { target: { value: 'J' } })

        expect(screen.getByRole('alert')).toHaveTextContent('Duplicate ID prefix: J')
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    it('blocks saving empty label, type or ID prefix values', () => {
        renderEditor(cardTypes)

        fireEvent.click(screen.getByRole('button', { name: 'Feature' }))
        fireEvent.change(screen.getByLabelText('Label'), { target: { value: '' } })

        expect(screen.getByRole('alert')).toHaveTextContent('Label is required.')
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

        fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Feature' } })
        fireEvent.change(screen.getByLabelText('ID prefix'), { target: { value: '' } })

        expect(screen.getByRole('alert')).toHaveTextContent('ID prefix is required.')
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    it('reports a stored value with duplicate types as invalid', () => {
        const onValidityChange = vi.fn()

        renderEditor([cardTypes[0]!, { ...cardTypes[1]!, type: 'feature' }], vi.fn(), onValidityChange)

        expect(onValidityChange).toHaveBeenLastCalledWith(false)
    })
})
