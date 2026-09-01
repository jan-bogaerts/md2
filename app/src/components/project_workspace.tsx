import { Box, Paper, Typography, useMediaQuery, useTheme } from '@mui/material'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { UseGithubAuthResult } from '../auth/use_github_auth'
import {
    DEFAULT_CARD_TYPES,
    DEFAULT_ACTIONS_FOLDER,
    DEFAULT_ARCHIVED_FOLDER,
    DEFAULT_PROJECT_FOLDER,
    DEFAULT_RELEASES_FOLDER,
    DEFAULT_STATES,
    defaultColumnAccent,
} from '../data/data_types'
import { dataService } from '../services/data/data_service'
import { dialogService } from '../services/dialog_service'
import { getElectronLifecycleBridge, type ElectronFlushRequest, type ElectronLifecycleBridge } from '../services/electron_lifecycle_bridge'
import { openFilesService } from '../services/open_files_service'
import type { OpenDocument } from '../services/open_files_service'
import { telemetryService } from '../services/telemetry/telemetry_service'
import { workspaceViewService } from '../services/project/workspace_view_service'
import {
    workspaceNavigationService,
    type WorkspaceOpenRequest,
    type WorkspaceRevealCardRequest,
} from '../services/project/workspace_navigation_service'
import { mobileCardViewService } from '../services/project/mobile_card_view_service'
import { projectPersistenceService } from '../services/project/project_persistence_service'
import { CardView } from './card_view/card_view'
import { MobileCardViewMenu } from './card_view/mobile_card_view_menu'
import { MobileCardView } from './card_view/mobile_card_view'
import { CardActionPopupHost } from './actions/run/popup/card_action_popup_host'
import { stageMarkdownEditors } from '../services/project/markdown_editor_staging'
import { useProjectReference } from './hooks/use_project_reference'
import { TextView } from './text_view/text_view'
import { FileTreeView } from './text_view/file_tree_view'
import { useProjectConfig } from './hooks/use_project_config'
import { useWorkingFolder } from './hooks/use_working_folder'
import { ProjectWorkspaceAvailability } from './project_workspace_availability'
import { MobileLayout } from './shell/mobile_layout'
import { MobileMainWindow } from './shell/mobile_main_window'
import { SplitLayout } from './shell/split_layout'
import { AttachmentChoiceDialog } from './editor/attachment_choice_dialog'
import { StatsView } from './stats_view/stats_view'
import { DiagramView } from './diagram_view/diagram_view'

const WORKSPACE_PANEL_PADDING = 3

function openDocumentPath(document: OpenDocument) {
    return document.kind === 'card' ? document.getObject().path : document.getObject().sourcePath
}

function flushPendingCommits() {
    void projectPersistenceService.flushPendingChanges().catch((error: unknown) => {
        dialogService.error(error, { fallbackMessage: 'Pending changes could not be saved' })
    })
}

async function flushAndReportPendingCommits(lifecycleBridge: ElectronLifecycleBridge, request: ElectronFlushRequest) {
    try {
        await projectPersistenceService.flushPendingChanges()
        lifecycleBridge.reportFlushResult({ requestId: request.requestId, success: true })
    } catch (error) {
        dialogService.error(error, { fallbackMessage: 'Pending changes could not be saved before closing' })
        lifecycleBridge.reportFlushResult({ requestId: request.requestId, success: false })
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
    const archivedFolder = projectConfig?.archivedFolder ?? `${DEFAULT_PROJECT_FOLDER}/${DEFAULT_ARCHIVED_FOLDER}`
    const releasesFolder = projectConfig?.releasesFolder ?? `${DEFAULT_PROJECT_FOLDER}/${DEFAULT_RELEASES_FOLDER}`
    const mobileScrollContainerRef = useRef<HTMLDivElement>(null)
    const onLeftPanelInteractionRef = useRef(onLeftPanelInteraction)
    const statusColors = useMemo(() => new Map(
        states.map(({ color, state }, index) => [state, color ?? defaultColumnAccent(index)]),
    ), [states])

    useEffect(() => {
        onLeftPanelInteractionRef.current = onLeftPanelInteraction
    })

    const handleCreateFolder = useCallback(async (parentDirectory: string, name: string) => {
        await dataService.cards.createFolder(parentDirectory, name)
    }, [])

    const handleCreateMarkdownFile = useCallback(async (parentDirectory: string, name: string) => {
        await dataService.cards.createMarkdownFile(parentDirectory, name)
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
            const staged = stageMarkdownEditors()
            const { hasPendingPush, hasPendingSave } = projectPersistenceService.getSnapshot()
            // In Electron, vetoing beforeunload silently cancels the window close (no confirm
            // dialog), leaving the app unclosable. The main process flushes pending commits on
            // quit instead, so only prompt in a plain browser build.
            if ((!staged || hasPendingPush || hasPendingSave) && !getElectronLifecycleBridge()) {
                event.preventDefault()
                event.returnValue = ''
            }

            flushPendingCommits()
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') flushPendingCommits()
        }

        const handleBlur = () => flushPendingCommits()

        const handlePageHide = () => flushPendingCommits()

        document.addEventListener('visibilitychange', handleVisibilityChange)
        window.addEventListener('beforeunload', handleBeforeUnload)
        window.addEventListener('blur', handleBlur)
        window.addEventListener('pagehide', handlePageHide)

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            window.removeEventListener('beforeunload', handleBeforeUnload)
            window.removeEventListener('blur', handleBlur)
            window.removeEventListener('pagehide', handlePageHide)
        }
    }, [])

    useEffect(() => {
        const lifecycleBridge = getElectronLifecycleBridge()
        if (!lifecycleBridge) return undefined

        return lifecycleBridge.onFlushRequested((request) => {
            void flushAndReportPendingCommits(lifecycleBridge, request)
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

    useEffect(() => {
        let pendingScrollFrame: number | null = null

        const handleRevealCard = (event: Event) => {
            const { path } = (event as CustomEvent<WorkspaceRevealCardRequest>).detail
            const card = dataService.getState().snapshot?.activeCards.find((candidate) => candidate.path === path)
            if (!card) {
                dialogService.error(new Error(`Active card no longer exists: ${path}`), { fallbackMessage: 'Card could not be revealed' })
                return
            }
            if (isMobile) {
                const status = card.header.status
                if (!status) {
                    dialogService.error(new Error(`Active card has no status: ${path}`), { fallbackMessage: 'Card could not be revealed' })
                    return
                }
                mobileCardViewService.selectColumn(status)
            }

            workspaceViewService.selectPath(path)
            telemetryService.trackEvent('navigation')
            if (pendingScrollFrame !== null) cancelAnimationFrame(pendingScrollFrame)
            pendingScrollFrame = requestAnimationFrame(() => {
                pendingScrollFrame = null
                const cardElement = [...document.querySelectorAll<HTMLElement>('[data-card-path]')]
                    .find((element) => element.dataset.cardPath === path)
                if (!cardElement) {
                    dialogService.error(new Error(`Active card element was not found: ${path}`), { fallbackMessage: 'Card could not be revealed' })
                    return
                }

                cardElement.scrollIntoView({ block: 'nearest', inline: 'nearest' })
            })
        }

        workspaceNavigationService.addEventListener('revealCard', handleRevealCard)

        return () => {
            workspaceNavigationService.removeEventListener('revealCard', handleRevealCard)
            if (pendingScrollFrame !== null) cancelAnimationFrame(pendingScrollFrame)
        }
    }, [isMobile])

    const fileTree = (
        <Box
            aria-label="File tree"
            sx={{ bgcolor: 'action.hover', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
        >
            <FileTreeView
                actionsFolder={actionsFolder}
                archivedFolder={archivedFolder}
                cardTypes={cardTypes}
                onCreateFolder={handleCreateFolder}
                onCreateMarkdownFile={handleCreateMarkdownFile}
                onDeleteFile={handleDeleteFile}
                onDeleteFolder={handleDeleteFolder}
                onLeftPanelInteraction={onLeftPanelInteraction}
                projectFolder={projectFolder}
                releasesFolder={releasesFolder}
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
                archivedFolder={archivedFolder}
                cardTypes={cardTypes}
                projectFolder={projectFolder}
                releasesFolder={releasesFolder}
                states={states}
            />
        </Paper>
    )

    const workspace = (
        <ProjectWorkspaceAvailability>
            {isMobile ? <MobileLayout content={textView} /> : <SplitLayout left={fileTree} right={textView} />}
            {isMobile ? (
                <MobileCardView cardTypes={cardTypes} states={states} statusColors={statusColors} />
            ) : (
                <CardView cardTypes={cardTypes} states={states} statusColors={statusColors} />
            )}
            <StatsView />
            <DiagramView />
            <CardActionPopupHost />
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
            sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: isMobile ? 'unset' : 'hidden' }}
        >
            {isMobile ? (
                <MobileMainWindow
                    auth={auth}
                    cardNavigation={project ? <MobileCardViewMenu onSelected={onLeftPanelInteraction} states={states} /> : null}
                    isMenuOpen={isMenuOpen}
                    leftPanel={navigation}
                    onCloseMenu={onLeftPanelInteraction}
                    rightPanel={workspace}
                    rightPanelContainerRef={mobileScrollContainerRef}
                    showNavigationInCards={!project}
                />
            ) : workspace}
            <AttachmentChoiceDialog />
        </Box>
    )
}
