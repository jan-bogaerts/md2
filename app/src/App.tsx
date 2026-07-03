import { Box, CssBaseline, ThemeProvider } from '@mui/material'
import { useMemo, useState } from 'react'
import { useGithubAuth } from './auth/useGithubAuth'
import { useAppBootstrap } from './app/useAppBootstrap'
import { GithubAuthPanel } from './components/GithubAuthPanel'
import { ProjectWorkspace } from './components/ProjectWorkspace'
import { MainWindow } from './components/shell/MainWindow'
import { StartupSplash } from './components/shell/StartupSplash'
import { createAppTheme } from './theme/appTheme'
import { useThemeMode } from './theme/useThemeMode'

const PANEL_PADDING = 2

export function App() {
    const auth = useGithubAuth()
    const { mode, toggleMode } = useThemeMode()
    const bootstrap = useAppBootstrap(auth.accessToken)
    const [statusInfo, setStatusInfo] = useState('')
    const theme = useMemo(() => createAppTheme(mode), [mode])
    const session = bootstrap.session

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {bootstrap.phase === 'starting' ? (
                <StartupSplash />
            ) : (
                <MainWindow
                    agents={[]}
                    leftPanel={(
                        <Box sx={{ p: PANEL_PADDING }}>
                            <GithubAuthPanel {...auth} />
                        </Box>
                    )}
                    mode={mode}
                    onStatusInfoChange={setStatusInfo}
                    onToggleTheme={toggleMode}
                    rightPanel={(
                        <Box sx={{ p: PANEL_PADDING }}>
                            <ProjectWorkspace
                                key={session?.project.id ?? 'no-project'}
                                accessToken={auth.accessToken}
                                initialDataService={session?.dataService ?? null}
                                initialProject={session?.project ?? null}
                                initialSnapshot={session?.snapshot ?? null}
                                initialStorageType={session?.storageType}
                                isGithubAuthenticated={auth.isAuthenticated}
                            />
                        </Box>
                    )}
                    statusInfo={bootstrap.error ?? statusInfo}
                />
            )}
        </ThemeProvider>
    )
}
