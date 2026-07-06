import { useGithubAuth } from './auth/use_github_auth'
import { useAppBootstrap } from './app/use_app_bootstrap'
import { MainWindow } from './components/shell/main_window'
import { StartupSplash } from './components/shell/startup_splash'
import { RemoteControlButton } from './components/shell/remote_control_button'
import { ThemeControls } from './components/shell/theme_controls'
import { useProjectState } from './components/hooks/use_project_state'
import { AppThemeProvider } from './theme/theme_provider'
import { readStartupSplashPreference } from './services/config_service'

export function App() {
    const auth = useGithubAuth()
    const bootstrap = useAppBootstrap(auth.accessToken)
    const { runningAgents } = useProjectState()
    const showStartupSplash = readStartupSplashPreference()

    return (
        <AppThemeProvider>
            {bootstrap.phase === 'starting' ? (
                showStartupSplash ? <StartupSplash /> : null
            ) : (
                <MainWindow
                    agents={runningAgents}
                    auth={auth}
                    session={bootstrap.session}
                    toolbarAction={(
                        <>
                            <RemoteControlButton />
                            <ThemeControls />
                        </>
                    )}
                />
            )}
        </AppThemeProvider>
    )
}
