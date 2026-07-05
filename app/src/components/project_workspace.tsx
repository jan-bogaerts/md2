import {
    Alert, Button, Divider, MenuItem, Paper, Select, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
    useMediaQuery, useTheme,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import type { ChangeEvent, MouseEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createStorageService, writeLastProject, type StorageType } from '../data/project_session'
import {
    DEFAULT_CARD_TYPES,
    DEFAULT_WORKING_FOLDER,
    type AgentConversation,
    type CardDraft,
    type ProjectCard,
    type ProjectReference,
    type PushMode,
} from '../data/data_types'
import { getElectronDataBridge } from '../data/electron_data_bridge'
import { configService } from '../services/config_service'
import { dataService } from '../services/data_service'
import { getElectronConfigBridge } from '../services/electron_config_bridge'
import { telemetryService } from '../services/telemetry_service'
import { workspaceNavigationService, type WorkspaceOpenRequest } from '../services/workspace_navigation_service'
import { CardView } from './card_view/card_view'
import { TextView } from './text_view/text_view'
import { useProjectState } from './hooks/use_project_state'

type WorkspaceViewMode = 'cards' | 'text'

const WORKSPACE_PANEL_PADDING = 3
const EMPTY_CARDS: ProjectCard[] = []

interface ProjectWorkspaceProps {
    accessToken: string | null
    isGithubAuthenticated: boolean
}

function ensureConfigServiceInitialized() {
    if (configService.isInitialized()) return

    const desktopConfig = getElectronConfigBridge()?.getDesktopConfig() ?? null
    configService.init({ desktopConfig })
}

export function ProjectWorkspace(props: ProjectWorkspaceProps) {
    ensureConfigServiceInitialized()
    const {
        accessToken,
        isGithubAuthenticated,
    } = props
    const { project, snapshot } = useProjectState()
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const activeCards = snapshot?.activeCards ?? EMPTY_CARDS
    const backgroundCards = snapshot?.backgroundCards ?? EMPTY_CARDS
    const [branch, setBranch] = useState(project?.branch ?? 'main')
    const [cardBody, setCardBody] = useState('')
    const [cardTitle, setCardTitle] = useState('')
    const [configRevision, setConfigRevision] = useState(0)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [githubOwner, setGithubOwner] = useState('')
    const [githubRepository, setGithubRepository] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [requestedPath, setRequestedPath] = useState<string | null>(null)
    const [requestedNonce, setRequestedNonce] = useState(0)
    const [selectedPath, setSelectedPath] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<WorkspaceViewMode>('cards')
    const electronBridge = useMemo(() => getElectronDataBridge(), [])
    const canUseLocalGit = !!electronBridge
    const isProjectOpen = !!project
    const projectConfig = dataService.getConfig()
    const cardTypes = projectConfig?.cardTypes ?? DEFAULT_CARD_TYPES
    const pushMode = (projectConfig?.pushMode ?? 'auto') as PushMode
    const workingFolder = snapshot?.workingFolder ?? projectConfig?.workingFolder ?? DEFAULT_WORKING_FOLDER

    void configRevision

    const openProject = useCallback(async (nextStorageType: StorageType, nextProject: ProjectReference) => {
        setIsLoading(true)
        setErrorMessage(null)

        try {
            const storage = createStorageService(nextStorageType, accessToken)
            dataService.init({ storage })
            await dataService.openProject(nextProject)

            setBranch(nextProject.branch)
            writeLastProject(nextStorageType, nextProject)
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Project load failed')
        } finally {
            setIsLoading(false)
        }
    }, [accessToken])

    useEffect(() => {
        const handleClose = () => {
            void dataService.flushPendingCommits()
        }

        window.addEventListener('beforeunload', handleClose)

        return () => window.removeEventListener('beforeunload', handleClose)
    }, [])

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

    const handleGithubOwnerChange = (event: ChangeEvent<HTMLInputElement>) => {
        setGithubOwner(event.target.value)
    }

    const handleGithubRepositoryChange = (event: ChangeEvent<HTMLInputElement>) => {
        setGithubRepository(event.target.value)
    }

    const handleBranchChange = (event: ChangeEvent<HTMLInputElement>) => {
        setBranch(event.target.value)
    }

    const handleCardTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setCardTitle(event.target.value)
    }

    const handleCardBodyChange = (event: ChangeEvent<HTMLInputElement>) => {
        setCardBody(event.target.value)
    }

    const handlePushModeChange = (event: SelectChangeEvent) => {
        configService.set('project.pushMode', event.target.value as PushMode)
    }

    const handleOpenGithubClick = () => {
        void openProject('github', {
            branch,
            id: `${githubOwner}/${githubRepository}`,
            owner: githubOwner,
            repository: githubRepository,
        })
    }

    const handleOpenLocalClick = async () => {
        if (!electronBridge) return

        const localProject = await electronBridge.openProjectFolder()

        if (localProject) await openProject('local', localProject)
    }

    const handleSwitchBranchClick = async () => {
        if (!project) return

        setIsLoading(true)
        try {
            await dataService.switchBranch(branch)
        } finally {
            setIsLoading(false)
        }
    }

    const handleCreateCardClick = async () => {
        if (!project) return

        const draft: CardDraft = { body: cardBody, title: cardTitle, type: 'feature' }
        await dataService.createCard(draft)
        setCardBody('')
        setCardTitle('')
    }

    const handlePushClick = () => {
        void dataService.push()
    }

    const handleMoveCard = (path: string, targetStatus: string, targetIndex: number) => {
        dataService.moveCard(path, targetStatus, targetIndex)
    }

    const handleTogglePolicy = (path: string, policyKey: string) => {
        dataService.toggleCardPolicy(path, policyKey)
    }

    const handleTitleChange = (path: string, title: string) => {
        dataService.updateCardTitle(path, title)
    }

    const handleBodyChange = (path: string, body: string) => {
        dataService.updateCardBody(path, body)
    }

    const handleContinueAgentConversation = async (path: string, conversation: AgentConversation) => {
        setErrorMessage(null)

        try {
            await dataService.continueAgentConversation(path, conversation.path)
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Agent continue failed')
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

    return (
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: WORKSPACE_PANEL_PADDING }}>
            <Stack spacing={3}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <TextField disabled={!isGithubAuthenticated} label="Owner" onChange={handleGithubOwnerChange} size="small" value={githubOwner} />
                    <TextField disabled={!isGithubAuthenticated} label="Repository" onChange={handleGithubRepositoryChange} size="small" value={githubRepository} />
                    <TextField label="Branch" onChange={handleBranchChange} size="small" value={branch} />
                    <Button disabled={!isGithubAuthenticated || isLoading} onClick={handleOpenGithubClick} variant="contained">
                        Open GitHub
                    </Button>
                    <Button disabled={!canUseLocalGit || isLoading} onClick={handleOpenLocalClick} variant="outlined">
                        Open Local
                    </Button>
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Select onChange={handlePushModeChange} size="small" value={pushMode}>
                        <MenuItem value="auto">Auto push</MenuItem>
                        <MenuItem value="manual">Manual push</MenuItem>
                    </Select>
                    <Button disabled={!isProjectOpen || isLoading} onClick={handleSwitchBranchClick} variant="outlined">
                        Switch Branch
                    </Button>
                    {pushMode === 'manual' ? (
                        <Button disabled={!isProjectOpen} onClick={handlePushClick} variant="outlined">
                            Push
                        </Button>
                    ) : null}
                </Stack>

                {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

                <Divider />

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
                            onBodyChange={handleBodyChange}
                            onContinueAgentConversation={handleContinueAgentConversation}
                            onMoveCard={handleMoveCard}
                            onOpenInFileMode={handleOpenInFileMode}
                            onTitleChange={handleTitleChange}
                            onTogglePolicy={handleTogglePolicy}
                            selectedPath={selectedPath}
                        />
                    ) : (
                        <TextView
                            activeCards={activeCards}
                            backgroundCards={backgroundCards}
                            cardTypes={cardTypes}
                            isMobile={isMobile}
                            onBodyChange={handleBodyChange}
                            onContinueAgentConversation={handleContinueAgentConversation}
                            requestedNonce={requestedNonce}
                            requestedPath={requestedPath}
                            workingFolder={workingFolder}
                        />
                    )}
                    <Typography color="text.secondary" variant="body2">
                        Background cards loaded: {backgroundCards.length}
                    </Typography>
                </Stack>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <TextField label="New card title" onChange={handleCardTitleChange} size="small" value={cardTitle} />
                    <TextField label="New card body" onChange={handleCardBodyChange} size="small" value={cardBody} />
                    <Button disabled={!isProjectOpen || cardTitle.length === 0} onClick={handleCreateCardClick} variant="contained">
                        Create Feature
                    </Button>
                </Stack>
            </Stack>
        </Paper>
    )
}
