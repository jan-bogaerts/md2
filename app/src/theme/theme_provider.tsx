import { CssBaseline, ThemeProvider } from '@mui/material'
import { useEffect, useMemo, type ReactNode } from 'react'
import { createAppTheme } from './app_theme'
import { getElectronThemeBridge } from './electron_theme_bridge'
import { AppThemeContext, type AppThemeContextValue } from './theme_context'
import { MARKDOWN_STYLE_PRESETS } from './theme_config'
import { useThemeSettings } from './use_theme_settings'

interface AppThemeProviderProps {
    children: ReactNode
}

/**
 * Global theme service: owns the persisted theme settings, builds the MUI theme
 * from them and provides both the MUI ThemeProvider and the app theme context so
 * every component refreshes on change. Also mirrors the palette mode into the
 * Electron main process when running on the desktop.
 */
export function AppThemeProvider(props: AppThemeProviderProps) {
    const { children } = props
    const settings = useThemeSettings()
    const { mode, colorScheme, markdownStyle } = settings

    const theme = useMemo(() => createAppTheme(mode, colorScheme), [mode, colorScheme])

    useEffect(() => {
        getElectronThemeBridge()?.setThemeMode(mode)
    }, [mode])

    const contextValue = useMemo<AppThemeContextValue>(
        () => ({
            mode,
            colorScheme,
            markdownStyle,
            markdownStyleConfig: MARKDOWN_STYLE_PRESETS[markdownStyle],
            toggleMode: settings.toggleMode,
            setColorScheme: settings.setColorScheme,
            setMarkdownStyle: settings.setMarkdownStyle,
        }),
        [mode, colorScheme, markdownStyle, settings.toggleMode, settings.setColorScheme, settings.setMarkdownStyle],
    )

    return (
        <AppThemeContext.Provider value={contextValue}>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                {children}
            </ThemeProvider>
        </AppThemeContext.Provider>
    )
}
