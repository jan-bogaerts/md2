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
    List,
    ListItemButton,
    ListItemText,
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
import { useState } from 'react'
import { DEFAULT_PROJECT_CONFIG, type BranchReference, type ProjectReference, type RepositoryReference } from '../../../data/data_types'
import { tryReadRemoteControlConnection } from '../../../data/remote_control_connection'
import {
    folderValuesOf,
    requireProjectFolderValues,
    type ProjectFolderValues,
    type ProjectOpenResolution,
} from '../../../services/project/project_session_service'
import { ProjectFolderSetupFields } from './project_folder_setup_fields'

type ProjectSource = 'local' | 'personal' | 'public' | 'remote'
type ProjectKind = 'folder' | 'repository'

interface GithubBranchesResult {
    branches: BranchReference[]
    repository: RepositoryReference
}

interface FolderSetupState {
    resolution: ProjectOpenResolution | null
    values: ProjectFolderValues
}

interface ProjectOpenDialogProps {
    branches: BranchReference[]
    initialRemoteProject?: ProjectReference | null
    initialSource?: ProjectSource | null
    isDesktopMode: boolean
    isGithubAuthenticated: boolean
    isLoading: boolean
    projectOpenResolution: ProjectOpenResolution | null
    open: boolean
    pendingGithubConflictProject: ProjectReference | null
    recentLocalRepositories: string[]
    repositories: RepositoryReference[]
    onBranchChange: (branch: string) => void
    onBrowseProjectSubFolder: ((currentValue: string, projectFolder: string, isProjectFolder: boolean) => Promise<string | null>) | null
    onClose: () => void
    onConfirmProjectFolderSetup: (values: ProjectFolderValues) => void
    onCreateRemoteProject: (rootPath: string, branch: string) => ProjectReference | null
    onDiscardGithubPendingCommits: () => void
    onChooseLocalFolder: () => Promise<void>
    onLoadManualBranches: (owner: string, repository: string, isPublic: boolean) => Promise<GithubBranchesResult | null>
    onLoadRemoteBranches: (endpoint: string, rootPath: string, branch: string) => Promise<BranchReference[]>
    onOpenGithub: (owner: string, repository: string, branch: string, isPublic: boolean) => Promise<void>
    onOpenLocal: (rootPath: string) => Promise<void>
    onOpenRemote: (endpoint: string, project: ProjectReference) => Promise<void>
    onRepositoryChange: (repository: RepositoryReference) => Promise<BranchReference[]>
    onSourceChange: () => void
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
        branches,
        initialRemoteProject,
        initialSource,
        isDesktopMode,
        isGithubAuthenticated,
        isLoading,
        onBranchChange,
        onBrowseProjectSubFolder,
        onClose,
        onConfirmProjectFolderSetup,
        onCreateRemoteProject,
        onDiscardGithubPendingCommits,
        onChooseLocalFolder,
        onLoadManualBranches,
        onLoadRemoteBranches,
        onOpenGithub,
        onOpenLocal,
        onOpenRemote,
        onRepositoryChange,
        onSourceChange,
        open,
        pendingGithubConflictProject,
        projectOpenResolution,
        recentLocalRepositories,
        repositories,
    } = props
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

    const handleProjectKindChange = (_event: MouseEvent<HTMLElement>, nextProjectKind: ProjectKind | null) => {
        if (!nextProjectKind) return

        setSource(nextProjectKind === 'repository' ? 'personal' : isDesktopMode ? 'local' : 'remote')
        setSelectedBranch('')
        setSelectedRepositoryId('')
        onSourceChange()
    }

    const handleRepositoryAccessChange = (event: SelectChangeEvent) => {
        setSource(event.target.value as ProjectSource)
        setSelectedBranch('')
        setSelectedRepositoryId('')
        onSourceChange()
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
        onBranchChange(event.target.value)
    }

    const handleBranchTextChange = (event: ChangeEvent<HTMLInputElement>) => {
        setSelectedBranch(event.target.value)
        onBranchChange(event.target.value)
    }

    const handleRepositoryChange = async (event: SelectChangeEvent) => {
        const repositoryId = event.target.value
        const repository = repositories.find((candidate) => candidate.id === repositoryId)
        setSelectedRepositoryId(repositoryId)
        if (!repository) return

        setGithubOwner(repository.owner)
        setGithubRepository(repository.repository)
        const nextBranches = await onRepositoryChange(repository)
        const branch = branchValue(nextBranches, repository.branch)
        setSelectedBranch(branch)
        onBranchChange(branch)
    }

    const handleLoadManualBranchesClick = async () => {
        const result = await onLoadManualBranches(githubOwner, githubRepository, source === 'public')
        if (!result) return

        const branch = branchValue(result.branches, result.repository.branch)
        setSelectedRepositoryId(result.repository.id)
        setSelectedBranch(branch)
        onBranchChange(branch)
    }

    const handleLoadRemoteBranchesClick = async () => {
        const nextBranches = await onLoadRemoteBranches(remoteEndpoint, remoteRootPath, selectedBranch || 'main')
        const branch = branchValue(nextBranches, selectedBranch || 'main')
        setSelectedBranch(branch)
        onBranchChange(branch)
    }

    const handleChooseLocalFolderClick = () => {
        void onChooseLocalFolder()
    }

    const handleRecentLocalRepositoryClick = (event: MouseEvent<HTMLDivElement>) => {
        const rootPath = event.currentTarget.dataset.rootPath
        if (!rootPath) throw new Error('Recent local repository path is missing')

        setLocalRootPath(rootPath)
    }

    const handleFolderValuesChange = (values: ProjectFolderValues) => {
        setFolderSetupState({ resolution: projectFolderSetup, values })
    }

    const handleBrowseFolder = async (field: keyof ProjectFolderValues) => {
        if (!onBrowseProjectSubFolder) return

        const picked = await onBrowseProjectSubFolder(folderValues[field], folderValues.projectFolder, field === 'projectFolder')
        if (picked === null) return

        setFolderSetupState((currentState) => {
            const currentValues = currentState.resolution === projectFolderSetup ? currentState.values : folderValues

            return { resolution: projectFolderSetup, values: { ...currentValues, [field]: picked } }
        })
    }

    const handleOpenClick = () => {
        if (projectFolderSetup) {
            onConfirmProjectFolderSetup(folderValues)

            return
        }
        if (source === 'personal' || source === 'public') {
            void onOpenGithub(githubOwner, githubRepository, selectedBranch, source === 'public')

            return
        }
        if (source === 'local') {
            void onOpenLocal(localRootPath)

            return
        }
        if (!isRemoteComplete) return

        const project = onCreateRemoteProject(remoteRootPath, selectedBranch || 'main')
        if (!project) return

        void onOpenRemote(remoteEndpoint, project)
    }

    const handleClose = () => {
        setFolderSetupState({ resolution: null, values: folderValuesOf(DEFAULT_PROJECT_CONFIG) })
        onClose()
    }

    return (
        <Dialog fullWidth maxWidth="sm" onClose={handleClose} open={open}>
            <DialogTitle>{projectFolderSetup ? 'Project folders' : 'Open project'}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    {pendingGithubConflictProject ? (
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                            <Typography color="text.secondary" sx={{ flex: 1 }} variant="body2">
                                Unpushed GitHub commits conflict with this branch.
                            </Typography>
                            <Button onClick={onDiscardGithubPendingCommits} size="small" variant="outlined">
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
                            <TextField label="Branch" onChange={handleBranchTextChange} size="small" value={selectedBranch || 'main'} />
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
                                <>
                                    <Typography variant="subtitle2">Recent folders</Typography>
                                    <List dense disablePadding>
                                        {recentLocalRepositories.map((rootPath) => (
                                            <ListItemButton
                                                data-root-path={rootPath}
                                                key={rootPath.toLowerCase()}
                                                onClick={handleRecentLocalRepositoryClick}
                                            >
                                                <ListItemText primary={rootPath} />
                                            </ListItemButton>
                                        ))}
                                    </List>
                                </>
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
                            onBrowseFolder={onBrowseProjectSubFolder ? handleBrowseFolder : null}
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
