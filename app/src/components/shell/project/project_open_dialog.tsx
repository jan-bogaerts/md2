import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    IconButton,
    InputLabel,
    InputAdornment,
    MenuItem,
    Select,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material'
import { FolderOpen, SourceRepository } from 'mdi-material-ui'
import type { SelectChangeEvent } from '@mui/material'
import type { ChangeEvent, MouseEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_PROJECT_CONFIG, type BranchReference, type ProjectReference, type RepositoryReference } from '../../../data/data_types'
import { getElectronDataBridge } from '../../../data/electron_data_bridge'
import { readRecentLocalRepositories, recordRecentLocalRepository, removeRecentLocalRepository } from '../../../data/recent_local_repositories'
import { tryReadRemoteControlConnection } from '../../../data/remote_control_connection'
import { toProjectFolderRelativePath, toRepositoryRelativePath } from '../../../data/repository_relative_path'
import { dialogService } from '../../../services/dialog_service'
import {
    folderValuesOf,
    projectSessionService,
    requireProjectFolderValues,
    type ProjectFolderValues,
    type ProjectOpenResolution,
} from '../../../services/project/project_session_service'
import { useProjectSession } from '../../hooks/use_project_session'
import { ProjectFolderSetupFields } from './project_folder_setup_fields'
import { RecentProjectFolderList } from './recent_project_folder_list'

type ProjectSource = 'local' | 'personal' | 'public' | 'remote'
type ProjectKind = 'folder' | 'repository'

interface FolderSetupState {
    resolution: ProjectOpenResolution | null
    values: ProjectFolderValues
}

interface ProjectOpenDialogProps {
    accessToken: string | null
    initialRemoteProject?: ProjectReference | null
    initialSource?: ProjectSource | null
    isGithubAuthenticated: boolean
    initialProjectOpenResolution?: ProjectOpenResolution | null
    open: boolean
    onClose: () => void
}

function folderValuesError(values: ProjectFolderValues) {
    try {
        requireProjectFolderValues(values)

        return null
    } catch (error) {
        return error instanceof Error ? error.message : 'Folder values are invalid'
    }
}

function branchExists(branches: BranchReference[], branchName: string) {
    return branches.some(({ name }) => name === branchName)
}

function branchValue(branches: BranchReference[], preferredBranch: string) {
    if (branchExists(branches, preferredBranch)) return preferredBranch

    return branches[0]?.name ?? ''
}

function selectValueExists(options: string[], value: string) {
    return options.some((option) => option === value)
}

function repositoryMatchesFilter(repository: RepositoryReference, filter: string) {
    const normalizedFilter = filter.trim().toLowerCase()
    if (normalizedFilter.length === 0) return true

    return repository.id.toLowerCase().includes(normalizedFilter)
}

function projectKind(source: ProjectSource): ProjectKind {
    return source === 'personal' || source === 'public' ? 'repository' : 'folder'
}

/** Project open dialog for GitHub, local and remote project sources. */
export function ProjectOpenDialog(props: ProjectOpenDialogProps) {
    const {
        accessToken,
        initialRemoteProject,
        initialSource,
        isGithubAuthenticated,
        initialProjectOpenResolution = null,
        onClose,
        open,
    } = props
    const electronBridge = useMemo(() => getElectronDataBridge(), [])
    const { isLoading, isProjectLoading, pendingGithubConflictProject } = useProjectSession()
    const isDesktopMode = !!electronBridge
    const [branches, setBranches] = useState<BranchReference[]>([])
    const [projectOpenResolution, setProjectOpenResolution] = useState<ProjectOpenResolution | null>(initialProjectOpenResolution)
    const [recentLocalRepositories, setRecentLocalRepositories] = useState(() => readRecentLocalRepositories())
    const [repositories, setRepositories] = useState<RepositoryReference[]>([])
    const [pendingLocalRootPath, setPendingLocalRootPath] = useState<string | null>(null)
    const [githubOwner, setGithubOwner] = useState('')
    const [githubRepository, setGithubRepository] = useState('')
    const [localRootPath, setLocalRootPath] = useState('')
    const [folderSetupState, setFolderSetupState] = useState<FolderSetupState>({
        resolution: null,
        values: folderValuesOf(DEFAULT_PROJECT_CONFIG),
    })
    const [repositoryFilter, setRepositoryFilter] = useState('')
    const [remoteEndpoint, setRemoteEndpoint] = useState('')
    const [remoteRootPath, setRemoteRootPath] = useState('')
    const [selectedBranch, setSelectedBranch] = useState('')
    const [selectedRepositoryId, setSelectedRepositoryId] = useState('')
    const defaultSource: ProjectSource = isDesktopMode ? 'local' : 'personal'
    const [source, setSource] = useState<ProjectSource>(defaultSource)
    const [wasOpen, setWasOpen] = useState(false)

    if (open !== wasOpen) {
        setWasOpen(open)
        if (open) {
            setSource(initialSource ?? defaultSource)
            const stored = tryReadRemoteControlConnection()
            if (stored) {
                if (remoteEndpoint.length === 0) setRemoteEndpoint(stored.endpoint)
            }
            if (initialRemoteProject) {
                if (remoteRootPath.length === 0 && initialRemoteProject.rootPath) setRemoteRootPath(initialRemoteProject.rootPath)
                if (selectedBranch.length === 0 && initialRemoteProject.branch) setSelectedBranch(initialRemoteProject.branch)
            }
        }
    }

    const projectFolderSetup = projectOpenResolution?.kind === 'project-folder-setup'
        && projectOpenResolution.storageType !== 'github-readonly'
        ? projectOpenResolution
        : null
    const folderValues = folderSetupState.resolution === projectFolderSetup
        ? folderSetupState.values
        : projectFolderSetup?.values ?? folderValuesOf(DEFAULT_PROJECT_CONFIG)
    const folderValuesMessage = projectFolderSetup ? folderValuesError(folderValues) : null
    const filteredRepositories = repositories.filter((repository) => repositoryMatchesFilter(repository, repositoryFilter))
    const filteredRepositoryIds = filteredRepositories.map(({ id }) => id)
    const isRemoteComplete = remoteEndpoint.length > 0 && remoteRootPath.length > 0
    const branchNames = branches.map(({ name }) => name)
    const branchSelectValue = selectValueExists(branchNames, selectedBranch) ? selectedBranch : ''
    const repositorySelectValue = selectValueExists(filteredRepositoryIds, selectedRepositoryId) ? selectedRepositoryId : ''
    const selectedProjectKind = projectKind(source)
    const isLocalRootPathEmpty = localRootPath.trim().length === 0
    const isGithubOpenDisabled = (source === 'personal' || source === 'public')
        && (!isGithubAuthenticated || githubOwner.length === 0 || githubRepository.length === 0)
    const isRemoteOpenDisabled = source === 'remote' && !isRemoteComplete
    const isLocalOpenDisabled = source === 'local' && isLocalRootPathEmpty
    const isOpenDisabled = isLoading || folderValuesMessage !== null
        || (!projectFolderSetup && (isGithubOpenDisabled || isRemoteOpenDisabled || isLocalOpenDisabled))

    useEffect(() => {
        if (!open || !isGithubAuthenticated) return

        const loadRepositories = async () => {
            try {
                setRepositories(await projectSessionService.listRepositories(accessToken))
            } catch {
                setRepositories([])
            }
        }

        void loadRepositories()
    }, [accessToken, isGithubAuthenticated, open])

    const clearSourceState = () => {
        setBranches([])
        setProjectOpenResolution(null)
    }

    const handleProjectOpened = async (storageType: 'github' | 'github-readonly' | 'local' | 'remote', project: ProjectReference) => {
        try {
            const resolution = await projectSessionService.openProject(storageType, project, accessToken)
            if (resolution) {
                setProjectOpenResolution(resolution)
                if (storageType === 'local') setPendingLocalRootPath(project.rootPath ?? null)

                return
            }
            if (storageType === 'local' && project.rootPath) {
                setRecentLocalRepositories(await recordRecentLocalRepository(project.rootPath))
            }
            onClose()
        } catch {
            // ProjectSessionService emits the user-visible error.
        }
    }

    const openLocalProject = async (rootPath: string) => {
        if (!electronBridge || rootPath.trim().length === 0) return

        try {
            const normalizedPath = rootPath.trim()
            const project = await electronBridge.resolveProject({ branch: '', id: normalizedPath, rootPath: normalizedPath })
            await handleProjectOpened('local', project)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Local project selection failed' })
        }
    }

    const handleChooseLocalFolderClick = async () => {
        if (!electronBridge) return

        try {
            const project = await electronBridge.openProjectFolder()
            if (project) await handleProjectOpened('local', project)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Local project selection failed' })
        }
    }

    const handleRemoveRecentLocal = async (rootPath: string) => {
        try {
            setRecentLocalRepositories(await removeRecentLocalRepository(rootPath))
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Recent local project removal failed' })
        }
    }

    const handleDiscardGithubPendingCommits = () => {
        if (!pendingGithubConflictProject) return

        projectSessionService.discardGithubPendingCommits(pendingGithubConflictProject, accessToken)
    }

    const handleProjectKindChange = (_event: MouseEvent<HTMLElement>, nextProjectKind: ProjectKind | null) => {
        if (!nextProjectKind) return

        setSource(nextProjectKind === 'repository' ? 'personal' : isDesktopMode ? 'local' : 'remote')
        setSelectedBranch('')
        setSelectedRepositoryId('')
        clearSourceState()
    }

    const handleRepositoryAccessChange = (event: SelectChangeEvent) => {
        setSource(event.target.value as ProjectSource)
        setSelectedBranch('')
        setSelectedRepositoryId('')
        clearSourceState()
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

    const handleLocalRootPathChange = (event: ChangeEvent<HTMLInputElement>) => {
        setLocalRootPath(event.target.value)
    }

    const handleBranchChange = (event: SelectChangeEvent) => {
        setSelectedBranch(event.target.value)
    }

    const handleBranchTextChange = (event: ChangeEvent<HTMLInputElement>) => {
        setSelectedBranch(event.target.value)
    }

    const handleRepositoryChange = async (event: SelectChangeEvent) => {
        const repositoryId = event.target.value
        const repository = repositories.find((candidate) => candidate.id === repositoryId)
        setSelectedRepositoryId(repositoryId)
        if (!repository) return

        setGithubOwner(repository.owner)
        setGithubRepository(repository.repository)
        try {
            const nextBranches = await projectSessionService.listBranches('github', repository, accessToken)
            setBranches(nextBranches)
            setSelectedBranch(branchValue(nextBranches, repository.branch))
        } catch {
            setBranches([])
        }
    }

    const handleLoadManualBranchesClick = async () => {
        try {
            const storageType = source === 'public' ? 'github-readonly' : 'github'
            const result = await projectSessionService.findGithubRepositoryBranches(githubOwner, githubRepository, accessToken, storageType)
            setBranches(result.branches)
            setSelectedRepositoryId(result.repository.id)
            setSelectedBranch(branchValue(result.branches, result.repository.branch))
        } catch {
            setBranches([])
        }
    }

    const handleLoadRemoteBranchesClick = async () => {
        if (remoteRootPath.length === 0) return

        const project = { branch: selectedBranch || 'main', id: remoteRootPath, rootPath: remoteRootPath }
        projectSessionService.configureRemote(remoteEndpoint)
        try {
            const nextBranches = await projectSessionService.listBranches('remote', project, accessToken)
            setBranches(nextBranches)
            setSelectedBranch(branchValue(nextBranches, project.branch))
        } catch {
            setBranches([])
        }
    }

    const handleRecentLocalRepositorySelect = (rootPath: string) => {
        setLocalRootPath(rootPath)
    }

    const handleFolderValuesChange = (values: ProjectFolderValues) => {
        setFolderSetupState({ resolution: projectFolderSetup, values })
    }

    const handleBrowseFolder = async (field: keyof ProjectFolderValues) => {
        const rootPath = projectFolderSetup?.project.rootPath
        if (!electronBridge?.selectProjectSubFolder || !rootPath) return

        const pickedFolder = await electronBridge.selectProjectSubFolder(rootPath)
        if (pickedFolder === null) return

        const repositoryRelativePath = toRepositoryRelativePath(rootPath, pickedFolder)
        if (repositoryRelativePath === null || repositoryRelativePath.length === 0) {
            dialogService.displayError('Choose a folder inside the repository.')

            return
        }
        const picked = field === 'projectFolder'
            ? repositoryRelativePath
            : toProjectFolderRelativePath(folderValues.projectFolder, repositoryRelativePath)
        if (picked === null || picked.length === 0) {
            dialogService.displayError(`Choose a folder inside '${folderValues.projectFolder}'.`)

            return
        }

        setFolderSetupState((currentState) => {
            const currentValues = currentState.resolution === projectFolderSetup ? currentState.values : folderValues

            return { resolution: projectFolderSetup, values: { ...currentValues, [field]: picked } }
        })
    }

    const handleOpenClick = async () => {
        if (projectFolderSetup) {
            try {
                await projectSessionService.confirmProjectFolderSetup(projectFolderSetup, folderValues, accessToken)
                if (pendingLocalRootPath) {
                    setRecentLocalRepositories(await recordRecentLocalRepository(pendingLocalRootPath))
                    setPendingLocalRootPath(null)
                }
                onClose()
            } catch {
                // ProjectSessionService emits the user-visible error.
            }

            return
        }
        if (source === 'personal' || source === 'public') {
            try {
                const storageType = source === 'public' ? 'github-readonly' : 'github'
                const result = await projectSessionService.findGithubRepositoryBranches(
                    githubOwner, githubRepository, accessToken, storageType,
                )
                const availableBranches = branches.length > 0 ? branches : result.branches
                const branch = selectedBranch || branchValue(availableBranches, result.repository.branch)
                setBranches(availableBranches)
                await handleProjectOpened(storageType, { ...result.repository, branch })
            } catch {
                // ProjectSessionService emits the user-visible error.
            }

            return
        }
        if (source === 'local') {
            await openLocalProject(localRootPath)

            return
        }
        if (!isRemoteComplete) return

        const project = { branch: selectedBranch || 'main', id: remoteRootPath, rootPath: remoteRootPath }
        projectSessionService.configureRemote(remoteEndpoint)
        await handleProjectOpened('remote', project)
    }

    const handleClose = () => {
        setFolderSetupState({ resolution: null, values: folderValuesOf(DEFAULT_PROJECT_CONFIG) })
        setProjectOpenResolution(null)
        setPendingLocalRootPath(null)
        projectSessionService.setError(null)
        onClose()
    }

    /** The folder-setup step holds unsaved multi-field input, so only Esc and Cancel may dismiss it. */
    const handleDialogClose = (_event: object, reason: string) => {
        if (projectFolderSetup && reason === 'backdropClick') return

        handleClose()
    }

    return (
        <Dialog fullWidth maxWidth="sm" onClose={handleDialogClose} open={open && !isProjectLoading}>
            <DialogTitle>{projectFolderSetup ? 'Project folders' : 'Open project'}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    {pendingGithubConflictProject ? (
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                            <Typography color="text.secondary" sx={{ flex: 1 }} variant="body2">
                                Unpushed GitHub commits conflict with this branch.
                            </Typography>
                            <Button onClick={handleDiscardGithubPendingCommits} size="small" variant="outlined">
                                Discard pending commits
                            </Button>
                        </Stack>
                    ) : null}
                    {!projectOpenResolution ? (
                        <ToggleButtonGroup
                            aria-label="Project kind"
                            exclusive
                            fullWidth
                            onChange={handleProjectKindChange}
                            size="small"
                            sx={{
                                bgcolor: 'custom.track',
                                gap: 0.5,
                                p: 0.5,
                                '& .MuiToggleButtonGroup-grouped': {
                                    border: 0,
                                    borderRadius: '6px !important',
                                    color: 'text.secondary',
                                    gap: 1,
                                    '&.Mui-selected': {
                                        bgcolor: 'background.paper',
                                        color: 'primary.main',
                                        boxShadow: 1,
                                        '&:hover': { bgcolor: 'background.paper' },
                                    },
                                },
                            }}
                            value={selectedProjectKind}
                        >
                            <ToggleButton value="repository">
                                <SourceRepository aria-hidden />
                                Repository
                            </ToggleButton>
                            <ToggleButton value="folder">
                                <FolderOpen aria-hidden />
                                Folder
                            </ToggleButton>
                        </ToggleButtonGroup>
                    ) : null}
                    {!projectOpenResolution && (source === 'personal' || source === 'public') ? (
                        <>
                            <FormControl size="small">
                                <InputLabel id="repository-access-label">Repository access</InputLabel>
                                <Select label="Repository access" labelId="repository-access-label" onChange={handleRepositoryAccessChange} value={source}>
                                    <MenuItem value="personal">Personal</MenuItem>
                                    <MenuItem value="public">Public</MenuItem>
                                </Select>
                            </FormControl>
                            {source === 'personal' ? (
                                <>
                                    <TextField disabled={!isGithubAuthenticated} label="Filter repositories" onChange={handleRepositoryFilterChange} size="small" value={repositoryFilter} />
                                    <FormControl disabled={!isGithubAuthenticated || repositories.length === 0} size="small">
                                        <InputLabel id="repository-label">Repository</InputLabel>
                                        <Select label="Repository" labelId="repository-label" onChange={handleRepositoryChange} value={repositorySelectValue}>
                                            {filteredRepositories.map((repository) => (
                                                <MenuItem key={repository.id} value={repository.id}>{repository.id}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    <Divider />
                                </>
                            ) : null}
                            <Typography variant="subtitle2">{source === 'public' ? 'Public repository' : 'Personal repository lookup'}</Typography>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                <TextField disabled={!isGithubAuthenticated} label="Owner" onChange={handleGithubOwnerChange} size="small" value={githubOwner} />
                                <TextField disabled={!isGithubAuthenticated} label="Repository" onChange={handleGithubRepositoryChange} size="small" value={githubRepository} />
                            </Stack>
                            <Button disabled={!isGithubAuthenticated || githubOwner.length === 0 || githubRepository.length === 0 || isLoading} onClick={handleLoadManualBranchesClick} variant="outlined">
                                Load branches
                            </Button>
                        </>
                    ) : !projectOpenResolution && source === 'remote' ? (
                        <>
                            <TextField label="Endpoint" onChange={handleRemoteEndpointChange} size="small" value={remoteEndpoint} />
                            <TextField label="Project root path" onChange={handleRemoteRootPathChange} size="small" value={remoteRootPath} />
                            <TextField label="Branch" onChange={handleBranchTextChange} placeholder="main" size="small" value={selectedBranch} />
                            <Button
                                disabled={!isRemoteComplete || isLoading}
                                onClick={handleLoadRemoteBranchesClick}
                                variant="outlined"
                            >
                                Load remote branches
                            </Button>
                        </>
                    ) : !projectOpenResolution && source === 'local' ? (
                        <>
                            <TextField
                                label="Local repository folder"
                                onChange={handleLocalRootPathChange}
                                placeholder="Choose or enter a local folder"
                                size="small"
                                slotProps={{
                                    input: {
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <Tooltip title="Choose local repository folder">
                                                    <span>
                                                        <IconButton aria-label="Choose local repository folder" disabled={isLoading} edge="end" onClick={handleChooseLocalFolderClick}>
                                                            <FolderOpen />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </InputAdornment>
                                        ),
                                    },
                                    inputLabel: { shrink: true },
                                }}
                                sx={isLocalRootPathEmpty ? {
                                    '& .MuiOutlinedInput-root': {
                                        boxShadow: (theme) => `0 0 0 3px ${theme.palette.custom.primaryBg}`,
                                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
                                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
                                    },
                                } : undefined}
                                value={localRootPath}
                            />
                            {recentLocalRepositories.length > 0 ? (
                                <RecentProjectFolderList
                                    isLoading={isLoading}
                                    onOpen={openLocalProject}
                                    onRemove={handleRemoveRecentLocal}
                                    onSelect={handleRecentLocalRepositorySelect}
                                    paths={recentLocalRepositories}
                                />
                            ) : null}
                        </>
                    ) : null}
                    {!projectOpenResolution && (source === 'personal' || source === 'public') ? (
                        branches.length > 0 ? (
                            <FormControl size="small">
                                <InputLabel id="open-branch-label">Branch</InputLabel>
                                <Select label="Branch" labelId="open-branch-label" onChange={handleBranchChange} value={branchSelectValue}>
                                    {branches.map(({ name }) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                                </Select>
                            </FormControl>
                        ) : (
                            <TextField label="Branch" onChange={handleBranchTextChange} size="small" value={selectedBranch} />
                        )
                    ) : null}
                    {projectFolderSetup ? (
                        <ProjectFolderSetupFields
                            isLoading={isLoading}
                            onBrowseFolder={electronBridge?.selectProjectSubFolder ? handleBrowseFolder : null}
                            onValuesChange={handleFolderValuesChange}
                            resolution={projectFolderSetup}
                            values={folderValues}
                        />
                    ) : null}
                    {folderValuesMessage ? (
                        <Typography color="error" variant="body2">{folderValuesMessage}</Typography>
                    ) : null}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                {projectFolderSetup || !projectOpenResolution ? (
                    <Button disabled={isOpenDisabled} onClick={handleOpenClick} variant="contained">
                        Open
                    </Button>
                ) : null}
            </DialogActions>
        </Dialog>
    )
}
