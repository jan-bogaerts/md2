import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ConfigEntry } from '../../services/config_service'
import { ConfigValueEditor } from './config_value_editor'

describe('ConfigValueEditor', () => {
    it('renders unmarked number entries as number fields', () => {
        const entry: ConfigEntry = {
            defaultValue: 30000,
            description: 'Delay before editor changes are committed after typing stops.',
            editable: true,
            key: 'react.autoCommitDelayMs',
            label: 'Auto commit delay',
            max: 120000,
            min: 1000,
            section: 'react',
            source: 'react',
            type: 'number',
        }
        const handleChange = vi.fn()

        render(<ConfigValueEditor entry={entry} onChange={handleChange} value={30000} />)

        expect(screen.getByRole('spinbutton', { name: 'Auto commit delay' })).toBeInTheDocument()
    })

    it('renders slider entries with configured bounds and updates draft value', () => {
        const entry: ConfigEntry = {
            defaultValue: 30000,
            description: 'Delay before editor changes are committed after typing stops.',
            editable: true,
            input: 'slider',
            key: 'react.autoCommitDelayMs',
            label: 'Auto commit delay',
            max: 120000,
            min: 1000,
            section: 'react',
            source: 'react',
            step: 1000,
            type: 'number',
        }
        const handleChange = vi.fn()

        render(<ConfigValueEditor entry={entry} onChange={handleChange} value={30000} />)
        const slider = screen.getByRole('slider', { name: 'Auto commit delay' })
        fireEvent.change(slider, { target: { value: '5000' } })

        expect(slider).toHaveAttribute('aria-valuemax', '120000')
        expect(slider).toHaveAttribute('aria-valuemin', '1000')
        expect(handleChange).toHaveBeenCalledWith('react.autoCommitDelayMs', 5000)
    })
})
