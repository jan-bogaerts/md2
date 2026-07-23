import { Box, Paper, useMediaQuery, useTheme } from '@mui/material'
import { useEffect } from 'react'
import {
    DEFAULT_CARD_TYPES,
    DEFAULT_ACTIONS_FOLDER,
    DEFAULT_PROJECT_FOLDER,
    DEFAULT_STATES,
} from '../data/data_types'
import { dialogService } from '../services/dialog_service'
import { getElectronLifecycleBridge, type ElectronLifecycleBridge } from '../services/electron_lifecycle_bridge'
import { openFilesService } from '../services/open_files_service'
import { telemetryService } from '../services/telemetry/telemetry_service'
import { workspaceViewService } from '../services/project/workspace_view_service'
import { workspaceNavigationService, type WorkspaceOpenRequest } from '../services/project/workspace_navigation_service'
import { projectPersistenceService } from '../services/project/project_persistence_service'
import { CardView } from './card_view/card_view'
import { flushMarkdownEditors } from './editor/markdown_editor_flush'
import { TextView } from './text_view/text_view'
import { useProjectConfig } from './hooks/use_project_config'
import { useWorkspaceView } from './hooks/use_workspace_view'
import { ProjectWorkspaceAvailability } from './project_workspace_availability'

const WORKSPACE_PANEL_PADDING = 3

function flushPendingCommits() {
    flushMarkdownEditors()
    void projectPersistenceService.flushPendingChanges().catch((error: unknown) => {
        dialogService.error(error, { fallbackMessage: 'Pending changes could not be saved' })
    })
}

async function flushAndConfirmPendingCommits(lifecycleBridge: ElectronLifecycleBridge, requestId: string) {
    try {
        flushMarkdownEditors()
        await projectPersistenceService.flushPendingChanges()
        lifecycleBridge.confirmFlush(requestId)
    } catch (error) {
        dialogService.error(error, { fallbackMessage: 'Pending changes could not be saved before closing' })
    }
}

function runWorkspaceEdit(action: () => void, fallbackMessage: string) {
    try {
        action()
    } catch (error) {
        dialogService.error(error, { fallbackMessage })
    }
}

interface ProjectWorkspaceProps {
    onLeftPanelInteraction: () => void
}

export function ProjectWorkspace(props: ProjectWorkspaceProps) {
    const { onLeftPanelInteraction } = props
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const { viewMode } = useWorkspaceView()
    const projectConfig = useProjectConfig()
    const cardTypes = projectConfig?.cardTypes ?? DEFAULT_CARD_TYPES
    const states = projectConfig?.states ?? DEFAULT_STATES
    const projectFolder = projectConfig?.projectFolder ?? DEFAULT_PROJECT_FOLDER
    const actionsFolder = projectConfig?.actionsFolder ?? `${DEFAULT_PROJECT_FOLDER}/${DEFAULT_ACTIONS_FOLDER}`

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            flushMarkdownEditors()
            const { hasPendingPush, hasPendingSave } = projectPersistenceService.getSnapshot()
            // In Electron, vetoing beforeunload silently cancels the window close (no confirm
            // dialog), leaving the app unclosable. The main process flushes pending commits on
            // quit instead, so only prompt in a plain browser build.
            if ((hasPendingPush || hasPendingSave) && !getElectronLifecycleBridge()) {
                event.preventDefault()
                event.returnValue = ''
            }

            flushPendingCommits()
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') flushPendingCommits()
        }

        const handleBlur = () => {
            flushMarkdownEditors()
            if (projectPersistenceService.getSnapshot().hasPendingSave) flushPendingCommits()
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        window.addEventListener('beforeunload', handleBeforeUnload)
        window.addEventListener('blur', handleBlur)

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            window.removeEventListener('beforeunload', handleBeforeUnload)
            window.removeEventListener('blur', handleBlur)
        }
    }, [])

    useEffect(() => {
        const lifecycleBridge = getElectronLifecycleBridge()
        if (!lifecycleBridge) return undefined

        return lifecycleBridge.onFlushRequested((requestId) => {
            void flushAndConfirmPendingCommits(lifecycleBridge, requestId)
        })
    }, [])

    useEffect(() => {
        const handleNavigationOpen = (event: Event) => {
            const { path } = (event as CustomEvent<WorkspaceOpenRequest>).detail
            // Reveal the card/file without changing the current view mode: highlight it in card view
            // and open it in the service-owned text-view tabs.
            workspaceViewService.selectPath(path)
            runWorkspaceEdit(() => openFilesService.openPath(path), `File open failed: ${path}`)
            telemetryService.trackEvent('navigation')
        }

        workspaceNavigationService.addEventListener('open', handleNavigationOpen)

        return () => workspaceNavigationService.removeEventListener('open', handleNavigationOpen)
    }, [])

    return (
        <Paper
            aria-label="Project workspace"
            component="section"
            elevation={0}
            sx={{
                bgcolor: viewMode === 'cards' ? 'background.default' : 'background.paper',
                border: viewMode === 'cards' ? 0 : 1,
                borderColor: 'divider',
                borderRadius: viewMode === 'cards' ? 0 : 2,
                display: 'flex',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
                p: viewMode === 'cards' ? 0 : WORKSPACE_PANEL_PADDING,
            }}
        >
            <Box
                aria-label="Project workspace content"
                role="region"
                sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'auto' }}
                tabIndex={0}
            >
                <ProjectWorkspaceAvailability>
                    <>
                        <CardView
                            cardTypes={cardTypes}
                            isMobile={isMobile}
                            states={states}
                            visible={viewMode === 'cards'}
                        />
                        <TextView
                            actionsFolder={actionsFolder}
                            cardTypes={cardTypes}
                            onLeftPanelInteraction={onLeftPanelInteraction}
                            projectFolder={projectFolder}
                            states={states}
                            visible={viewMode === 'text'}
                        />
                    </>
                </ProjectWorkspaceAvailability>
            </Box>
        </Paper>
    )
}
