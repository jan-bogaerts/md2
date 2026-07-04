import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppTheme } from './use_app_theme'
import { AppThemeProvider } from './theme_provider'
import { MARKDOWN_STYLE_PRESETS } from './theme_config'

function ThemeProbe() {
    const { mode, markdownStyle, markdownStyleConfig } = useAppTheme()
    return (
        <div>
            <span>mode:{mode}</span>
            <span>style:{markdownStyle}</span>
            <span>font:{markdownStyleConfig.body.fontFamily}</span>
        </div>
    )
}

describe('AppThemeProvider', () => {
    afterEach(() => {
        cleanup()
        window.localStorage.clear()
        delete window.md2Theme
    })

    it('exposes the resolved theme settings to consumers', () => {
        render(
            <AppThemeProvider>
                <ThemeProbe />
            </AppThemeProvider>,
        )

        expect(screen.getByText('mode:light')).toBeInTheDocument()
        expect(screen.getByText('style:modern')).toBeInTheDocument()
        expect(screen.getByText(`font:${MARKDOWN_STYLE_PRESETS.modern.body.fontFamily}`)).toBeInTheDocument()
    })

    it('syncs the palette mode into the Electron bridge when present', () => {
        const setThemeMode = vi.fn()
        window.md2Theme = { setThemeMode }

        render(
            <AppThemeProvider>
                <ThemeProbe />
            </AppThemeProvider>,
        )

        expect(setThemeMode).toHaveBeenCalledWith('light')
    })
})
