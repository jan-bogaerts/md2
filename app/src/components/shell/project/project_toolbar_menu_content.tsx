import {
    Alert,
    Box,
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
import {
    DEFAULT_CARD_TYPES,
    type BranchReference,
    type CardDraft,
    type ProjectReference,
    type PushMode,
    type RepositoryReference,
    type TopLevelFolderReference,
} from '../../../data/data_types'
import { getElectronDataBridge } from '../../../data/electron_data_bridge'
import type { StorageType } from '../../../data/project_session'
import { configService } from '../../../services/config_service'
import { dataService } from '../../../services/data_service'
import { projectSessionService } from '../../../services/project_session_service'
import { useProjectSession } from '../../hooks/use_project_session'
import { useProjectState } from '../../hooks/use_project_state'
import { OPEN_PROJECT_DIALOG_EVENT } from '../../project_command_events'

type ProjectDialogMode = 'open' | 'branch' | 'card'
type ProjectSource = 'github' | 'local' | 'remote'

const EMPTY_BRANCHES: BranchReference[] = []
const EMPTY_REPOSITORIES: RepositoryReference[] = []
interface MissingWorkingFolderResolution {
    configuredWorkingFolder: string
    folders: TopLevelFolderReference[]
    project: ProjectReference
    storageType: StorageType
}

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

function repositoryMatchesFilter(repository: RepositoryReference, filter: string) {
    const normalizedFilter = filter.trim().toLowerCase()
    if (normalizedFilter.length === 0) return true

    return repository.id.toLowerCase().includes(normalizedFilter)
}

/** Toolbar project menu with dialogs for open, branch, push, release and card creation commands. */
export function ProjectToolbarMenu(props: ProjectToolbarMenuProps) {
    const { accessToken, isGithubAuthenticated } = props
    const { project, snapshot } = useProjectState()
    const projectSession = useProjectSession()
    const electronBridge = useMemo(() => getElectronDataBridge(), [])
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const [branches, setBranches] = useState<BranchReference[]>(EMPTY_BRANCHES)
    const [cardBody, setCardBody] = useState('')
    const [cardTitle, setCardTitle] = useState('')
    const [cardType, setCardType] = useState('feature')
    const [configRevision, setConfigRevision] = useState(0)
    const [dialogMode, setDialogMode] = useState<ProjectDialogMode | null>(null)
    const [githubOwner, setGithubOwner] = useState('')
    const [githubRepository, setGithubRepository] = useState('')
    const [isReleaseCompleting, setIsReleaseCompleting] = useState(false)
    const [localProject, setLocalProject] = useState<ProjectReference | null>(null)
    const [missingWorkingFolder, setMissingWorkingFolder] = useState<MissingWorkingFolderResolution | null>(null)
    const [repositories, setRepositories] = useState<RepositoryReference[]>(EMPTY_REPOSITORIES)
    const [repositoryFilter, setRepositoryFilter] = useState('')
    const [remoteEndpoint, setRemoteEndpoint] = useState('')
    const [remoteRootPath, setRemoteRootPath] = useState('')
    const [remoteToken, setRemoteToken] = useState('')
    const [selectedBranch, setSelectedBranch] = useState(project?.branch ?? '')
    const [selectedRepositoryId, setSelectedRepositoryId] = useState('')
    const [source, setSource] = useState<ProjectSource>('github')
    const activeCards = snapshot?.activeCards ?? []
    const errorMessage = projectSession.errorMessage
    const isLoading = projectSession.isLoading
    const pendingGithubConflictProject = projectSession.pendingGithubConflictProject
    const projectConfig = dataService.getConfig()
    const pushMode = (projectConfig?.pushMode ?? 'auto') as PushMode
    const cardTypes = projectConfig?.cardTypes ?? DEFAULT_CARD_TYPES
    const selectedCardType = cardTypes.some((typeConfig) => typeConfig.type === cardType) ? cardType : cardTypes[0]?.type ?? ''
    const isMenuOpen = !!anchorElement
    const isProjectOpen = !!project
    const filteredRepositories = repositories.filter((repository) => repositoryMatchesFilter(repository, repositoryFilter))

    void configRevision

    const openDialog = useCallback((mode: ProjectDialogMode) => {
        setAnchorElement(null)
        setDialogMode(mode)
        projectSessionService.setError(null)
    }, [])

    const loadSwitchBranches = useCallback(async () => {
        if (!project) return

        try {
            const nextBranches = await projectSessionService.listBranches(project.rootPath ? 'local' : 'github', project, accessToken)
            setBranches(nextBranches)
            setSelectedBranch(branchValue(nextBranches, project.branch))
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Branch list failed')
        }
    }, [accessToken, project])

    const loadRepositories = useCallback(async () => {
        try {
            const nextRepositories = await projectSessionService.listRepositories(accessToken)
            setRepositories(nextRepositories)
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Repository list failed')
            setRepositories(EMPTY_REPOSITORIES)
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
        projectSessionService.setError(null)
        setMissingWorkingFolder(null)
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

    const handleRemoteEndpointChange = (event: ChangeEvent<HTMLInputElement>) => {
        setRemoteEndpoint(event.target.value)
    }

    const handleRemoteRootPathChange = (event: ChangeEvent<HTMLInputElement>) => {
        setRemoteRootPath(event.target.value)
    }

    const handleRemoteTokenChange = (event: ChangeEvent<HTMLInputElement>) => {
        setRemoteToken(event.target.value)
    }

    const handleCardTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setCardTitle(event.target.value)
    }

    const handleCardBodyChange = (event: ChangeEvent<HTMLInputElement>) => {
        setCardBody(event.target.value)
    }

    const handleCardTypeChange = (event: SelectChangeEvent) => {
        setCardType(event.target.value)
    }

    const handleSourceChange = (event: SelectChangeEvent) => {
        setSource(event.target.value as ProjectSource)
        setBranches(EMPTY_BRANCHES)
        setMissingWorkingFolder(null)
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
        try {
            const nextBranches = await projectSessionService.listBranches('github', selectedRepository, accessToken)
            setBranches(nextBranches)
            setSelectedBranch(branchValue(nextBranches, selectedRepository.branch))
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Branch list failed')
            setBranches(EMPTY_BRANCHES)
            setSelectedBranch('')
        }
    }

    const handleBranchChange = (event: SelectChangeEvent) => {
        setSelectedBranch(event.target.value)
    }

    const handleBranchTextChange = (event: ChangeEvent<HTMLInputElement>) => {
        setSelectedBranch(event.target.value)
    }

    const handleChooseLocalFolderClick = async () => {
        if (!electronBridge) return

        try {
            const nextLocalProject = await electronBridge.openProjectFolder()
            if (!nextLocalProject) return

            const nextBranches = await projectSessionService.listBranches('local', nextLocalProject, accessToken)
            setLocalProject(nextLocalProject)
            setBranches(nextBranches)
            setSelectedBranch(branchValue(nextBranches, nextLocalProject.branch))
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Local project selection failed')
        }
    }

    const loadManualRepositoryBranches = async () => {
        try {
            const result = await projectSessionService.findGithubRepositoryBranches(githubOwner, githubRepository, accessToken)
            const { branches: nextBranches, repository } = result
            setSelectedRepositoryId(repository.id)
            setBranches(nextBranches)
            setSelectedBranch(branchValue(nextBranches, repository.branch))
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Manual repository branch list failed')
        }
    }

    const createRemoteProject = (): ProjectReference => {
        if (remoteRootPath.length === 0) throw new Error('Missing remote project root path')

        return { branch: selectedBranch || 'main', id: remoteRootPath, rootPath: remoteRootPath }
    }

    const loadRemoteBranches = async () => {
        try {
            projectSessionService.configureRemote(remoteEndpoint, remoteToken)
            const nextProject = createRemoteProject()
            const nextBranches = await projectSessionService.listBranches('remote', nextProject, accessToken)
            setBranches(nextBranches)
            setSelectedBranch(branchValue(nextBranches, nextProject.branch))
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Remote branch list failed')
            setBranches(EMPTY_BRANCHES)
            setSelectedBranch('main')
        }
    }

    const openProject = async (storageType: StorageType, nextProject: ProjectReference) => {
        setMissingWorkingFolder(null)

        try {
            const resolution = await projectSessionService.openProject(storageType, nextProject, accessToken)
            if (resolution) {
                setMissingWorkingFolder(resolution)

                return
            }

            handleCloseDialog()
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Project load failed')
        }
    }

    const openExistingWorkingFolder = async (folder: TopLevelFolderReference) => {
        if (!missingWorkingFolder) return

        try {
            await projectSessionService.openWorkingFolder(missingWorkingFolder, folder, accessToken)
            handleCloseDialog()
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Working folder selection failed')
        }
    }

    const handleUseWorkingFolderClick = (event: MouseEvent<HTMLButtonElement>) => {
        const folderPath = event.currentTarget.value
        const folder = missingWorkingFolder?.folders.find((currentFolder) => currentFolder.path === folderPath)
        if (!folder) return

        void openExistingWorkingFolder(folder)
    }

    const handleCreateWorkingFolderClick = async () => {
        if (!missingWorkingFolder) return

        try {
            await projectSessionService.createWorkingFolder(missingWorkingFolder, accessToken)
            handleCloseDialog()
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Working folder creation failed')
        }
    }

    const handleLoadManualBranchesClick = () => {
        void loadManualRepositoryBranches()
    }

    const handleLoadRemoteBranchesClick = () => {
        void loadRemoteBranches()
    }

    const handleDiscardGithubPendingCommitsClick = () => {
        if (!pendingGithubConflictProject) return

        projectSessionService.discardGithubPendingCommits(pendingGithubConflictProject, accessToken)
    }

    const handleOpenGithubClick = async () => {
        try {
            const result = await projectSessionService.findGithubRepositoryBranches(githubOwner, githubRepository, accessToken)
            const { branches: repositoryBranches, repository } = result
            const nextBranches = branches.length > 0 ? branches : repositoryBranches
            const branch = selectedBranch || branchValue(nextBranches, repository.branch)
            const nextProject = { ...repository, branch }
            setBranches(nextBranches)
            setSelectedBranch(branch)
            await openProject('github', nextProject)
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'GitHub project load failed')
        }
    }

    const handleOpenLocalClick = () => {
        if (!localProject || selectedBranch.length === 0) return

        void openProject('local', { ...localProject, branch: selectedBranch })
    }

    const handleOpenRemoteClick = async () => {
        if (remoteEndpoint.length === 0 || remoteToken.length === 0 || remoteRootPath.length === 0) return

        projectSessionService.configureRemote(remoteEndpoint, remoteToken)
        await openProject('remote', createRemoteProject())
    }

    const handleSwitchBranchClick = async () => {
        if (!project || selectedBranch.length === 0) return

        try {
            await projectSessionService.switchBranch(selectedBranch)
            handleCloseDialog()
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Branch switch failed')
        }
    }

    const handlePushClick = () => {
        setAnchorElement(null)
        void projectSessionService.push()
    }

    const handleCompleteReleaseClick = async () => {
        setAnchorElement(null)
        const releaseName = window.prompt('Release name')
        if (releaseName === null) return

        setIsReleaseCompleting(true)
        projectSessionService.setError(null)

        try {
            await projectSessionService.completeRelease(releaseName)
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Release completion failed')
        } finally {
            setIsReleaseCompleting(false)
        }
    }

    const handleCreateCardClick = async () => {
        if (!project || cardTitle.length === 0) return

        const draft: CardDraft = { body: cardBody, title: cardTitle, type: selectedCardType }
        await projectSessionService.createCard(draft)
        setCardBody('')
        setCardTitle('')
        setCardType('feature')
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
                        {errorMessage ? (
                            <Alert
                                action={pendingGithubConflictProject ? (
                                    <Button color="inherit" onClick={handleDiscardGithubPendingCommitsClick} size="small">
                                        Discard pending commits
                                    </Button>
                                ) : null}
                                severity="error"
                            >
                                {errorMessage}
                            </Alert>
                        ) : null}
                        <FormControl size="small">
                            <InputLabel id="project-source-label">Source</InputLabel>
                            <Select label="Source" labelId="project-source-label" onChange={handleSourceChange} value={source}>
                                <MenuItem value="github">GitHub</MenuItem>
                                {electronBridge ? <MenuItem value="local">Local</MenuItem> : null}
                                <MenuItem value="remote">Remote</MenuItem>
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
                        ) : source === 'local' ? (
                            <Button disabled={!electronBridge || isLoading} onClick={handleChooseLocalFolderClick} variant="outlined">
                                Choose local folder...
                            </Button>
                        ) : (
                            <>
                                <TextField label="Endpoint" onChange={handleRemoteEndpointChange} size="small" value={remoteEndpoint} />
                                <TextField label="Token" onChange={handleRemoteTokenChange} size="small" type="password" value={remoteToken} />
                                <TextField label="Project root path" onChange={handleRemoteRootPathChange} size="small" value={remoteRootPath} />
                                <TextField label="Branch" onChange={handleBranchTextChange} size="small" value={selectedBranch || 'main'} />
                                <Button
                                    disabled={
                                        remoteEndpoint.length === 0
                                        || remoteToken.length === 0
                                        || remoteRootPath.length === 0
                                        || isLoading
                                    }
                                    onClick={handleLoadRemoteBranchesClick}
                                    variant="outlined"
                                >
                                    Load remote branches
                                </Button>
                            </>
                        )}
                        {source !== 'remote' ? (
                            <FormControl disabled={branches.length === 0} size="small">
                                <InputLabel id="open-branch-label">Branch</InputLabel>
                                <Select label="Branch" labelId="open-branch-label" onChange={handleBranchChange} value={selectedBranch}>
                                    {branches.map(({ name }) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                                </Select>
                            </FormControl>
                        ) : null}
                        {missingWorkingFolder ? (
                            <Stack spacing={1}>
                                <Typography variant="subtitle2">Working folder is missing: {missingWorkingFolder.configuredWorkingFolder}</Typography>
                                {missingWorkingFolder.folders.map((folder) => (
                                    <Button
                                        disabled={isLoading}
                                        key={folder.path}
                                        onClick={handleUseWorkingFolderClick}
                                        value={folder.path}
                                        variant="outlined"
                                    >
                                        Use folder {folder.name}
                                    </Button>
                                ))}
                                <Button disabled={isLoading} onClick={handleCreateWorkingFolderClick} variant="outlined">
                                    Create &apos;{missingWorkingFolder.configuredWorkingFolder}&apos; from template
                                </Button>
                            </Stack>
                        ) : null}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    {source === 'github' ? (
                        <Button disabled={!isGithubAuthenticated || githubOwner.length === 0 || githubRepository.length === 0 || isLoading} onClick={handleOpenGithubClick} variant="contained">
                            Open GitHub
                        </Button>
                    ) : source === 'remote' ? (
                        <Button
                            disabled={remoteEndpoint.length === 0 || remoteToken.length === 0 || remoteRootPath.length === 0 || isLoading}
                            onClick={handleOpenRemoteClick}
                            variant="contained"
                        >
                            Open Remote
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
                        <FormControl size="small">
                            <InputLabel id="card-type-label">Card type</InputLabel>
                            <Select label="Card type" labelId="card-type-label" onChange={handleCardTypeChange} value={selectedCardType}>
                                {cardTypes.map((typeConfig) => (
                                    <MenuItem key={typeConfig.type} value={typeConfig.type}>
                                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                            <Box sx={{ backgroundColor: typeConfig.color, borderRadius: '50%', height: 12, width: 12 }} />
                                            <span>{typeConfig.label}</span>
                                        </Stack>
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField label="New card title" onChange={handleCardTitleChange} size="small" value={cardTitle} />
                        <TextField label="New card body" multiline onChange={handleCardBodyChange} size="small" value={cardBody} />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    <Button disabled={!isProjectOpen || cardTitle.length === 0 || selectedCardType.length === 0} onClick={handleCreateCardClick} variant="contained">
                        Create card
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    )
}
