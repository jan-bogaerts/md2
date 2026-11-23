import {
    Alert,
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
import { useState } from 'react'
import { DEFAULT_PROJECT_CONFIG, type RepositoryReference } from '../../../data/data_types'
import {
    canBrowseProjectFolders,
    isDesktopProjectMode,
    projectOpenFlowService,
    type ProjectOpenRequest,
    type ProjectOpenSource,
} from '../../../services/project/project_open_flow_service'
import {
    folderValuesOf,
    requireProjectFolderValues,
    type ProjectFolderValues,
} from '../../../services/project/project_session_service'
import { useProjectSession } from '../../hooks/use_project_session'
import { useProjectOpenValue } from '../../hooks/use_project_open_value'
import { ProjectFolderSetupFields } from './project_folder_setup_fields'
import { RecentProjectFolderList } from './recent_project_folder_list'

type ProjectKind = 'folder' | 'repository'

function folderValuesError(values: ProjectFolderValues) {
    try {
        requireProjectFolderValues(values)

        return null
    } catch (error) {
        return error instanceof Error ? error.message : 'Folder values are invalid'
    }
}

function selectValueExists(options: string[], value: string) {
    return options.some((option) => option === value)
}

function repositoryMatchesFilter(repository: RepositoryReference, filter: string) {
    const normalizedFilter = filter.trim().toLowerCase()
    if (normalizedFilter.length === 0) return true

    return repository.id.toLowerCase().includes(normalizedFilter)
}

function projectKind(source: ProjectOpenSource): ProjectKind {
    return source === 'personal' || source === 'public' ? 'repository' : 'folder'
}

/** Project open dialog for GitHub and local project sources. */
export function ProjectOpenDialog() {
    const branches = useProjectOpenValue('branches')
    const repositories = useProjectOpenValue('repositories')
    const recentLocalRepositories = useProjectOpenValue('recentLocalRepositories')
    const projectOpenResolution = useProjectOpenValue('resolution')
    const selectedSource = useProjectOpenValue('source')
    const folderValuesState = useProjectOpenValue('folderValues')
    const gitInitializationRootPath = useProjectOpenValue('gitInitializationRootPath')
    const isGithubAuthenticated = useProjectOpenValue('isGithubAuthenticated')
    const { isLoading, pendingGithubConflictProject } = useProjectSession()
    const isDesktopMode = isDesktopProjectMode()
    const [githubOwner, setGithubOwner] = useState('')
    const [githubRepository, setGithubRepository] = useState('')
    const [localRootPath, setLocalRootPath] = useState('')
    const [repositoryFilter, setRepositoryFilter] = useState('')
    const [selectedBranch, setSelectedBranch] = useState('')
    const [selectedRepositoryId, setSelectedRepositoryId] = useState('')
    const defaultSource: ProjectOpenSource = isDesktopMode ? 'local' : 'personal'
    const source = selectedSource ?? defaultSource

    const projectFolderSetup = projectOpenResolution?.kind === 'project-folder-setup'
        && projectOpenResolution.storageType !== 'github-readonly'
        ? projectOpenResolution
        : null
    const folderValues = folderValuesState ?? folderValuesOf(DEFAULT_PROJECT_CONFIG)
    const folderValuesMessage = projectFolderSetup ? folderValuesError(folderValues) : null
    const filteredRepositories = repositories.filter((repository) => repositoryMatchesFilter(repository, repositoryFilter))
    const filteredRepositoryIds = filteredRepositories.map(({ id }) => id)
    const branchNames = branches.map(({ name }) => name)
    const branchSelectValue = selectValueExists(branchNames, selectedBranch) ? selectedBranch : ''
    const repositorySelectValue = selectValueExists(filteredRepositoryIds, selectedRepositoryId) ? selectedRepositoryId : ''
    const selectedProjectKind = projectKind(source)
    const isLocalRootPathEmpty = localRootPath.trim().length === 0
    const isRepositoryView = !projectOpenResolution && selectedProjectKind === 'repository'
    const isGithubOpenDisabled = (source === 'personal' || source === 'public')
        && (!isGithubAuthenticated || githubOwner.length === 0 || githubRepository.length === 0)
    const isLocalOpenDisabled = source === 'local' && isLocalRootPathEmpty
    const isOpenDisabled = isLoading || folderValuesMessage !== null
        || (!projectFolderSetup && (isGithubOpenDisabled || isLocalOpenDisabled))

    const handleChooseLocalFolderClick = () => {
        void projectOpenFlowService.chooseLocalFolder()
    }

    const handleDiscardGithubPendingCommits = () => {
        if (!pendingGithubConflictProject) return

        projectOpenFlowService.discardGithubPendingCommits(pendingGithubConflictProject)
    }
    const handleProjectKindChange = (_event: MouseEvent<HTMLElement>, nextProjectKind: ProjectKind | null) => {
        if (!nextProjectKind) return

        projectOpenFlowService.setSource(nextProjectKind === 'repository' ? 'personal' : 'local')
        setSelectedBranch('')
        setSelectedRepositoryId('')
    }

    const handleRepositoryAccessChange = (event: SelectChangeEvent) => {
        projectOpenFlowService.setSource(event.target.value as ProjectOpenSource)
        setSelectedBranch('')
        setSelectedRepositoryId('')
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
        setSelectedBranch(await projectOpenFlowService.loadRepositoryBranches(repository))
    }

    const handleLoadManualBranchesClick = async () => {
        const result = await projectOpenFlowService.loadManualBranches(githubOwner, githubRepository, source === 'public')
        if (!result) return

        setSelectedRepositoryId(result.repository.id)
        setSelectedBranch(result.branch)
    }

    const handleRecentLocalRepositorySelect = (rootPath: string) => {
        setLocalRootPath(rootPath)
    }

    const handleOpenRecentLocal = async (rootPath: string) => {
        await projectOpenFlowService.openRecentLocal(rootPath)
    }

    const handleRemoveRecentLocal = async (rootPath: string) => {
        await projectOpenFlowService.removeRecentLocal(rootPath)
    }

    const handleFolderValuesChange = (values: ProjectFolderValues) => {
        projectOpenFlowService.setFolderValues(values)
    }

    const handleBrowseFolder = async (field: keyof ProjectFolderValues) => {
        const picked = await projectOpenFlowService.browseFolder(field, folderValues)
        if (picked === null) return

        projectOpenFlowService.setFolderValues({ ...folderValues, [field]: picked })
    }

    const handleOpenClick = () => {
        if (projectFolderSetup) {
            void projectOpenFlowService.confirmFolders(folderValues)

            return
        }
        if (source === 'personal' || source === 'public') {
            const request: ProjectOpenRequest = {source, owner: githubOwner, repository: githubRepository, branch: selectedBranch}
            void projectOpenFlowService.submit(request)

            return
        }
        const request: ProjectOpenRequest = { source, rootPath: localRootPath }
        void projectOpenFlowService.submit(request)
    }

    const handleClose = () => {
        projectOpenFlowService.close()
    }

    const handleConfirmGitInitialization = () => {
        void projectOpenFlowService.confirmGitInitialization()
    }

    const handleDeclineGitInitialization = () => {
        projectOpenFlowService.declineGitInitialization()
    }

    /** The folder-setup step holds unsaved multi-field input, so only Esc and Cancel may dismiss it. */
    const handleDialogClose = (_event: object, reason: string) => {
        if (projectFolderSetup && reason === 'backdropClick') return

        handleClose()
    }

    if (gitInitializationRootPath !== null) {
        return (
            <Dialog fullWidth maxWidth="sm" onClose={handleDeclineGitInitialization} open>
                <DialogTitle>Create Git repository?</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <Typography>
                            Selected folder is not a Git repository. Create a local Git repository in this folder?
                        </Typography>
                        <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }} variant="body2">
                            {gitInitializationRootPath}
                        </Typography>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleDeclineGitInitialization} variant="outlined">No</Button>
                    <Button onClick={handleConfirmGitInitialization} variant="contained">Yes</Button>
                </DialogActions>
            </Dialog>
        )
    }

    return (
        <Dialog fullWidth maxWidth="sm" onClose={handleDialogClose} open>
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
                    {isDesktopMode && !projectOpenResolution ? (
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
                    {!isDesktopMode && !projectOpenResolution ? (
                        <Alert severity="info">
                            Local folders can&apos;t be opened from the browser. Use the md2 desktop app to open a local folder.
                        </Alert>
                    ) : null}
                    {isRepositoryView && !isGithubAuthenticated ? (
                        <Alert severity="warning">
                            Repositories can&apos;t be loaded without a GitHub access token. Sign in with a personal access token first.
                        </Alert>
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
                                    onOpen={handleOpenRecentLocal}
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
                            onBrowseFolder={canBrowseProjectFolders() ? handleBrowseFolder : null}
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
