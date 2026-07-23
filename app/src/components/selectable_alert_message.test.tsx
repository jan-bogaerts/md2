import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SelectableAlertMessage } from './selectable_alert_message'

describe('SelectableAlertMessage', () => {
    it('renders alert text in a selectable div', () => {
        render(<SelectableAlertMessage message="Save failed" />)

        const message = screen.getByText('Save failed')

        expect(message.tagName).toBe('DIV')
        expect(message).toHaveStyle({ cursor: 'text', userSelect: 'text' })
    })
})
