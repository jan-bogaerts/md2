import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ActionEditorField } from './action_editor_field'

describe('ActionEditorField', () => {
    afterEach(cleanup)

    it('shows a persistent label and associates helper text with the control', () => {
        render(
            <AppThemeProvider>
                <ActionEditorField error fieldId="test-action-name" helperText="Name is required" label="Name" value="" />
            </AppThemeProvider>,
        )

        const control = screen.getByLabelText('Name')
        const helperText = screen.getByText('Name is required')

        expect(screen.getByText('Name', { selector: 'label' })).toBeVisible()
        expect(control).toHaveAttribute('aria-describedby', helperText.id)
        expect(control).toHaveAttribute('aria-labelledby', 'test-action-name-label')
        expect(control).toHaveAttribute('aria-invalid', 'true')
    })
})
