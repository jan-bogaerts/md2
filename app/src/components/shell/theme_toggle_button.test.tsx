import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ThemeToggleButton } from './theme_toggle_button'

describe('ThemeToggleButton', () => {
    afterEach(() => {
        cleanup()
        window.localStorage.clear()
    })

    it('toggles the theme through the global service', () => {
        render(
            <AppThemeProvider>
                <ThemeToggleButton />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))

        expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument()
    })
})
