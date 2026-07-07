import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import { MARKDOWN_STYLE_STORAGE_KEY } from '../../theme/use_theme_settings'
import { ThemeControls } from './theme_controls'

function openDialog() {
    render(
        <AppThemeProvider>
            <ThemeControls />
        </AppThemeProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Theme settings' }))
}

describe('ThemeSettingsDialog', () => {
    afterEach(() => {
        cleanup()
        window.localStorage.clear()
    })

    it('opens from the toolbar and shows a live color preview', () => {
        openDialog()

        const dialog = screen.getByRole('dialog')
        expect(within(dialog).getByText('Color scheme')).toBeInTheDocument()
        expect(within(dialog).getByLabelText('Color scheme preview')).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Primary' })).toBeInTheDocument()
    })

    it('persists the selected markdown style preset', () => {
        openDialog()

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Preset' }))
        fireEvent.click(screen.getByRole('option', { name: 'handwritten' }))

        expect(window.localStorage.getItem(MARKDOWN_STYLE_STORAGE_KEY)).toBe('handwritten')
    })

    it('updates the markdown preview when selecting another preset', () => {
        openDialog()

        const preview = screen.getByLabelText('Markdown style preview')
        const initialClassName = preview.className

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Preset' }))
        fireEvent.click(screen.getByRole('option', { name: 'serif' }))

        expect(preview.className).not.toBe(initialClassName)
    })

    it('applies edited colors to the theme', () => {
        openDialog()

        const dialog = screen.getByRole('dialog')
        const primaryRegular = within(dialog).getAllByLabelText('regular')[0]
        fireEvent.change(primaryRegular, { target: { value: '#123456' } })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))

        const stored = JSON.parse(window.localStorage.getItem('md2.colorScheme')!)
        expect(stored.primary.regular).toBe('#123456')
    })
})
