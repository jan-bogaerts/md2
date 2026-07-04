import { Alert, Box, Button, Divider, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import type { ChangeEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createProjectConfig, createStorageService, writeLastProject, type StorageType } from '../data/project_session'
import type { CardDraft, ProjectCard, ProjectReference, PushMode } from '../data/data_types'
import { getElectronDataBridge } from '../data/electron_data_bridge'
import { dataService } from '../services/data_service'
import { CardSelectButton } from './card_select_button'
import { useProjectState } from './hooks/use_project_state'

const WORKSPACE_PANEL_PADDING = 3
const EMPTY_CARDS: ProjectCard[] = []

interface ProjectWorkspaceProps {
    accessToken: string | null
    isGithubAuthenticated: boolean
}

export function ProjectWorkspace(props: ProjectWorkspaceProps) {
    const {
        accessToken,
        isGithubAuthenticated,
    } = props
    const { project, snapshot } = useProjectState()
    const activeCards = snapshot?.activeCards ?? EMPTY_CARDS
    const backgroundCards = snapshot?.backgroundCards ?? EMPTY_CARDS
    const [branch, setBranch] = useState(project?.branch ?? 'main')
    const [cardBody, setCardBody] = useState('')
    const [cardTitle, setCardTitle] = useState('')
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [githubOwner, setGithubOwner] = useState('')
    const [githubRepository, setGithubRepository] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [pushMode, setPushMode] = useState<PushMode>('auto')
    const [selectedCardPath, setSelectedCardPath] = useState(activeCards[0]?.path ?? '')
    const electronBridge = useMemo(() => getElectronDataBridge(), [])
    const canUseLocalGit = !!electronBridge
    const isProjectOpen = !!project
    const selectedCard = activeCards.find((card) => card.path === selectedCardPath) ?? activeCards[0] ?? null

    const openProject = useCallback(async (nextStorageType: StorageType, nextProject: ProjectReference) => {
        setIsLoading(true)
        setErrorMessage(null)

        try {
            const storage = createStorageService(nextStorageType, accessToken)
            dataService.init({ config: createProjectConfig(pushMode), storage })
            const nextSnapshot = await dataService.openProject(nextProject)

            setBranch(nextProject.branch)
            setSelectedCardPath(nextSnapshot.activeCards[0]?.path ?? '')
            writeLastProject(nextStorageType, nextProject)
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Project load failed')
        } finally {
            setIsLoading(false)
        }
    }, [accessToken, pushMode])

    useEffect(() => {
        const handleClose = () => {
            void dataService.flushPendingCommits()
        }

        window.addEventListener('beforeunload', handleClose)

        return () => window.removeEventListener('beforeunload', handleClose)
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
        setPushMode(event.target.value as PushMode)
    }

    const handleEditorChange = (event: ChangeEvent<HTMLInputElement>) => {
        if (!selectedCard) return

        dataService.updateCardBody(selectedCard.path, event.target.value)
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
            const nextSnapshot = await dataService.switchBranch(branch)
            setSelectedCardPath(nextSnapshot.activeCards[0]?.path ?? '')
        } finally {
            setIsLoading(false)
        }
    }

    const handleCreateCardClick = async () => {
        if (!project) return

        const draft: CardDraft = { body: cardBody, title: cardTitle, type: 'feature' }
        const file = await dataService.createCard(draft)
        setSelectedCardPath(file.path)
        setCardBody('')
        setCardTitle('')
    }

    const handlePushClick = () => {
        void dataService.push()
    }

    const handleSelectCard = (path: string) => {
        setSelectedCardPath(path)
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
                    <Typography component="h2" variant="h6">
                        Active cards
                    </Typography>
                    {activeCards.map((card) => (
                        <CardSelectButton
                            key={card.path}
                            card={card}
                            isSelected={card.path === selectedCard?.path}
                            onSelect={handleSelectCard}
                        />
                    ))}
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

                {selectedCard ? (
                    <Box>
                        <Typography component="h2" variant="h6">
                            {selectedCard.header.id}
                        </Typography>
                        <TextField fullWidth minRows={8} multiline onChange={handleEditorChange} value={selectedCard.content} />
                    </Box>
                ) : null}
            </Stack>
        </Paper>
    )
}
