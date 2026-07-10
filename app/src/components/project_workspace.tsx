import {
    Box, Button, Paper, Stack, Typography,
    useMediaQuery, useTheme,
} from '@mui/material'
import { useEffect, useState } from 'react'
import {
    DEFAULT_CARD_TYPES,
    DEFAULT_WORKING_FOLDER,
    type AgentConversation,
    type ProjectCard,
    type ProjectReference,
} from '../data/data_types'
import { dataService } from '../services/data_service'
import { dialogService } from '../services/dialog_service'
import { getElectronLifecycleBridge, type ElectronLifecycleBridge } from '../services/electron_lifecycle_bridge'
import { telemetryService } from '../services/telemetry_service'
import { workspaceViewService } from '../services/workspace_view_service'
import { workspaceNavigationService, type WorkspaceOpenRequest } from '../services/workspace_navigation_service'
import { CardView } from './card_view/card_view'
import { TextView } from './text_view/text_view'
import { useProjectConfig } from './hooks/use_project_config'
import { useProjectState } from './hooks/use_project_state'
import { useWorkspaceView } from './hooks/use_workspace_view'
import { requestOpenProjectDialog } from './project_command_events'

const WORKSPACE_PANEL_PADDING = 3
const EMPTY_CARDS: ProjectCard[] = []
const EMPTY_REPOSITORY_FILES: string[] = []

function flushPendingCommits() {
    void dataService.cards.flushPendingCommits()
}

async function flushAndConfirmPendingCommits(lifecycleBridge: ElectronLifecycleBridge, requestId: string) {
    try {
        await dataService.cards.flushPendingCommits()
    } finally {
        lifecycleBridge.confirmFlush(requestId)
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
    const [requestedPath, setRequestedPath] = useState<string | null>(null)
    const [requestedNonce, setRequestedNonce] = useState(0)
    const { selectedPath, viewMode } = useWorkspaceView()
    const isProjectOpen = !!project
    const projectConfig = useProjectConfig()
    const cardTypes = projectConfig?.cardTypes ?? DEFAULT_CARD_TYPES
    const workingFolder = snapshot?.workingFolder ?? projectConfig?.workingFolder ?? DEFAULT_WORKING_FOLDER

    useEffect(() => {
        workspaceViewService.syncProject(workspaceProjectKey(project))
    }, [project])

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (dataService.getState().hasPendingCommits) {
                event.preventDefault()
                event.returnValue = ''
            }

            flushPendingCommits()
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') flushPendingCommits()
        }

        const handleBlur = () => {
            if (dataService.getState().hasPendingCommits) flushPendingCommits()
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
            setRequestedPath(path)
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

    const handleBodyChange = (path: string, body: string) => {
        runWorkspaceEdit(() => dataService.cards.updateCardBody(path, body), `Body update failed: ${path}`)
    }

    const handleAffectsChange = (path: string, affects: string[]) => {
        runWorkspaceEdit(() => dataService.cards.updateCardAffects(path, affects), `Affects update failed: ${path}`)
    }

    const handleHeaderFieldChange = (path: string, key: string, value: string) => {
        runWorkspaceEdit(() => dataService.cards.updateCardHeaderFields(path, { [key]: value }), `Header update failed: ${path}`)
    }

    const clearDeletedPathState = (path: string) => {
        workspaceViewService.clearSelectedPath(path)
        setRequestedPath((currentPath) => (currentPath === path ? null : currentPath))
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

    const handleContinueAgentConversation = async (path: string, conversation: AgentConversation) => {
        try {
            await dataService.agents.continueAgentConversation(path, conversation.path)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Agent continue failed' })
        }
    }

    const handleStartAgentConversation = async (path: string, prompt: string) => {
        try {
            await dataService.agents.startAgentConversation(path, prompt)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Agent start failed' })
        }
    }

    const handleSendAgentInput = async (runId: string, input: string) => {
        try {
            await dataService.agents.sendAgentInput(runId, input)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Agent input failed' })
        }
    }

    const handleOpenInFileMode = (path: string) => {
        workspaceViewService.selectPath(path)
        setRequestedPath(path)
        setRequestedNonce((nonce) => nonce + 1)
        workspaceViewService.setViewMode('text')
        telemetryService.trackEvent('navigation')
    }

    return (
        <Paper
            aria-label="Project workspace"
            component="section"
            elevation={0}
            sx={{ border: 1, borderColor: 'divider', borderRadius: 2, display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', p: WORKSPACE_PANEL_PADDING }}
        >
            <Box
                aria-label="Project workspace content"
                role="region"
                sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'auto' }}
                tabIndex={0}
            >
                {isProjectOpen ? (
                    viewMode === 'cards' ? (
                        <CardView
                            cardTypes={cardTypes}
                            cards={activeCards}
                            isMobile={isMobile}
                            onAffectsChange={handleAffectsChange}
                            onBodyChange={handleBodyChange}
                            onContinueAgentConversation={handleContinueAgentConversation}
                            onDeleteCard={handleDeleteCard}
                            onMoveCard={handleMoveCard}
                            onOpenInFileMode={handleOpenInFileMode}
                            onSendAgentInput={handleSendAgentInput}
                            onStartAgentConversation={handleStartAgentConversation}
                            onTitleChange={handleTitleChange}
                            onTogglePolicy={handleTogglePolicy}
                            repositoryFiles={repositoryFiles}
                            selectedPath={selectedPath}
                        />
                    ) : (
                        <TextView
                            activeCards={activeCards}
                            backgroundCards={backgroundCards}
                            cardTypes={cardTypes}
                            isMobile={isMobile}
                            onLeftPanelInteraction={onLeftPanelInteraction}
                            onBodyChange={handleBodyChange}
                            onContinueAgentConversation={handleContinueAgentConversation}
                            onDeleteFile={handleDeleteFile}
                            onHeaderFieldChange={handleHeaderFieldChange}
                            onSendAgentInput={handleSendAgentInput}
                            onStartAgentConversation={handleStartAgentConversation}
                            requestedNonce={requestedNonce}
                            requestedPath={requestedPath}
                            workingFolder={workingFolder}
                        />
                    )
                ) : (
                    <Stack spacing={2} sx={{ alignItems: 'flex-start', py: 6 }}>
                        <Typography component="h2" variant="h6">No project open</Typography>
                        <Typography color="text.secondary" variant="body2">
                            Open a GitHub repository or local folder to work with project cards.
                        </Typography>
                        <Button onClick={requestOpenProjectDialog} variant="contained">Open project...</Button>
                    </Stack>
                )}
            </Box>
        </Paper>
    )
}
