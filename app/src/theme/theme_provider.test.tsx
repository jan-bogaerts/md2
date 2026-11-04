import { useTheme } from '@mui/material'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { configService } from '../services/config/config_service'
import { dataService } from '../services/data/data_service'
import { dialogService } from '../services/dialog_service'
import { createAppTheme } from './app_theme'
import { useAppTheme } from './use_app_theme'
import { AppThemeProvider } from './theme_provider'
import { DEFAULT_COLOR_SCHEME, MARKDOWN_STYLE_PRESETS } from './theme_config'

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

const themeWrapper = ({ children }: { children: ReactNode }) => <AppThemeProvider>{children}</AppThemeProvider>

function projectBackgroundFor(shade: 'blue' | 'neutral') {
    return createAppTheme('light', DEFAULT_COLOR_SCHEME, shade).palette.custom.projectBackground
}

describe('AppThemeProvider', () => {
    afterEach(() => {
        cleanup()
        configService.clear()
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

    describe('project background shade', () => {
        it('uses the neutral shade when project config is unavailable', () => {
            const { result } = renderHook(() => useTheme(), { wrapper: themeWrapper })

            expect(result.current.palette.custom.projectBackground).toBe(projectBackgroundFor('neutral'))
        })

        it('applies a saved background shade without a project-wide data event', () => {
            configService.init()
            configService.loadProjectConfig({ backgroundShade: 'neutral' })
            const dataServiceDispatch = vi.spyOn(dataService, 'dispatchEvent')
            const { result } = renderHook(() => useTheme(), { wrapper: themeWrapper })

            act(() => {
                configService.loadDraft()
                configService.setDraftValue('project.backgroundShade', 'blue')
                configService.saveDraft()
            })

            expect(result.current.palette.custom.projectBackground).toBe(projectBackgroundFor('blue'))
            expect(dataServiceDispatch).not.toHaveBeenCalled()
        })

        it('keeps the current shade while the change is only drafted', () => {
            configService.init()
            configService.loadProjectConfig({ backgroundShade: 'neutral' })
            const { result } = renderHook(() => useTheme(), { wrapper: themeWrapper })

            act(() => {
                configService.loadDraft()
                configService.setDraftValue('project.backgroundShade', 'blue')
            })

            expect(result.current.palette.custom.projectBackground).toBe(projectBackgroundFor('neutral'))
        })

        it('keeps the theme instance when an unrelated config value changes', () => {
            configService.init()
            configService.loadProjectConfig({ backgroundShade: 'blue' })
            const { result } = renderHook(() => useTheme(), { wrapper: themeWrapper })
            const initialTheme = result.current

            act(() => configService.set('project.deleteBranchAfterIntegration', true))

            expect(result.current).toBe(initialTheme)
        })
    })
})
