import { Box, Paper, Typography, useMediaQuery, useTheme } from '@mui/material'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { UseGithubAuthResult } from '../auth/use_github_auth'
import {
    DEFAULT_CARD_TYPES,
    DEFAULT_ACTIONS_FOLDER,
    DEFAULT_PROJECT_FOLDER,
    DEFAULT_STATES,
    defaultColumnAccent,
} from '../data/data_types'
import { dataService } from '../services/data/data_service'
import { dialogService } from '../services/dialog_service'
import { getElectronLifecycleBridge, type ElectronLifecycleBridge } from '../services/electron_lifecycle_bridge'
import { openFilesService } from '../services/open_files_service'
import type { OpenDocument } from '../services/open_files_service'
import { telemetryService } from '../services/telemetry/telemetry_service'
import { workspaceViewService } from '../services/project/workspace_view_service'
import { workspaceNavigationService, type WorkspaceOpenRequest } from '../services/project/workspace_navigation_service'
import { projectPersistenceService } from '../services/project/project_persistence_service'
import { CardView } from './card_view/card_view'
import { flushMarkdownEditors } from './editor/markdown_editor_flush'
import { useProjectReference } from './hooks/use_project_reference'
import { TextView } from './text_view/text_view'
import { FileTreeView } from './text_view/file_tree_view'
import { useProjectConfig } from './hooks/use_project_config'
import { useWorkingFolder } from './hooks/use_working_folder'
import { ProjectWorkspaceAvailability } from './project_workspace_availability'
import { MobileMainWindow } from './shell/mobile_main_window'
import { SplitLayout } from './shell/split_layout'

const WORKSPACE_PANEL_PADDING = 3

function openDocumentPath(document: OpenDocument) {
    return document.kind === 'card' ? document.getObject().path : document.getObject().sourcePath
}

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
    auth: UseGithubAuthResult
    isMenuOpen: boolean
    onLeftPanelInteraction: () => void
}

export function ProjectWorkspace(props: ProjectWorkspaceProps) {
    const { auth, isMenuOpen, onLeftPanelInteraction } = props
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const project = useProjectReference()
    const projectConfig = useProjectConfig()
    const workingFolder = useWorkingFolder()
    const cardTypes = projectConfig?.cardTypes ?? DEFAULT_CARD_TYPES
    const states = projectConfig?.states ?? DEFAULT_STATES
    const projectFolder = projectConfig?.projectFolder ?? DEFAULT_PROJECT_FOLDER
    const actionsFolder = projectConfig?.actionsFolder ?? `${DEFAULT_PROJECT_FOLDER}/${DEFAULT_ACTIONS_FOLDER}`
    const onLeftPanelInteractionRef = useRef(onLeftPanelInteraction)
    const statusColors = useMemo(() => new Map(
        states.map(({ color, state }, index) => [state, color ?? defaultColumnAccent(index)]),
    ), [states])

    useEffect(() => {
        onLeftPanelInteractionRef.current = onLeftPanelInteraction
    })

    const handleCreateFolder = useCallback(async (parentDirectory: string, name: string) => {
        try {
            await dataService.cards.createFolder(parentDirectory, name)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Folder creation failed: ${name}` })
            throw error
        }
    }, [])

    const handleCreateMarkdownFile = useCallback(async (parentDirectory: string, name: string) => {
        try {
            await dataService.cards.createMarkdownFile(parentDirectory, name)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Markdown file creation failed: ${name}` })
            throw error
        }
    }, [])

    const handleDeleteFile = useCallback(async (path: string) => {
        try {
            await dataService.cards.deleteFile(path)
            const document = openFilesService.getSnapshot().documents.find((candidate) => openDocumentPath(candidate) === path)
            if (document) openFilesService.closeDocument(document)
            workspaceViewService.clearSelectedPath(path)
            onLeftPanelInteractionRef.current()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `File delete failed: ${path}` })
            throw error
        }
    }, [])

    const handleDeleteFolder = useCallback(async (path: string) => {
        try {
            await dataService.cards.deleteFolder(path)
            const folderPrefix = `${path.replace(/\/+$/u, '')}/`
            const documents = openFilesService.getSnapshot().documents
            for (const document of documents) {
                const openPath = openDocumentPath(document)
                if (openPath?.startsWith(folderPrefix)) openFilesService.closeDocument(document)
            }
            const selectedPath = workspaceViewService.getSnapshot().selectedPath
            if (selectedPath?.startsWith(folderPrefix)) workspaceViewService.clearSelectedPath(selectedPath)
            onLeftPanelInteractionRef.current()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Folder deletion failed: ${path}` })
            throw error
        }
    }, [])

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

    const fileTree = (
        <Box
            aria-label="File tree"
            sx={{ bgcolor: 'action.hover', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
        >
            <FileTreeView
                actionsFolder={actionsFolder}
                cardTypes={cardTypes}
                onCreateFolder={handleCreateFolder}
                onCreateMarkdownFile={handleCreateMarkdownFile}
                onDeleteFile={handleDeleteFile}
                onDeleteFolder={handleDeleteFolder}
                onLeftPanelInteraction={onLeftPanelInteraction}
                projectFolder={projectFolder}
                statusColors={statusColors}
                workingFolder={workingFolder}
            />
        </Box>
    )
    const textView = (
        <Paper
            elevation={0}
            sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 2,
                boxSizing: 'border-box',
                display: 'flex',
                height: '100%',
                minHeight: 0,
                overflow: 'hidden',
                p: WORKSPACE_PANEL_PADDING,
            }}
        >
            <TextView
                actionsFolder={actionsFolder}
                cardTypes={cardTypes}
                projectFolder={projectFolder}
                states={states}
            />
        </Paper>
    )
    const views = (
        <>
            {isMobile ? textView : <SplitLayout left={fileTree} right={textView} />}
            <CardView cardTypes={cardTypes} isMobile={isMobile} states={states} />
        </>
    )
    const workspace = (
        <ProjectWorkspaceAvailability>
            {views}
        </ProjectWorkspaceAvailability>
    )
    const navigation = project ? fileTree : (
        <Box sx={{ p: 2 }}>
            <Typography color="text.secondary" variant="body2">
                No project navigation available.
            </Typography>
        </Box>
    )

    return (
        <Box
            aria-label="Project workspace"
            component="section"
            sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}
        >
            {isMobile ? (
                <MobileMainWindow
                    auth={auth}
                    isMenuOpen={isMenuOpen}
                    leftPanel={navigation}
                    onCloseMenu={onLeftPanelInteraction}
                    rightPanel={workspace}
                    showNavigationInCards={!project}
                />
            ) : workspace}
        </Box>
    )
}
