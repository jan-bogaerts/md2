import { Alert, Box, Button, Divider, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import type { ChangeEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DataService } from '../data/DataService'
import { GithubStorageService } from '../data/GithubStorageService'
import { LocalGitStorageService } from '../data/LocalGitStorageService'
import { DEFAULT_CARD_TYPES, type CardDraft, type ProjectCard, type ProjectConfig, type ProjectReference, type PushMode } from '../data/dataTypes'
import { getElectronDataBridge } from '../data/electronDataBridge'
import { CardSelectButton } from './CardSelectButton'

const WORKSPACE_PANEL_PADDING = 3
const LAST_PROJECT_STORAGE_KEY = 'md2.lastProject'

interface ProjectWorkspaceProps {
    accessToken: string | null
    isGithubAuthenticated: boolean
}

interface LastProject {
    project: ProjectReference
    storageType: StorageType
}

type StorageType = 'github' | 'local'

function createProjectConfig(pushMode: PushMode): ProjectConfig {
    return {
        cardTypes: DEFAULT_CARD_TYPES,
        pushMode,
        workingFolder: 'design',
    }
}

function readLastProject() {
    const storedValue = window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY)

    if (!storedValue) return null

    return JSON.parse(storedValue) as LastProject
}

function writeLastProject(storageType: StorageType, project: ProjectReference) {
    window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify({ project, storageType }))
}

export function ProjectWorkspace(props: ProjectWorkspaceProps) {
    const { accessToken, isGithubAuthenticated } = props
    const [activeCards, setActiveCards] = useState<ProjectCard[]>([])
    const [backgroundCards, setBackgroundCards] = useState<ProjectCard[]>([])
    const [branch, setBranch] = useState('main')
    const [cardBody, setCardBody] = useState('')
    const [cardTitle, setCardTitle] = useState('')
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [githubOwner, setGithubOwner] = useState('')
    const [githubRepository, setGithubRepository] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [project, setProject] = useState<ProjectReference | null>(null)
    const [pushMode, setPushMode] = useState<PushMode>('auto')
    const [selectedCardPath, setSelectedCardPath] = useState('')
    const [storageType, setStorageType] = useState<StorageType>('github')
    const dataServiceRef = useRef<DataService | null>(null)
    const electronBridge = useMemo(() => getElectronDataBridge(), [])
    const canUseLocalGit = !!electronBridge
    const isProjectOpen = !!project
    const selectedCard = activeCards.find((card) => card.path === selectedCardPath) ?? activeCards[0] ?? null

    const openProject = useCallback(async (nextStorageType: StorageType, nextProject: ProjectReference) => {
        setIsLoading(true)
        setErrorMessage(null)

        try {
            const storage = nextStorageType === 'github'
                ? new GithubStorageService({ accessToken: accessToken ?? '' })
                : new LocalGitStorageService()
            const dataService = new DataService({ config: createProjectConfig(pushMode), storage })
            const snapshot = await dataService.openProject(nextProject)

            dataServiceRef.current = dataService
            setActiveCards(snapshot.activeCards)
            setBackgroundCards(snapshot.backgroundCards)
            setBranch(nextProject.branch)
            setProject(nextProject)
            setSelectedCardPath(snapshot.activeCards[0]?.path ?? '')
            setStorageType(nextStorageType)
            writeLastProject(nextStorageType, nextProject)
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Project load failed')
        } finally {
            setIsLoading(false)
        }
    }, [accessToken, pushMode])

    useEffect(() => {
        const handleClose = () => {
            void dataServiceRef.current?.flushPendingCommits()
        }

        window.addEventListener('beforeunload', handleClose)

        return () => window.removeEventListener('beforeunload', handleClose)
    }, [])

    useEffect(() => {
        const lastProject = readLastProject()

        if (!lastProject || dataServiceRef.current || (!accessToken && lastProject.storageType === 'github')) return

        void openProject(lastProject.storageType, lastProject.project)
    }, [accessToken, openProject])

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
        if (!selectedCard || !dataServiceRef.current) return

        const nextCard = { ...selectedCard, content: event.target.value }
        setActiveCards(activeCards.map((card) => (card.path === nextCard.path ? nextCard : card)))
        dataServiceRef.current.saveFile({ content: nextCard.content, path: nextCard.path, sha: nextCard.sha })
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

        const project = await electronBridge.openProjectFolder()

        if (project) await openProject('local', project)
    }

    const handleSwitchBranchClick = async () => {
        if (!dataServiceRef.current) return

        setIsLoading(true)
        const snapshot = await dataServiceRef.current.switchBranch(branch)
        setActiveCards(snapshot.activeCards)
        setBackgroundCards(snapshot.backgroundCards)
        setSelectedCardPath(snapshot.activeCards[0]?.path ?? '')
        setIsLoading(false)
    }

    const handleCreateCardClick = async () => {
        if (!dataServiceRef.current) return

        const draft: CardDraft = { body: cardBody, title: cardTitle, type: 'feature' }
        const file = await dataServiceRef.current.createCard(draft)
        if (project) await openProject(storageType, project)
        setSelectedCardPath(file.path)
        setCardBody('')
        setCardTitle('')
    }

    const handlePushClick = () => {
        void dataServiceRef.current?.push()
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
