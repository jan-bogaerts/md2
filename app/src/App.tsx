import { CssBaseline, ThemeProvider } from '@mui/material'
import { useMemo } from 'react'
import { useGithubAuth } from './auth/use_github_auth'
import { useAppBootstrap } from './app/use_app_bootstrap'
import { MainWindow } from './components/shell/main_window'
import { StartupSplash } from './components/shell/startup_splash'
import { ThemeToggleButton } from './components/shell/theme_toggle_button'
import { createAppTheme } from './theme/app_theme'
import { useThemeMode } from './theme/use_theme_mode'

export function App() {
    const auth = useGithubAuth()
    const { mode, toggleMode } = useThemeMode()
    const bootstrap = useAppBootstrap(auth.accessToken)
    const theme = useMemo(() => createAppTheme(mode), [mode])

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {bootstrap.phase === 'starting' ? (
                <StartupSplash />
            ) : (
                <MainWindow
                    agents={[]}
                    auth={auth}
                    session={bootstrap.session}
                    toolbarAction={<ThemeToggleButton onToggleTheme={toggleMode} />}
                />
            )}
        </ThemeProvider>
    )
}
