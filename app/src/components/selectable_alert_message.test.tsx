import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SelectableAlertMessage } from './selectable_alert_message'

describe('SelectableAlertMessage', () => {
    it('renders alert text in a read-only selectable textbox', () => {
        render(<SelectableAlertMessage message="Save failed" />)

        const message = screen.getByRole('textbox', { name: 'Error message' })

        expect(message).toHaveValue('Save failed')
        expect(message).toHaveAttribute('readonly')
        expect(message).toHaveStyle({ cursor: 'text', height: '1.5em', userSelect: 'text' })
    })
})
