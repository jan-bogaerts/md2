import {
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
import { DEFAULT_PROJECT_FOLDER, type BranchReference, type ProjectReference, type RepositoryReference, type TopLevelFolderReference } from '../../../data/data_types'
import { tryReadRemoteControlConnection } from '../../../data/remote_control_connection'
import type { ProjectOpenResolution } from '../../../services/project/project_session_service'
import { ProjectFolderSetupForm } from './project_folder_setup_form'
import { WorkingFolderChooserDialog } from './working_folder_chooser_dialog'

type ProjectSource = 'github' | 'remote'

interface GithubBranchesResult {
    branches: BranchReference[]
    repository: RepositoryReference
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
    repositories: RepositoryReference[]
    onBranchChange: (branch: string) => void
    onClose: () => void
    onCreateProjectFolders: (projectFolder: string) => void
    onCreateRemoteProject: (rootPath: string, branch: string) => ProjectReference | null
    onCreateWorkingFolder: () => void
    onDiscardGithubPendingCommits: () => void
    onLoadManualBranches: (owner: string, repository: string) => Promise<GithubBranchesResult | null>
    onLoadRemoteBranches: (endpoint: string, rootPath: string, branch: string) => Promise<BranchReference[]>
    onOpenGithub: (owner: string, repository: string, branch: string) => Promise<void>
    onOpenRemote: (endpoint: string, project: ProjectReference) => Promise<void>
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
        initialRemoteProject,
        initialSource,
        isDesktopMode,
        isGithubAuthenticated,
        isLoading,
        onBranchChange,
        onClose,
        onCreateProjectFolders,
        onCreateRemoteProject,
        onCreateWorkingFolder,
        onDiscardGithubPendingCommits,
        onLoadManualBranches,
        onLoadRemoteBranches,
        onOpenGithub,
        onOpenRemote,
        onRepositoryChange,
        onSourceChange,
        onUseWorkingFolder,
        open,
        pendingGithubConflictProject,
        projectOpenResolution,
        repositories,
    } = props
    const [githubOwner, setGithubOwner] = useState('')
    const [githubRepository, setGithubRepository] = useState('')
    const [projectFolder, setProjectFolder] = useState(DEFAULT_PROJECT_FOLDER)
    const [repositoryFilter, setRepositoryFilter] = useState('')
    const [remoteEndpoint, setRemoteEndpoint] = useState('')
    const [remoteRootPath, setRemoteRootPath] = useState('')
    const [selectedBranch, setSelectedBranch] = useState('')
    const [selectedRepositoryId, setSelectedRepositoryId] = useState('')
    const [source, setSource] = useState<ProjectSource>('github')
    const [wasOpen, setWasOpen] = useState(false)

    if (open !== wasOpen) {
        setWasOpen(open)
        if (open) {
            if (initialSource) setSource(initialSource)
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

    const projectFolderSetup = projectOpenResolution?.kind === 'project-folder-setup' ? projectOpenResolution : null
    const missingWorkingFolder = projectOpenResolution?.kind === 'missing-working-folder' ? projectOpenResolution : null
    const filteredRepositories = repositories.filter((repository) => repositoryMatchesFilter(repository, repositoryFilter))
    const filteredRepositoryIds = filteredRepositories.map(({ id }) => id)
    const isRemoteComplete = remoteEndpoint.length > 0 && remoteRootPath.length > 0
    const branchNames = branches.map(({ name }) => name)
    const branchSelectValue = selectValueExists(branchNames, selectedBranch) ? selectedBranch : ''
    const repositorySelectValue = selectValueExists(filteredRepositoryIds, selectedRepositoryId) ? selectedRepositoryId : ''

    const handleSourceChange = (event: SelectChangeEvent) => {
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
        const result = await onLoadManualBranches(githubOwner, githubRepository)
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

    const handleOpenGithubClick = () => {
        void onOpenGithub(githubOwner, githubRepository, selectedBranch)
    }

    const handleOpenRemoteClick = () => {
        if (remoteEndpoint.length === 0 || remoteRootPath.length === 0) return

        const project = onCreateRemoteProject(remoteRootPath, selectedBranch || 'main')
        if (!project) return
        void onOpenRemote(remoteEndpoint, project)
    }

    const handleProjectFolderChange = (value: string) => {
        setProjectFolder(value)
    }

    const handleCreateProjectFoldersClick = () => {
        onCreateProjectFolders(projectFolder)
    }

    const handleClose = () => {
        setProjectFolder(DEFAULT_PROJECT_FOLDER)
        onClose()
    }

    return (
        <Dialog fullWidth maxWidth="sm" onClose={handleClose} open={open}>
            <DialogTitle>{projectFolderSetup ? 'Create project' : 'Open project'}</DialogTitle>
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
                    {!projectOpenResolution && !isDesktopMode ? <FormControl size="small">
                        <InputLabel id="project-source-label">Source</InputLabel>
                        <Select label="Source" labelId="project-source-label" onChange={handleSourceChange} value={source}>
                            <MenuItem value="github">GitHub</MenuItem>
                            <MenuItem value="remote">Remote</MenuItem>
                        </Select>
                    </FormControl> : null}
                    {!projectOpenResolution && !isDesktopMode && source === 'github' ? (
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
                    ) : !projectOpenResolution && !isDesktopMode ? (
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
                    ) : null}
                    {!projectOpenResolution && !isDesktopMode && source !== 'remote' ? (
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
                        <ProjectFolderSetupForm
                            folders={projectFolderSetup.folders}
                            onProjectFolderChange={handleProjectFolderChange}
                            projectFolder={projectFolder}
                        />
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
                <Button onClick={handleClose}>Cancel</Button>
                {projectFolderSetup ? (
                    <Button disabled={projectFolder.trim().length === 0 || isLoading} onClick={handleCreateProjectFoldersClick} variant="contained">
                        Create
                    </Button>
                ) : !projectOpenResolution && !isDesktopMode && source === 'github' ? (
                    <Button disabled={!isGithubAuthenticated || githubOwner.length === 0 || githubRepository.length === 0 || isLoading} onClick={handleOpenGithubClick} variant="contained">
                        Open GitHub
                    </Button>
                ) : !projectOpenResolution && !isDesktopMode && source === 'remote' ? (
                    <Button
                        disabled={!isRemoteComplete || isLoading}
                        onClick={handleOpenRemoteClick}
                        variant="contained"
                    >
                        Open Remote
                    </Button>
                ) : null}
            </DialogActions>
        </Dialog>
    )
}
