import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ColorPickerButton } from './color_picker_button'

describe('ColorPickerButton', () => {
    afterEach(() => {
        cleanup()
    })

    it('opens the colour picker with a default box on click', () => {
        render(<ColorPickerButton label="Color" onChange={vi.fn()} value="#d32f2f" />)

        expect(screen.queryByRole('button', { name: 'Use default colour' })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Color' }))

        expect(screen.getByRole('button', { name: 'Use default colour' })).toBeInTheDocument()
    })

    it('reports a picked colour', () => {
        const onChange = vi.fn()
        render(<ColorPickerButton label="Color" onChange={onChange} value={undefined} />)

        fireEvent.click(screen.getByRole('button', { name: 'Color' }))
        fireEvent.click(screen.getByRole('button', { name: 'Use colour #2e7d32' }))

        expect(onChange).toHaveBeenCalledWith('#2e7d32')
    })

    it('offers the given palette in the opened picker', () => {
        render(<ColorPickerButton label="Color" onChange={vi.fn()} palette={['#ffcdd2']} value={undefined} />)

        fireEvent.click(screen.getByRole('button', { name: 'Color' }))

        expect(screen.getAllByRole('button', { name: /^Use colour #/ })).toHaveLength(1)
        expect(screen.getByRole('button', { name: 'Use colour #ffcdd2' })).toBeInTheDocument()
    })
})
