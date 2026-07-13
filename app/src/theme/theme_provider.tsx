import { CssBaseline, ThemeProvider } from '@mui/material'
import { useEffect, useMemo, type ReactNode } from 'react'
import { createAppTheme } from './app_theme'
import { getElectronThemeBridge } from './electron_theme_bridge'
import { AppThemeContext, type AppThemeContextValue } from './theme_context'
import { useThemeSettings } from './use_theme_settings'
import { useProjectConfig } from '../components/hooks/use_project_config'

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
    const { mode, colorScheme, markdownStyle, markdownStyleConfig } = settings
    const projectConfig = useProjectConfig()
    const backgroundShade = projectConfig?.backgroundShade ?? 'neutral'

    const theme = useMemo(() => createAppTheme(mode, colorScheme, backgroundShade), [mode, colorScheme, backgroundShade])

    useEffect(() => {
        getElectronThemeBridge()?.setThemeMode(mode)
    }, [mode])

    const contextValue = useMemo<AppThemeContextValue>(
        () => ({
            mode,
            colorScheme,
            markdownStyle,
            markdownStyleConfig,
            toggleMode: settings.toggleMode,
            setColorScheme: settings.setColorScheme,
            setCustomMarkdownStyle: settings.setCustomMarkdownStyle,
            setMarkdownStyle: settings.setMarkdownStyle,
        }),
        [
            mode,
            colorScheme,
            markdownStyle,
            markdownStyleConfig,
            settings.toggleMode,
            settings.setColorScheme,
            settings.setCustomMarkdownStyle,
            settings.setMarkdownStyle,
        ],
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
