import { useGithubAuth } from './auth/use_github_auth'
import { useAppBootstrap } from './app/use_app_bootstrap'
import { MainWindow } from './components/shell/main_window'
import { StartupSplash } from './components/shell/startup_splash'
import { ThemeControls } from './components/shell/theme_controls'
import { AppThemeProvider } from './theme/theme_provider'

export function App() {
    const auth = useGithubAuth()
    const bootstrap = useAppBootstrap(auth.accessToken)

    return (
        <AppThemeProvider>
            {bootstrap.phase === 'starting' ? (
                <StartupSplash />
            ) : (
                <MainWindow
                    agents={[]}
                    auth={auth}
                    session={bootstrap.session}
                    toolbarAction={<ThemeControls />}
                />
            )}
        </AppThemeProvider>
    )
}
