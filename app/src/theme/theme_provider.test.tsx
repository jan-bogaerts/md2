import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dialogService } from '../services/dialog_service'
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
        vi.restoreAllMocks()
    })

    it('reports a missing provider once and returns a safe theme', async () => {
        const error = vi.spyOn(dialogService, 'error')
        const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
        const { result } = renderHook(() => useAppTheme(), { wrapper })

        expect(result.current.mode).toBe('light')
        await waitFor(() => expect(error).toHaveBeenCalledTimes(1))
        expect(error).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'useAppTheme must be used within an AppThemeProvider' }),
            { fallbackMessage: 'Application theme is unavailable' },
        )
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

    it('retains the derived Markdown style across unrelated provider renders', () => {
        const wrapper = ({ children }: { children: ReactNode }) => <AppThemeProvider>{children}</AppThemeProvider>
        const { result, rerender } = renderHook(() => useAppTheme(), { wrapper })
        const initialMarkdownContentSx = result.current.markdownContentSx

        rerender()
        expect(result.current.markdownContentSx).toBe(initialMarkdownContentSx)

        act(() => result.current.toggleMode())
        expect(result.current.markdownContentSx).toBe(initialMarkdownContentSx)
    })

    it('replaces the derived Markdown style when its configuration changes', () => {
        const wrapper = ({ children }: { children: ReactNode }) => <AppThemeProvider>{children}</AppThemeProvider>
        const { result } = renderHook(() => useAppTheme(), { wrapper })
        const initialMarkdownContentSx = result.current.markdownContentSx

        act(() => result.current.setMarkdownStyle('serif'))

        expect(result.current.markdownContentSx).not.toBe(initialMarkdownContentSx)
        expect(result.current.markdownStyleConfig).toBe(MARKDOWN_STYLE_PRESETS.serif)
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
