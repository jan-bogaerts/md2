import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ColorPickerField } from './color_picker_field'
import { COLOR_PICKER_PALETTE } from './color_picker_palette'

const CUSTOM_PALETTE = ['#ffcdd2', '#bbdefb']

function swatchLabels() {
    return screen.getAllByRole('button', { name: /^Use colour #/ }).map((swatch) => swatch.getAttribute('aria-label'))
}

describe('ColorPickerField', () => {
    afterEach(() => {
        cleanup()
    })

    it('does not offer a default colour unless enabled', () => {
        render(<ColorPickerField label="Color" onChange={vi.fn()} value="#d32f2f" />)

        expect(screen.queryByRole('button', { name: 'Use default colour' })).not.toBeInTheDocument()
    })

    it('reports undefined when the default box is picked', () => {
        const onChange = vi.fn()
        render(<ColorPickerField label="Color" onChange={onChange} showDefault value="#d32f2f" />)

        fireEvent.click(screen.getByRole('button', { name: 'Use default colour' }))

        expect(onChange).toHaveBeenCalledWith(undefined)
    })

    it('marks the default box as selected when no colour is set', () => {
        render(<ColorPickerField label="Color" onChange={vi.fn()} showDefault value={undefined} />)

        expect(screen.getByRole('button', { name: 'Use default colour' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('offers the standard palette when no palette is given', () => {
        render(<ColorPickerField label="Color" onChange={vi.fn()} value="#d32f2f" />)

        expect(swatchLabels()).toEqual(COLOR_PICKER_PALETTE.map((preset) => `Use colour ${preset}`))
    })

    it('offers exactly the given palette and reports a picked swatch', () => {
        const onChange = vi.fn()
        render(<ColorPickerField label="Color" onChange={onChange} palette={CUSTOM_PALETTE} value="#d32f2f" />)

        expect(swatchLabels()).toEqual(CUSTOM_PALETTE.map((preset) => `Use colour ${preset}`))
        fireEvent.click(screen.getByRole('button', { name: 'Use colour #bbdefb' }))

        expect(onChange).toHaveBeenCalledWith('#bbdefb')
    })
})
