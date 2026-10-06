import { MenuItem } from '@mui/material';
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ActionEditorField } from './action_editor_field'

describe('ActionEditorField', () => {
    afterEach(cleanup)

    it.each([
        { value: '', selectedLabel: 'None' },
        { value: 'version', selectedLabel: 'Version' },
    ])('shows $selectedLabel for selected value "$value"', ({ value, selectedLabel }) => {
        render(
            <AppThemeProvider>
                <ActionEditorField fieldId="test-action-input" label="Input" select value={value}>
                    <MenuItem value="">None</MenuItem>
                    <MenuItem value="version">Version</MenuItem>
                </ActionEditorField>
            </AppThemeProvider>,
        );

        expect(screen.getByLabelText('Input')).toHaveTextContent(selectedLabel);
    });

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
