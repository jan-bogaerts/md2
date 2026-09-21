import { useEffect, useRef } from 'react'
import { useGithubAuth } from './auth/use_github_auth'
import { useAppBootstrap } from './app/use_app_bootstrap'
import { DialogDisplay } from './components/dialog_display'
import { MergeConflictDialog } from './components/merge_conflict_dialog'
import { ProjectWindowTitle } from './components/project_window_title'
import { MainWindow } from './components/shell/main_window'
import { StartupSplash } from './components/shell/startup_splash'
import { RemoteControlButton } from './components/shell/remote_control_button'
import { UpdateNotification } from './components/shell/update_notification'
import { AppThemeProvider } from './theme/theme_provider'
import { dialogService } from './services/dialog_service'
import type { ApplicationStartupService } from './services/application_startup_service'
import { SentryImportConfirmationDialog } from './components/sentry_import_confirmation_dialog'
import { updateService } from './services/update_service'

interface AppProps {
    startupService?: ApplicationStartupService
}

export function App({ startupService }: AppProps = {}) {
    const auth = useGithubAuth()
    const bootstrap = useAppBootstrap(startupService)
    const reportedBootstrapErrorRef = useRef<string | null>(null)

    useEffect(() => {
        void updateService.start()

        return () => updateService.stop()
    }, [])

    useEffect(() => {
        if (!bootstrap.error) {
            reportedBootstrapErrorRef.current = null

            return
        }

        if (bootstrap.error === reportedBootstrapErrorRef.current) return

        dialogService.error(`Could not restore last project: ${bootstrap.error}`)
        reportedBootstrapErrorRef.current = bootstrap.error
    }, [bootstrap.error])

    return (
        <AppThemeProvider>
            <DialogDisplay />
            <ProjectWindowTitle />
            <UpdateNotification />
            <MergeConflictDialog />
            <SentryImportConfirmationDialog />
            {bootstrap.phase === 'starting' ? (
                <StartupSplash />
            ) : (
                <MainWindow
                    auth={auth}
                    initialProjectOpenResolution={bootstrap.projectOpenResolution}
                    toolbarAction={(
                        <RemoteControlButton />
                    )}
                />
            )}
        </AppThemeProvider>
    )
}
