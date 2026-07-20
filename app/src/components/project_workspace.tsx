import {
    Box, Button, Paper, Stack, Typography,
    useMediaQuery, useTheme,
} from '@mui/material'
import { useEffect, useState } from 'react'
import {
    DEFAULT_CARD_TYPES,
    DEFAULT_ACTIONS_FOLDER,
    DEFAULT_PROJECT_FOLDER,
    DEFAULT_STATES,
    DEFAULT_WORKING_FOLDER,
    type ProjectCard,
    type ProjectReference,
} from '../data/data_types'
import { hasExecutionBackend } from '../data/electron_action_bridge'
import { dataService } from '../services/data/data_service'
import { dialogService } from '../services/dialog_service'
import { getElectronLifecycleBridge, type ElectronLifecycleBridge } from '../services/electron_lifecycle_bridge'
import { openFilesService } from '../services/open_files_service'
import { telemetryService } from '../services/telemetry/telemetry_service'
import { workspaceViewService } from '../services/project/workspace_view_service'
import { workspaceNavigationService, type WorkspaceOpenRequest } from '../services/project/workspace_navigation_service'
import { projectPersistenceService } from '../services/project/project_persistence_service'
import { CardView } from './card_view/card_view'
import { AgentChatFab } from './agents/agent_chat_fab'
import { flushMarkdownEditors } from './editor/markdown_editor_flush'
import { TextView } from './text_view/text_view'
import { useProjectConfig } from './hooks/use_project_config'
import { useProjectState } from './hooks/use_project_state'
import { useWorkspaceView } from './hooks/use_workspace_view'
import { requestOpenProjectDialog } from './project_command_events'

const WORKSPACE_PANEL_PADDING = 3
const EMPTY_CARDS: ProjectCard[] = []
const EMPTY_REPOSITORY_FILES: string[] = []

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

function workspaceProjectKey(project: ProjectReference | null) {
    if (!project) return null

    return `${project.id}:${project.branch}`
}

interface ProjectWorkspaceProps {
    onLeftPanelInteraction: () => void
}

export function ProjectWorkspace(props: ProjectWorkspaceProps) {
    const { onLeftPanelInteraction } = props
    const { project, snapshot } = useProjectState()
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const activeCards = snapshot?.activeCards ?? EMPTY_CARDS
    const backgroundCards = snapshot?.backgroundCards ?? EMPTY_CARDS
    const repositoryFiles = snapshot?.repositoryFiles ?? EMPTY_REPOSITORY_FILES
    const [requestedNonce, setRequestedNonce] = useState(0)
    const { selectedPath, viewMode } = useWorkspaceView()
    const isProjectOpen = !!project
    const projectConfig = useProjectConfig()
    const cardTypes = projectConfig?.cardTypes ?? DEFAULT_CARD_TYPES
    const states = projectConfig?.states ?? DEFAULT_STATES
    const projectFolder = projectConfig?.projectFolder ?? DEFAULT_PROJECT_FOLDER
    const actionsFolder = projectConfig?.actionsFolder ?? `${DEFAULT_PROJECT_FOLDER}/${DEFAULT_ACTIONS_FOLDER}`
    const workingFolder = snapshot?.workingFolder ?? projectConfig?.workingFolder ?? `${DEFAULT_PROJECT_FOLDER}/${DEFAULT_WORKING_FOLDER}`

    useEffect(() => {
        const projectKey = workspaceProjectKey(project)
        workspaceViewService.syncProject(projectKey)
    }, [project])

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
            // and queue it as a text-view tab for when that view is shown.
            workspaceViewService.selectPath(path)
            setRequestedNonce((nonce) => nonce + 1)
            telemetryService.trackEvent('navigation')
        }

        workspaceNavigationService.addEventListener('open', handleNavigationOpen)

        return () => workspaceNavigationService.removeEventListener('open', handleNavigationOpen)
    }, [])

    const handleMoveCard = (path: string, targetStatus: string, targetIndex: number) => {
        runWorkspaceEdit(() => dataService.cards.moveCard(path, targetStatus, targetIndex), `Card move failed: ${path}`)
    }

    const handleTogglePolicy = (path: string, policyKey: string) => {
        runWorkspaceEdit(() => dataService.cards.toggleCardPolicy(path, policyKey), `Policy toggle failed: ${path}`)
    }

    const handleTitleChange = (path: string, title: string) => {
        runWorkspaceEdit(() => dataService.cards.updateCardTitle(path, title), `Title update failed: ${path}`)
    }

    const handleAffectsChange = (path: string, affects: string[]) => {
        runWorkspaceEdit(() => dataService.cards.updateCardAffects(path, affects), `Affects update failed: ${path}`)
    }

    const handleWorktreeChange = (path: string, worktree: number | null) => {
        runWorkspaceEdit(() => dataService.cards.updateCardWorktree(path, worktree), `Worktree assignment failed: ${path}`)
    }

    const handleHeaderFieldChange = (path: string, key: string, value: string) => {
        runWorkspaceEdit(() => dataService.cards.updateCardHeaderFields(path, { [key]: value }), `Header update failed: ${path}`)
    }

    const clearDeletedPathState = (path: string) => {
        workspaceViewService.clearSelectedPath(path)
    }

    const handleDeleteCard = async (path: string) => {
        try {
            await dataService.cards.deleteCard(path)
            clearDeletedPathState(path)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Card delete failed: ${path}` })
            throw error
        }
    }

    const handleDeleteFile = async (path: string) => {
        try {
            await dataService.cards.deleteFile(path)
            clearDeletedPathState(path)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `File delete failed: ${path}` })
            throw error
        }
    }

    const handleDeleteFolder = async (path: string) => {
        try {
            await dataService.cards.deleteFolder(path)
            const folderPrefix = `${path.replace(/\/+$/u, '')}/`
            const documents = openFilesService.getSnapshot().documents
            for (const document of documents) {
                const openPath = document.kind === 'card' ? document.getObject().path : document.getObject().sourcePath
                if (openPath?.startsWith(folderPrefix)) openFilesService.closeDocument(document)
            }
            const selectedPath = workspaceViewService.getSnapshot().selectedPath
            if (selectedPath?.startsWith(folderPrefix)) clearDeletedPathState(selectedPath)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Folder delete failed: ${path}` })
            throw error
        }
    }

    const handleCreateFolder = async (parentDirectory: string, name: string) => {
        try {
            await dataService.cards.createFolder(parentDirectory, name)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Folder creation failed: ${name}` })
            throw error
        }
    }

    const handleCreateMarkdownFile = async (parentDirectory: string, name: string) => {
        try {
            await dataService.cards.createMarkdownFile(parentDirectory, name)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Markdown file creation failed: ${name}` })
            throw error
        }
    }

    const handleOpenInFileMode = (path: string) => {
        workspaceViewService.selectPath(path)
        setRequestedNonce((nonce) => nonce + 1)
        workspaceViewService.setViewMode('text')
        telemetryService.trackEvent('navigation')
    }

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
                {isProjectOpen ? (
                    <>
                        <CardView
                            cardTypes={cardTypes}
                            cards={activeCards}
                            isMobile={isMobile}
                            onAffectsChange={handleAffectsChange}
                            onDeleteCard={handleDeleteCard}
                            onMoveCard={handleMoveCard}
                            onOpenInFileMode={handleOpenInFileMode}
                            onTitleChange={handleTitleChange}
                            onTogglePolicy={handleTogglePolicy}
                            onWorktreeChange={handleWorktreeChange}
                            primaryPath={project.rootPath ?? project.id}
                            projectKey={`${project.id}:${project.branch}`}
                            repositoryFiles={repositoryFiles}
                            selectedPath={selectedPath}
                            states={states}
                            visible={viewMode === 'cards'}
                        />
                        <TextView
                            actionsFolder={actionsFolder}
                            activeCards={activeCards}
                            backgroundCards={backgroundCards}
                            cardTypes={cardTypes}
                            onLeftPanelInteraction={onLeftPanelInteraction}
                            onCreateFolder={handleCreateFolder}
                            onCreateMarkdownFile={handleCreateMarkdownFile}
                            onDeleteFile={handleDeleteFile}
                            onDeleteFolder={handleDeleteFolder}
                            onHeaderFieldChange={handleHeaderFieldChange}
                            onTitleChange={handleTitleChange}
                            onTogglePolicy={handleTogglePolicy}
                            projectFolder={projectFolder}
                            projectKey={`${project.id}:${project.branch}`}
                            requestedNonce={requestedNonce}
                            requestedPath={selectedPath}
                            repositoryFiles={repositoryFiles}
                            states={states}
                            workingFolder={workingFolder}
                            visible={viewMode === 'text'}
                        />
                    </>
                ) : (
                    <Stack
                        spacing={2}
                        sx={{ alignItems: 'center', flex: 1, justifyContent: 'center', px: 3, textAlign: 'center' }}
                    >
                        <Typography component="h2" variant="h6">No project open</Typography>
                        <Typography color="text.secondary" variant="body2">
                            Open a GitHub repository or local folder to work with project cards.
                        </Typography>
                        <Button onClick={() => requestOpenProjectDialog()} variant="contained">Open project...</Button>
                    </Stack>
                )}
            </Box>
            {isProjectOpen && hasExecutionBackend() ? <AgentChatFab /> : null}
        </Paper>
    )
}
