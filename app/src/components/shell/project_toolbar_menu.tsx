import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    InputLabel,
    Menu,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import type { ChangeEvent, MouseEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BranchReference, CardDraft, ProjectReference, PushMode, RepositoryReference } from '../../data/data_types'
import { createStorageService, writeLastProject, type StorageType } from '../../data/project_session'
import { getElectronDataBridge } from '../../data/electron_data_bridge'
import { configService } from '../../services/config_service'
import { dataService } from '../../services/data_service'
import { GithubStorageService } from '../../services/github_storage_service'
import { useProjectState } from '../hooks/use_project_state'
import { OPEN_PROJECT_DIALOG_EVENT } from '../project_command_events'

type ProjectDialogMode = 'open' | 'branch' | 'card'
type ProjectSource = 'github' | 'local'

const EMPTY_BRANCHES: BranchReference[] = []
const EMPTY_REPOSITORIES: RepositoryReference[] = []

interface ProjectToolbarMenuProps {
    accessToken: string | null
    isGithubAuthenticated: boolean
}

function branchExists(branches: BranchReference[], branchName: string) {
    return branches.some(({ name }) => name === branchName)
}

function branchValue(branches: BranchReference[], preferredBranch: string) {
    if (branchExists(branches, preferredBranch)) return preferredBranch

    return branches[0]?.name ?? ''
}

function createGithubStorage(accessToken: string | null) {
    const storage = new GithubStorageService()
    storage.init({ accessToken: accessToken ?? '' })

    return storage
}

function repositoryMatchesFilter(repository: RepositoryReference, filter: string) {
    const normalizedFilter = filter.trim().toLowerCase()
    if (normalizedFilter.length === 0) return true

    return repository.id.toLowerCase().includes(normalizedFilter)
}

/** Toolbar project menu with dialogs for open, branch, push, release and card creation commands. */
export function ProjectToolbarMenu(props: ProjectToolbarMenuProps) {
    const { accessToken, isGithubAuthenticated } = props
    const { project, snapshot } = useProjectState()
    const electronBridge = useMemo(() => getElectronDataBridge(), [])
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const [branches, setBranches] = useState<BranchReference[]>(EMPTY_BRANCHES)
    const [cardBody, setCardBody] = useState('')
    const [cardTitle, setCardTitle] = useState('')
    const [configRevision, setConfigRevision] = useState(0)
    const [dialogMode, setDialogMode] = useState<ProjectDialogMode | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [githubOwner, setGithubOwner] = useState('')
    const [githubRepository, setGithubRepository] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isReleaseCompleting, setIsReleaseCompleting] = useState(false)
    const [localProject, setLocalProject] = useState<ProjectReference | null>(null)
    const [repositories, setRepositories] = useState<RepositoryReference[]>(EMPTY_REPOSITORIES)
    const [repositoryFilter, setRepositoryFilter] = useState('')
    const [selectedBranch, setSelectedBranch] = useState(project?.branch ?? '')
    const [selectedRepositoryId, setSelectedRepositoryId] = useState('')
    const [source, setSource] = useState<ProjectSource>('github')
    const activeCards = snapshot?.activeCards ?? []
    const projectConfig = dataService.getConfig()
    const pushMode = (projectConfig?.pushMode ?? 'auto') as PushMode
    const isMenuOpen = !!anchorElement
    const isProjectOpen = !!project
    const filteredRepositories = repositories.filter((repository) => repositoryMatchesFilter(repository, repositoryFilter))

    void configRevision

    const openDialog = useCallback((mode: ProjectDialogMode) => {
        setAnchorElement(null)
        setDialogMode(mode)
        setErrorMessage(null)
    }, [])

    const loadSwitchBranches = useCallback(async () => {
        if (!project) return

        setIsLoading(true)
        setErrorMessage(null)

        try {
            const storage = createStorageService(project.rootPath ? 'local' : 'github', accessToken)
            const nextBranches = await storage.listBranches(project)
            setBranches(nextBranches)
            setSelectedBranch(branchValue(nextBranches, project.branch))
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Branch list failed')
        } finally {
            setIsLoading(false)
        }
    }, [accessToken, project])

    const loadRepositories = useCallback(async () => {
        setIsLoading(true)
        setErrorMessage(null)

        try {
            const storage = createGithubStorage(accessToken)
            const nextRepositories = await storage.listRepositories()
            setRepositories(nextRepositories)
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Repository list failed')
            setRepositories(EMPTY_REPOSITORIES)
        } finally {
            setIsLoading(false)
        }
    }, [accessToken])

    useEffect(() => {
        const handleConfigChange = () => {
            setConfigRevision((revision) => revision + 1)
        }

        configService.addEventListener('changed', handleConfigChange)

        return () => configService.removeEventListener('changed', handleConfigChange)
    }, [])

    useEffect(() => {
        const handleOpenProjectDialog = () => {
            openDialog('open')
            if (isGithubAuthenticated) void loadRepositories()
        }

        window.addEventListener(OPEN_PROJECT_DIALOG_EVENT, handleOpenProjectDialog)

        return () => window.removeEventListener(OPEN_PROJECT_DIALOG_EVENT, handleOpenProjectDialog)
    }, [isGithubAuthenticated, loadRepositories, openDialog])

    const handleProjectButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
        setAnchorElement(event.currentTarget)
    }

    const handleCloseMenu = () => {
        setAnchorElement(null)
    }

    const handleOpenProjectMenuClick = () => {
        openDialog('open')
        if (isGithubAuthenticated) void loadRepositories()
    }

    const handleSwitchBranchMenuClick = () => {
        openDialog('branch')
        void loadSwitchBranches()
    }

    const handleNewCardMenuClick = () => {
        openDialog('card')
    }

    const handleCloseDialog = () => {
        setDialogMode(null)
        setErrorMessage(null)
    }

    const handleRepositoryFilterChange = (event: ChangeEvent<HTMLInputElement>) => {
        setRepositoryFilter(event.target.value)
    }

    const handleGithubOwnerChange = (event: ChangeEvent<HTMLInputElement>) => {
        setGithubOwner(event.target.value)
    }

    const handleGithubRepositoryChange = (event: ChangeEvent<HTMLInputElement>) => {
        setGithubRepository(event.target.value)
    }

    const handleCardTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setCardTitle(event.target.value)
    }

    const handleCardBodyChange = (event: ChangeEvent<HTMLInputElement>) => {
        setCardBody(event.target.value)
    }

    const handleSourceChange = (event: SelectChangeEvent) => {
        setSource(event.target.value as ProjectSource)
        setBranches(EMPTY_BRANCHES)
        setSelectedBranch('')
        setLocalProject(null)
    }

    const handleRepositoryChange = async (event: SelectChangeEvent) => {
        const repositoryId = event.target.value
        const selectedRepository = repositories.find((repository) => repository.id === repositoryId)
        setSelectedRepositoryId(repositoryId)
        if (!selectedRepository) return

        setGithubOwner(selectedRepository.owner)
        setGithubRepository(selectedRepository.repository)
        setIsLoading(true)
        setErrorMessage(null)

        try {
            const storage = createGithubStorage(accessToken)
            const nextBranches = await storage.listBranches(selectedRepository)
            setBranches(nextBranches)
            setSelectedBranch(branchValue(nextBranches, selectedRepository.branch))
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Branch list failed')
            setBranches(EMPTY_BRANCHES)
            setSelectedBranch('')
        } finally {
            setIsLoading(false)
        }
    }

    const handleBranchChange = (event: SelectChangeEvent) => {
        setSelectedBranch(event.target.value)
    }

    const handleChooseLocalFolderClick = async () => {
        if (!electronBridge) return

        setIsLoading(true)
        setErrorMessage(null)

        try {
            const nextLocalProject = await electronBridge.openProjectFolder()
            if (!nextLocalProject) return

            const storage = createStorageService('local', accessToken)
            const nextBranches = await storage.listBranches(nextLocalProject)
            setLocalProject(nextLocalProject)
            setBranches(nextBranches)
            setSelectedBranch(branchValue(nextBranches, nextLocalProject.branch))
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Local project selection failed')
        } finally {
            setIsLoading(false)
        }
    }

    const loadManualRepositoryBranches = async () => {
        setIsLoading(true)
        setErrorMessage(null)

        try {
            const storage = createGithubStorage(accessToken)
            const repository = await storage.findRepository(githubOwner, githubRepository)
            const nextBranches = await storage.listBranches(repository)
            setSelectedRepositoryId(repository.id)
            setBranches(nextBranches)
            setSelectedBranch(branchValue(nextBranches, repository.branch))
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Manual repository branch list failed')
        } finally {
            setIsLoading(false)
        }
    }

    const openProject = async (storageType: StorageType, nextProject: ProjectReference) => {
        setIsLoading(true)
        setErrorMessage(null)

        try {
            const storage = createStorageService(storageType, accessToken)
            dataService.init({ storage })
            await dataService.openProject(nextProject)
            writeLastProject(storageType, nextProject)
            handleCloseDialog()
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Project load failed')
        } finally {
            setIsLoading(false)
        }
    }

    const handleLoadManualBranchesClick = () => {
        void loadManualRepositoryBranches()
    }

    const handleOpenGithubClick = async () => {
        const storage = createGithubStorage(accessToken)
        setIsLoading(true)
        setErrorMessage(null)

        try {
            const repository = await storage.findRepository(githubOwner, githubRepository)
            const nextBranches = branches.length > 0 ? branches : await storage.listBranches(repository)
            const branch = selectedBranch || branchValue(nextBranches, repository.branch)
            const nextProject = { ...repository, branch }
            setBranches(nextBranches)
            setSelectedBranch(branch)
            await openProject('github', nextProject)
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'GitHub project load failed')
        } finally {
            setIsLoading(false)
        }
    }

    const handleOpenLocalClick = () => {
        if (!localProject || selectedBranch.length === 0) return

        void openProject('local', { ...localProject, branch: selectedBranch })
    }

    const handleSwitchBranchClick = async () => {
        if (!project || selectedBranch.length === 0) return

        setIsLoading(true)
        setErrorMessage(null)

        try {
            await dataService.switchBranch(selectedBranch)
            handleCloseDialog()
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Branch switch failed')
        } finally {
            setIsLoading(false)
        }
    }

    const handlePushClick = () => {
        setAnchorElement(null)
        void dataService.push()
    }

    const handleCompleteReleaseClick = async () => {
        setAnchorElement(null)
        const releaseName = window.prompt('Release name')
        if (releaseName === null) return

        setIsReleaseCompleting(true)
        setErrorMessage(null)

        try {
            await dataService.completeRelease(releaseName)
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Release completion failed')
        } finally {
            setIsReleaseCompleting(false)
        }
    }

    const handleCreateCardClick = async () => {
        if (!project || cardTitle.length === 0) return

        const draft: CardDraft = { body: cardBody, title: cardTitle, type: 'feature' }
        await dataService.createCard(draft)
        setCardBody('')
        setCardTitle('')
        handleCloseDialog()
    }

    return (
        <>
            <Button aria-controls={isMenuOpen ? 'project-menu' : undefined} aria-haspopup="true" onClick={handleProjectButtonClick} size="small" variant="outlined">
                Project
            </Button>
            <Menu anchorEl={anchorElement} id="project-menu" onClose={handleCloseMenu} open={isMenuOpen}>
                <MenuItem onClick={handleOpenProjectMenuClick}>Open project...</MenuItem>
                {isProjectOpen ? <MenuItem onClick={handleSwitchBranchMenuClick}>Switch branch...</MenuItem> : null}
                {isProjectOpen && pushMode === 'manual' ? <MenuItem onClick={handlePushClick}>Push</MenuItem> : null}
                {isProjectOpen ? (
                    <MenuItem disabled={isReleaseCompleting || activeCards.length === 0} onClick={handleCompleteReleaseClick}>
                        Complete release...
                    </MenuItem>
                ) : null}
                {isProjectOpen ? <MenuItem onClick={handleNewCardMenuClick}>New card...</MenuItem> : null}
            </Menu>

            <Dialog fullWidth maxWidth="sm" onClose={handleCloseDialog} open={dialogMode === 'open'}>
                <DialogTitle>Open project</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
                        <FormControl size="small">
                            <InputLabel id="project-source-label">Source</InputLabel>
                            <Select label="Source" labelId="project-source-label" onChange={handleSourceChange} value={source}>
                                <MenuItem value="github">GitHub</MenuItem>
                                <MenuItem value="local">Local</MenuItem>
                            </Select>
                        </FormControl>
                        {source === 'github' ? (
                            <>
                                <TextField disabled={!isGithubAuthenticated} label="Filter repositories" onChange={handleRepositoryFilterChange} size="small" value={repositoryFilter} />
                                <FormControl disabled={!isGithubAuthenticated || repositories.length === 0} size="small">
                                    <InputLabel id="repository-label">Repository</InputLabel>
                                    <Select label="Repository" labelId="repository-label" onChange={handleRepositoryChange} value={selectedRepositoryId}>
                                        {filteredRepositories.map((repository) => (
                                            <MenuItem key={repository.id} value={repository.id}>{repository.id}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <Divider />
                                <Typography variant="subtitle2">Manual GitHub repository</Typography>
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                    <TextField disabled={!isGithubAuthenticated} label="Owner" onChange={handleGithubOwnerChange} size="small" value={githubOwner} />
                                    <TextField disabled={!isGithubAuthenticated} label="Repository" onChange={handleGithubRepositoryChange} size="small" value={githubRepository} />
                                </Stack>
                                <Button disabled={!isGithubAuthenticated || githubOwner.length === 0 || githubRepository.length === 0 || isLoading} onClick={handleLoadManualBranchesClick} variant="outlined">
                                    Load branches
                                </Button>
                            </>
                        ) : (
                            <Button disabled={!electronBridge || isLoading} onClick={handleChooseLocalFolderClick} variant="outlined">
                                Choose local folder...
                            </Button>
                        )}
                        <FormControl disabled={branches.length === 0} size="small">
                            <InputLabel id="open-branch-label">Branch</InputLabel>
                            <Select label="Branch" labelId="open-branch-label" onChange={handleBranchChange} value={selectedBranch}>
                                {branches.map(({ name }) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    {source === 'github' ? (
                        <Button disabled={!isGithubAuthenticated || githubOwner.length === 0 || githubRepository.length === 0 || isLoading} onClick={handleOpenGithubClick} variant="contained">
                            Open GitHub
                        </Button>
                    ) : (
                        <Button disabled={!localProject || selectedBranch.length === 0 || isLoading} onClick={handleOpenLocalClick} variant="contained">
                            Open Local
                        </Button>
                    )}
                </DialogActions>
            </Dialog>

            <Dialog fullWidth maxWidth="xs" onClose={handleCloseDialog} open={dialogMode === 'branch'}>
                <DialogTitle>Switch branch</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
                        <FormControl disabled={branches.length === 0 || isLoading} size="small">
                            <InputLabel id="switch-branch-label">Branch</InputLabel>
                            <Select label="Branch" labelId="switch-branch-label" onChange={handleBranchChange} value={selectedBranch}>
                                {branches.map(({ name }) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    <Button disabled={selectedBranch.length === 0 || isLoading} onClick={handleSwitchBranchClick} variant="contained">
                        Switch
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog fullWidth maxWidth="sm" onClose={handleCloseDialog} open={dialogMode === 'card'}>
                <DialogTitle>New card</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <TextField label="New card title" onChange={handleCardTitleChange} size="small" value={cardTitle} />
                        <TextField label="New card body" multiline onChange={handleCardBodyChange} size="small" value={cardBody} />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    <Button disabled={!isProjectOpen || cardTitle.length === 0} onClick={handleCreateCardClick} variant="contained">
                        Create Feature
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    )
}
