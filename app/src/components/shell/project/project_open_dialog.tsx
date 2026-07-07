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
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import type { ChangeEvent } from 'react'
import { useState } from 'react'
import type { BranchReference, ProjectReference, RepositoryReference, TopLevelFolderReference } from '../../../data/data_types'
import { WorkingFolderChooserDialog, type WorkingFolderResolution } from './working_folder_chooser_dialog'

type ProjectSource = 'github' | 'local' | 'remote'

interface GithubBranchesResult {
    branches: BranchReference[]
    repository: RepositoryReference
}

interface LocalProjectResult {
    branches: BranchReference[]
    project: ProjectReference
}

interface ProjectOpenDialogProps {
    branches: BranchReference[]
    errorMessage: string | null
    isGithubAuthenticated: boolean
    isLoading: boolean
    isLocalAvailable: boolean
    missingWorkingFolder: WorkingFolderResolution | null
    open: boolean
    pendingGithubConflictProject: ProjectReference | null
    repositories: RepositoryReference[]
    onBranchChange: (branch: string) => void
    onChooseLocalFolder: () => Promise<LocalProjectResult | null>
    onClose: () => void
    onCreateRemoteProject: (rootPath: string, branch: string) => ProjectReference
    onCreateWorkingFolder: () => void
    onDiscardGithubPendingCommits: () => void
    onLoadManualBranches: (owner: string, repository: string) => Promise<GithubBranchesResult | null>
    onLoadRemoteBranches: (endpoint: string, token: string, rootPath: string, branch: string) => Promise<BranchReference[]>
    onOpenGithub: (owner: string, repository: string, branch: string) => Promise<void>
    onOpenLocal: (project: ProjectReference, branch: string) => void
    onOpenRemote: (endpoint: string, token: string, project: ProjectReference) => Promise<void>
    onRepositoryChange: (repository: RepositoryReference) => Promise<BranchReference[]>
    onSourceChange: () => void
    onUseWorkingFolder: (folder: TopLevelFolderReference) => void
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

/** Project open dialog for GitHub, local and remote project sources. */
export function ProjectOpenDialog(props: ProjectOpenDialogProps) {
    const {
        branches,
        errorMessage,
        isGithubAuthenticated,
        isLoading,
        isLocalAvailable,
        missingWorkingFolder,
        onBranchChange,
        onChooseLocalFolder,
        onClose,
        onCreateRemoteProject,
        onCreateWorkingFolder,
        onDiscardGithubPendingCommits,
        onLoadManualBranches,
        onLoadRemoteBranches,
        onOpenGithub,
        onOpenLocal,
        onOpenRemote,
        onRepositoryChange,
        onSourceChange,
        onUseWorkingFolder,
        open,
        pendingGithubConflictProject,
        repositories,
    } = props
    const [githubOwner, setGithubOwner] = useState('')
    const [githubRepository, setGithubRepository] = useState('')
    const [localProject, setLocalProject] = useState<ProjectReference | null>(null)
    const [repositoryFilter, setRepositoryFilter] = useState('')
    const [remoteEndpoint, setRemoteEndpoint] = useState('')
    const [remoteRootPath, setRemoteRootPath] = useState('')
    const [remoteToken, setRemoteToken] = useState('')
    const [selectedBranch, setSelectedBranch] = useState('')
    const [selectedRepositoryId, setSelectedRepositoryId] = useState('')
    const [source, setSource] = useState<ProjectSource>('github')
    const filteredRepositories = repositories.filter((repository) => repositoryMatchesFilter(repository, repositoryFilter))
    const filteredRepositoryIds = filteredRepositories.map(({ id }) => id)
    const isRemoteComplete = remoteEndpoint.length > 0 && remoteToken.length > 0 && remoteRootPath.length > 0
    const branchNames = branches.map(({ name }) => name)
    const branchSelectValue = selectValueExists(branchNames, selectedBranch) ? selectedBranch : ''
    const repositorySelectValue = selectValueExists(filteredRepositoryIds, selectedRepositoryId) ? selectedRepositoryId : ''

    const handleSourceChange = (event: SelectChangeEvent) => {
        setSource(event.target.value as ProjectSource)
        setLocalProject(null)
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

    const handleRemoteTokenChange = (event: ChangeEvent<HTMLInputElement>) => {
        setRemoteToken(event.target.value)
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

    const handleChooseLocalFolderClick = async () => {
        const result = await onChooseLocalFolder()
        if (!result) return

        setLocalProject(result.project)
        const branch = branchValue(result.branches, result.project.branch)
        setSelectedBranch(branch)
        onBranchChange(branch)
    }

    const handleLoadManualBranchesClick = async () => {
        const result = await onLoadManualBranches(githubOwner, githubRepository)
        if (!result) return

        const branch = branchValue(result.branches, result.repository.branch)
        setSelectedRepositoryId(result.repository.id)
        setSelectedBranch(branch)
        onBranchChange(branch)
    }

    const handleLoadRemoteBranchesClick = async () => {
        const nextBranches = await onLoadRemoteBranches(remoteEndpoint, remoteToken, remoteRootPath, selectedBranch || 'main')
        const branch = branchValue(nextBranches, selectedBranch || 'main')
        setSelectedBranch(branch)
        onBranchChange(branch)
    }

    const handleOpenGithubClick = () => {
        void onOpenGithub(githubOwner, githubRepository, selectedBranch)
    }

    const handleOpenLocalClick = () => {
        if (!localProject || selectedBranch.length === 0) return

        onOpenLocal(localProject, selectedBranch)
    }

    const handleOpenRemoteClick = () => {
        if (remoteEndpoint.length === 0 || remoteToken.length === 0 || remoteRootPath.length === 0) return

        const project = onCreateRemoteProject(remoteRootPath, selectedBranch || 'main')
        void onOpenRemote(remoteEndpoint, remoteToken, project)
    }

    return (
        <Dialog fullWidth maxWidth="sm" onClose={onClose} open={open}>
            <DialogTitle>Open project</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    {errorMessage ? (
                        <Alert
                            action={pendingGithubConflictProject ? (
                                <Button color="inherit" onClick={onDiscardGithubPendingCommits} size="small">
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
                            {isLocalAvailable ? <MenuItem value="local">Local</MenuItem> : null}
                            <MenuItem value="remote">Remote</MenuItem>
                        </Select>
                    </FormControl>
                    {source === 'github' ? (
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
                        <Button disabled={!isLocalAvailable || isLoading} onClick={handleChooseLocalFolderClick} variant="outlined">
                            Choose local folder...
                        </Button>
                    ) : (
                        <>
                            <TextField label="Endpoint" onChange={handleRemoteEndpointChange} size="small" value={remoteEndpoint} />
                            <TextField label="Token" onChange={handleRemoteTokenChange} size="small" type="password" value={remoteToken} />
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
                    )}
                    {source !== 'remote' ? (
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
                    {missingWorkingFolder ? (
                        <WorkingFolderChooserDialog
                            isLoading={isLoading}
                            onCreateWorkingFolder={onCreateWorkingFolder}
                            onUseWorkingFolder={onUseWorkingFolder}
                            resolution={missingWorkingFolder}
                        />
                    ) : null}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                {source === 'github' ? (
                    <Button disabled={!isGithubAuthenticated || githubOwner.length === 0 || githubRepository.length === 0 || isLoading} onClick={handleOpenGithubClick} variant="contained">
                        Open GitHub
                    </Button>
                ) : source === 'remote' ? (
                    <Button
                        disabled={!isRemoteComplete || isLoading}
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
    )
}
