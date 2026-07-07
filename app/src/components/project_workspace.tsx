import {
    Alert, Button, Divider, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography,
    useMediaQuery, useTheme,
} from '@mui/material'
import type { MouseEvent, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
    DEFAULT_CARD_TYPES,
    DEFAULT_WORKING_FOLDER,
    type AgentConversation,
    type ProjectCard,
} from '../data/data_types'
import { getRemarkableBridge } from '../data/remarkable_bridge'
import { configService } from '../services/config_service'
import { dataService } from '../services/data_service'
import { getElectronLifecycleBridge, type ElectronLifecycleBridge } from '../services/electron_lifecycle_bridge'
import { telemetryService } from '../services/telemetry_service'
import { workspaceNavigationService, type WorkspaceOpenRequest } from '../services/workspace_navigation_service'
import { CardView } from './card_view/card_view'
import { CardViewNavigation } from './card_view/card_view_navigation'
import { RemarkableImportPanel } from './remarkable_import_panel'
import { TextView } from './text_view/text_view'
import { useProjectState } from './hooks/use_project_state'
import { requestOpenProjectDialog, WORKSPACE_ERROR_EVENT } from './project_command_events'

type WorkspaceViewMode = 'cards' | 'text'
type ErrorSetter = (message: string | null) => void

const WORKSPACE_PANEL_PADDING = 3
const EMPTY_CARDS: ProjectCard[] = []
const EMPTY_REPOSITORY_FILES: string[] = []

function flushPendingCommits() {
    void dataService.flushPendingCommits()
}

async function flushAndConfirmPendingCommits(lifecycleBridge: ElectronLifecycleBridge, requestId: string) {
    try {
        await dataService.flushPendingCommits()
    } finally {
        lifecycleBridge.confirmFlush(requestId)
    }
}

function runWorkspaceEdit(action: () => void, setErrorMessage: ErrorSetter, fallbackMessage: string) {
    setErrorMessage(null)

    try {
        action()
    } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : fallbackMessage)
    }
}

interface ProjectWorkspaceProps {
    bootstrapError: string | null
    onLeftPanelContentChange: (content: ReactNode) => void
    onLeftPanelInteraction: () => void
}

export function ProjectWorkspace(props: ProjectWorkspaceProps) {
    const { bootstrapError, onLeftPanelContentChange, onLeftPanelInteraction } = props
    const { project, snapshot } = useProjectState()
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const activeCards = snapshot?.activeCards ?? EMPTY_CARDS
    const backgroundCards = snapshot?.backgroundCards ?? EMPTY_CARDS
    const repositoryFiles = snapshot?.repositoryFiles ?? EMPTY_REPOSITORY_FILES
    const [configRevision, setConfigRevision] = useState(0)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [requestedPath, setRequestedPath] = useState<string | null>(null)
    const [requestedNonce, setRequestedNonce] = useState(0)
    const [selectedPath, setSelectedPath] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<WorkspaceViewMode>('cards')
    const [dismissedBootstrapError, setDismissedBootstrapError] = useState<string | null>(null)
    const remarkableBridge = useMemo(() => getRemarkableBridge(), [])
    const isProjectOpen = !!project
    const projectConfig = dataService.getConfig()
    const cardTypes = projectConfig?.cardTypes ?? DEFAULT_CARD_TYPES
    const workingFolder = snapshot?.workingFolder ?? projectConfig?.workingFolder ?? DEFAULT_WORKING_FOLDER
    const cardNavigation = useMemo(
        () => <CardViewNavigation cards={activeCards} onNavigate={onLeftPanelInteraction} />,
        [activeCards, onLeftPanelInteraction],
    )
    const bootstrapErrorMessage = bootstrapError && bootstrapError !== dismissedBootstrapError
        ? `Could not restore last project: ${bootstrapError}`
        : null

    void configRevision

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
        if (!isProjectOpen) {
            onLeftPanelContentChange(null)

            return
        }
        if (viewMode !== 'cards') return

        onLeftPanelContentChange(cardNavigation)
    }, [cardNavigation, isProjectOpen, onLeftPanelContentChange, viewMode])

    useEffect(() => {
        const handleConfigChange = () => {
            setConfigRevision((revision) => revision + 1)
        }

        configService.addEventListener('changed', handleConfigChange)

        return () => configService.removeEventListener('changed', handleConfigChange)
    }, [])

    useEffect(() => {
        const handleNavigationOpen = (event: Event) => {
            const { path } = (event as CustomEvent<WorkspaceOpenRequest>).detail
            // Reveal the card/file without changing the current view mode: highlight it in card view
            // and queue it as a text-view tab for when that view is shown.
            setSelectedPath(path)
            setRequestedPath(path)
            setRequestedNonce((nonce) => nonce + 1)
            telemetryService.trackEvent('navigation')
        }

        workspaceNavigationService.addEventListener('open', handleNavigationOpen)

        return () => workspaceNavigationService.removeEventListener('open', handleNavigationOpen)
    }, [])

    useEffect(() => {
        const handleWorkspaceError = (event: Event) => {
            setErrorMessage((event as CustomEvent<string>).detail)
        }

        window.addEventListener(WORKSPACE_ERROR_EVENT, handleWorkspaceError)

        return () => window.removeEventListener(WORKSPACE_ERROR_EVENT, handleWorkspaceError)
    }, [])

    const handleMoveCard = (path: string, targetStatus: string, targetIndex: number) => {
        runWorkspaceEdit(() => dataService.moveCard(path, targetStatus, targetIndex), setErrorMessage, `Card move failed: ${path}`)
    }

    const handleTogglePolicy = (path: string, policyKey: string) => {
        runWorkspaceEdit(() => dataService.toggleCardPolicy(path, policyKey), setErrorMessage, `Policy toggle failed: ${path}`)
    }

    const handleTitleChange = (path: string, title: string) => {
        runWorkspaceEdit(() => dataService.updateCardTitle(path, title), setErrorMessage, `Title update failed: ${path}`)
    }

    const handleBodyChange = (path: string, body: string) => {
        runWorkspaceEdit(() => dataService.updateCardBody(path, body), setErrorMessage, `Body update failed: ${path}`)
    }

    const handleAffectsChange = (path: string, affects: string[]) => {
        runWorkspaceEdit(() => dataService.updateCardAffects(path, affects), setErrorMessage, `Affects update failed: ${path}`)
    }

    const handleHeaderFieldChange = (path: string, key: string, value: string) => {
        runWorkspaceEdit(() => dataService.updateCardHeaderFields(path, { [key]: value }), setErrorMessage, `Header update failed: ${path}`)
    }

    const clearDeletedPathState = (path: string) => {
        setSelectedPath((currentPath) => (currentPath === path ? null : currentPath))
        setRequestedPath((currentPath) => (currentPath === path ? null : currentPath))
    }

    const handleDeleteCard = async (path: string) => {
        setErrorMessage(null)

        try {
            await dataService.deleteCard(path)
            clearDeletedPathState(path)
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : `Card delete failed: ${path}`)
            throw error
        }
    }

    const handleDeleteFile = async (path: string) => {
        setErrorMessage(null)

        try {
            await dataService.deleteFile(path)
            clearDeletedPathState(path)
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : `File delete failed: ${path}`)
            throw error
        }
    }

    const handleContinueAgentConversation = async (path: string, conversation: AgentConversation) => {
        setErrorMessage(null)

        try {
            await dataService.continueAgentConversation(path, conversation.path)
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Agent continue failed')
        }
    }

    const handleStartAgentConversation = async (path: string, prompt: string) => {
        setErrorMessage(null)

        try {
            await dataService.startAgentConversation(path, prompt)
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Agent start failed')
        }
    }

    const handleSendAgentInput = async (runId: string, input: string) => {
        setErrorMessage(null)

        try {
            await dataService.sendAgentInput(runId, input)
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Agent input failed')
        }
    }

    const handleOpenInFileMode = (path: string) => {
        setRequestedPath(path)
        setRequestedNonce((nonce) => nonce + 1)
        setViewMode('text')
        telemetryService.trackEvent('navigation')
    }

    const handleViewModeChange = (_event: MouseEvent<HTMLElement>, nextMode: WorkspaceViewMode | null) => {
        if (!nextMode || nextMode === viewMode) return

        setViewMode(nextMode)
        telemetryService.trackEvent('navigation')
    }

    const handleDismissBootstrapError = () => {
        setDismissedBootstrapError(bootstrapError)
    }

    return (
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: WORKSPACE_PANEL_PADDING }}>
            <Stack spacing={3}>
                {bootstrapErrorMessage ? (
                    <Alert onClose={handleDismissBootstrapError} severity="error">{bootstrapErrorMessage}</Alert>
                ) : null}
                {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

                {isProjectOpen ? (
                    <Stack spacing={2}>
                        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                            <Typography component="h2" variant="h6">
                                {viewMode === 'cards' ? 'Active cards' : 'Files'}
                            </Typography>
                            <ToggleButtonGroup exclusive onChange={handleViewModeChange} size="small" value={viewMode}>
                                <ToggleButton value="cards">Cards</ToggleButton>
                                <ToggleButton value="text">Text</ToggleButton>
                            </ToggleButtonGroup>
                        </Stack>
                        {viewMode === 'cards' ? (
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
                                onLeftPanelContentChange={onLeftPanelContentChange}
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
                        )}
                        <Typography color="text.secondary" variant="body2">
                            Background cards loaded: {backgroundCards.length}
                        </Typography>
                    </Stack>
                ) : (
                    <Stack spacing={2} sx={{ alignItems: 'flex-start', py: 6 }}>
                        <Typography component="h2" variant="h6">No project open</Typography>
                        <Typography color="text.secondary" variant="body2">
                            Open a GitHub repository or local folder to work with project cards.
                        </Typography>
                        <Button onClick={requestOpenProjectDialog} variant="contained">Open project...</Button>
                    </Stack>
                )}

                {remarkableBridge && isProjectOpen ? (
                    <>
                        <Divider />
                        <RemarkableImportPanel activeCards={activeCards} bridge={remarkableBridge} isProjectOpen={isProjectOpen} />
                    </>
                ) : null}
            </Stack>
        </Paper>
    )
}
