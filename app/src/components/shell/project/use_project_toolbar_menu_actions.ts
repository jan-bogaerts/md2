import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    DEFAULT_CARD_TYPES,
    DEFAULT_STATES,
    type BranchReference,
    type CardDraft,
    type ProjectReference,
    type PushMode,
    type ReleaseBranchCandidate,
    type RepositoryReference,
} from '../../../data/data_types'
import { getElectronDataBridge } from '../../../data/electron_data_bridge'
import { readRecentLocalRepositories, recordRecentLocalRepository } from '../../../data/recent_local_repositories'
import { toProjectFolderRelativePath, toRepositoryRelativePath } from '../../../data/repository_relative_path'
import type { StorageType } from '../../../data/project_session'
import { dialogService } from '../../../services/dialog_service'
import { configService } from '../../../services/config/config_service'
import {
    projectSessionService,
    type ProjectFolderValues,
    type ProjectOpenResolution,
} from '../../../services/project/project_session_service'
import { useProjectConfig } from '../../hooks/use_project_config'
import { useConfigValueOrFallback } from '../../hooks/use_config_value'
import { useProjectSession } from '../../hooks/use_project_session'
import { useProjectState } from '../../hooks/use_project_state'
import {
    OPEN_NEW_CARD_DIALOG_EVENT,
    OPEN_PROJECT_DIALOG_EVENT,
    type OpenNewCardDialogDetail,
    type OpenProjectDialogDetail,
    type ProjectDialogSource,
} from '../../project_command_events'

type ProjectDialogMode = 'open' | 'branch' | 'card' | 'release'
type ProjectOpenResult = 'failed' | 'opened' | 'resolution'

const EMPTY_BRANCHES: BranchReference[] = []
const EMPTY_REPOSITORIES: RepositoryReference[] = []

interface UseProjectToolbarMenuActionsArgs {
    accessToken: string | null
    initialProjectOpenResolution?: ProjectOpenResolution | null
    isGithubAuthenticated: boolean
    onCloseDialog: () => void
    onOpenDialog: (mode: ProjectDialogMode) => void
}

function branchExists(branches: BranchReference[], branchName: string) {
    return branches.some(({ name }) => name === branchName)
}

function branchValue(branches: BranchReference[], preferredBranch: string) {
    if (branchExists(branches, preferredBranch)) return preferredBranch

    return branches[0]?.name ?? ''
}

/** Owns project menu service calls and non-dialog session state. */
export function useProjectToolbarMenuActions(args: UseProjectToolbarMenuActionsArgs) {
    const { accessToken, initialProjectOpenResolution = null, isGithubAuthenticated, onCloseDialog, onOpenDialog } = args
    const { project, snapshot } = useProjectState()
    const projectSession = useProjectSession()
    const projectConfig = useProjectConfig()
    const electronBridge = useMemo(() => getElectronDataBridge(), [])
    const [branches, setBranches] = useState<BranchReference[]>(EMPTY_BRANCHES)
    const [isReleaseCompleting, setIsReleaseCompleting] = useState(false)
    const [projectOpenResolution, setProjectOpenResolution] = useState<ProjectOpenResolution | null>(initialProjectOpenResolution)
    const [initialProjectSource, setInitialProjectSource] = useState<ProjectDialogSource | null>(
        initialProjectOpenResolution?.storageType === 'remote' ? 'remote' : null,
    )
    const [initialRemoteProject, setInitialRemoteProject] = useState<ProjectReference | null>(
        initialProjectOpenResolution?.storageType === 'remote' ? initialProjectOpenResolution.project : null,
    )
    const [newCardInitialStatus, setNewCardInitialStatus] = useState('')
    const [pendingLocalRootPath, setPendingLocalRootPath] = useState<string | null>(null)
    const [recentLocalRepositories, setRecentLocalRepositories] = useState(() => readRecentLocalRepositories())
    const [repositories, setRepositories] = useState<RepositoryReference[]>(EMPTY_REPOSITORIES)
    const [releaseBranchCandidates, setReleaseBranchCandidates] = useState<ReleaseBranchCandidate[]>([])
    const [switchBranch, setSwitchBranch] = useState(project?.branch ?? '')
    const activeCards = snapshot?.activeCards ?? []
    const cardTypes = projectConfig?.cardTypes ?? DEFAULT_CARD_TYPES
    const states = projectConfig?.states ?? DEFAULT_STATES
    const pushMode = (projectConfig?.pushMode ?? 'auto') as PushMode
    const releaseSelectAllDefault = useConfigValueOrFallback('react.deleteBranchesAfterRelease', false)
    const releaseIncludeProjectActivityDefault = useConfigValueOrFallback('react.includeProjectActivityInRelease', false)

    const closeDialog = useCallback(() => {
        onCloseDialog()
        setProjectOpenResolution(null)
        projectSessionService.setError(null)
    }, [onCloseDialog])

    const openProject = useCallback(async (storageType: StorageType, nextProject: ProjectReference): Promise<ProjectOpenResult> => {
        setProjectOpenResolution(null)

        try {
            const resolution = await projectSessionService.openProject(storageType, nextProject, accessToken)
            if (resolution) {
                setProjectOpenResolution(resolution)
                onOpenDialog('open')

                return 'resolution'
            }

            closeDialog()
            return 'opened'
        } catch {
            // ProjectSessionService emits the user-visible error.
            return 'failed'
        }
    }, [accessToken, closeDialog, onOpenDialog])

    const recordOpenedLocalProject = useCallback(async (rootPath: string) => {
        setRecentLocalRepositories(await recordRecentLocalRepository(rootPath))
        setPendingLocalRootPath(null)
    }, [])

    const openResolvedLocalProject = useCallback(async (nextProject: ProjectReference) => {
        if (!nextProject.rootPath) throw new Error('Resolved local repository has no root path')

        const result = await openProject('local', nextProject)
        if (result === 'opened') await recordOpenedLocalProject(nextProject.rootPath)
        if (result === 'resolution') setPendingLocalRootPath(nextProject.rootPath)
    }, [openProject, recordOpenedLocalProject])

    const chooseLocalProjectFolder = useCallback(async () => {
        if (!electronBridge) return

        let nextProject: ProjectReference | null
        try {
            nextProject = await electronBridge.openProjectFolder()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Local project selection failed' })

            return
        }

        if (nextProject) await openResolvedLocalProject(nextProject)
    }, [electronBridge, openResolvedLocalProject])

    const openLocalProject = useCallback(async (rootPath: string) => {
        if (!electronBridge) return

        const normalizedPath = rootPath.trim()
        if (normalizedPath.length === 0) return

        try {
            const nextProject = await electronBridge.resolveProject({ branch: '', id: normalizedPath, rootPath: normalizedPath })
            await openResolvedLocalProject(nextProject)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Local project selection failed' })
        }
    }, [electronBridge, openResolvedLocalProject])

    const loadRepositories = useCallback(async () => {
        try {
            setRepositories(await projectSessionService.listRepositories(accessToken))
        } catch {
            setRepositories(EMPTY_REPOSITORIES)
        }
    }, [accessToken])

    const loadSwitchBranches = useCallback(async () => {
        if (!project) return

        try {
            const storageType = project.rootPath ? 'local' : 'github'
            const nextBranches = await projectSessionService.listBranches(storageType, project, accessToken)
            setBranches(nextBranches)
            setSwitchBranch(branchValue(nextBranches, project.branch))
        } catch {
            // ProjectSessionService emits the user-visible error.
        }
    }, [accessToken, project])

    useEffect(() => {
        const handleOpenProjectDialog = (event: Event) => {
            const detail = (event as CustomEvent<OpenProjectDialogDetail>).detail
            setInitialProjectSource(detail?.source ?? null)
            setInitialRemoteProject(detail?.project ?? null)
            setProjectOpenResolution(detail?.resolution ?? null)
            onOpenDialog('open')
            if (isGithubAuthenticated) void loadRepositories()
        }

        window.addEventListener(OPEN_PROJECT_DIALOG_EVENT, handleOpenProjectDialog)

        return () => window.removeEventListener(OPEN_PROJECT_DIALOG_EVENT, handleOpenProjectDialog)
    }, [isGithubAuthenticated, loadRepositories, onOpenDialog])

    useEffect(() => {
        const handleOpenNewCardDialog = (event: Event) => {
            if (!project) return

            const { status } = (event as CustomEvent<OpenNewCardDialogDetail>).detail
            const initialStatus = states.some((stateConfig) => stateConfig.state === status) ? status : states[0]?.state
            setNewCardInitialStatus(initialStatus ?? '')
            onOpenDialog('card')
        }

        window.addEventListener(OPEN_NEW_CARD_DIALOG_EVENT, handleOpenNewCardDialog)

        return () => window.removeEventListener(OPEN_NEW_CARD_DIALOG_EVENT, handleOpenNewCardDialog)
    }, [onOpenDialog, project, states])

    const openNewCardDialog = () => {
        setNewCardInitialStatus(states[0]?.state ?? '')
        onOpenDialog('card')
    }

    const openProjectDialog = () => {
        setInitialProjectSource(null)
        setInitialRemoteProject(null)
        onOpenDialog('open')
        if (isGithubAuthenticated) void loadRepositories()
    }

    const openBranchDialog = () => {
        onOpenDialog('branch')
        void loadSwitchBranches()
    }

    const clearOpenDialogState = () => {
        setBranches(EMPTY_BRANCHES)
        setProjectOpenResolution(null)
    }

    const loadRepositoryBranches = async (repository: RepositoryReference) => {
        try {
            const nextBranches = await projectSessionService.listBranches('github', repository, accessToken)
            setBranches(nextBranches)

            return nextBranches
        } catch {
            setBranches(EMPTY_BRANCHES)

            return EMPTY_BRANCHES
        }
    }

    const loadManualBranches = async (owner: string, repositoryName: string, isPublic: boolean) => {
        try {
            const storageType = isPublic ? 'github-readonly' : 'github'
            const result = await projectSessionService.findGithubRepositoryBranches(owner, repositoryName, accessToken, storageType)
            setBranches(result.branches)

            return result
        } catch {
            return null
        }
    }

    const createRemoteProject = (rootPath: string, branch: string): ProjectReference | null => {
        try {
            if (rootPath.length === 0) throw new Error('Missing remote project root path')

            return { branch: branch || 'main', id: rootPath, rootPath }
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Remote project could not be created' })

            return null
        }
    }

    const loadRemoteBranches = async (endpoint: string, rootPath: string, branch: string) => {
        const remoteProject = createRemoteProject(rootPath, branch)
        if (!remoteProject) {
            setBranches(EMPTY_BRANCHES)

            return EMPTY_BRANCHES
        }

        projectSessionService.configureRemote(endpoint)

        try {
            const nextBranches = await projectSessionService.listBranches('remote', remoteProject, accessToken)
            setBranches(nextBranches)

            return nextBranches
        } catch {
            setBranches(EMPTY_BRANCHES)

            return EMPTY_BRANCHES
        }
    }

    const openGithubProject = async (owner: string, repositoryName: string, branch: string, isPublic: boolean) => {
        try {
            const storageType = isPublic ? 'github-readonly' : 'github'
            const result = await projectSessionService.findGithubRepositoryBranches(owner, repositoryName, accessToken, storageType)
            const fallbackBranches = branches.length > 0 ? branches : result.branches
            const selectedBranch = branch || branchValue(fallbackBranches, result.repository.branch)
            setBranches(fallbackBranches)
            await openProject(storageType, { ...result.repository, branch: selectedBranch })
        } catch {
            // ProjectSessionService emits the user-visible error.
        }
    }

    const openRemoteProject = async (endpoint: string, nextProject: ProjectReference) => {
        projectSessionService.configureRemote(endpoint)
        await openProject('remote', nextProject)
    }

    const confirmProjectFolderSetup = async (values: ProjectFolderValues) => {
        if (!projectOpenResolution) return

        try {
            await projectSessionService.confirmProjectFolderSetup(projectOpenResolution, values, accessToken)
            if (pendingLocalRootPath) await recordOpenedLocalProject(pendingLocalRootPath)
            closeDialog()
        } catch {
            // ProjectSessionService emits the user-visible error.
        }
    }

    /**
     * Opens the OS directory dialog for one folder field and returns the picked folder relative to
     * the repository root, or relative to the project folder for the four sub-folders. A pick
     * outside the repository is a user mistake, so it is shown and not reported.
     */
    const browseProjectSubFolder = async (_currentValue: string, projectFolder: string, isProjectFolder: boolean) => {
        const rootPath = projectOpenResolution?.project.rootPath
        if (!electronBridge?.selectProjectSubFolder || !rootPath) return null

        const picked = await electronBridge.selectProjectSubFolder(rootPath)
        if (picked === null) return null

        const repositoryRelativePath = toRepositoryRelativePath(rootPath, picked)
        if (repositoryRelativePath === null || repositoryRelativePath.length === 0) {
            dialogService.displayError('Choose a folder inside the repository.')

            return null
        }
        if (isProjectFolder) return repositoryRelativePath

        const projectFolderRelativePath = toProjectFolderRelativePath(projectFolder, repositoryRelativePath)
        if (projectFolderRelativePath === null || projectFolderRelativePath.length === 0) {
            dialogService.displayError(`Choose a folder inside '${projectFolder}'.`)

            return null
        }

        return projectFolderRelativePath
    }

    const switchProjectBranch = async (branch: string) => {
        try {
            await projectSessionService.switchBranch(branch)
            closeDialog()
        } catch {
            // ProjectSessionService emits the user-visible error.
        }
    }

    const openReleaseDialog = async () => {
        try {
            setReleaseBranchCandidates(await projectSessionService.getReleaseBranchCandidates())
            onOpenDialog('release')
        } catch {
            // ProjectSessionService emits the user-visible error.
        }
    }

    const completeRelease = async (releaseName: string, selectedBranchNames: string[], includeProjectActivity: boolean) => {
        setIsReleaseCompleting(true)
        try {
            await projectSessionService.completeRelease(releaseName, selectedBranchNames, includeProjectActivity)
            closeDialog()
        } catch {
            // ProjectSessionService emits the user-visible error.
        } finally {
            setIsReleaseCompleting(false)
        }
    }

    const setReleaseSelectAllDefault = (selected: boolean) => {
        configService.setReactPreference('react.deleteBranchesAfterRelease', selected)
    }

    const setReleaseIncludeProjectActivityDefault = (included: boolean) => {
        configService.setReactPreference('react.includeProjectActivityInRelease', included)
    }

    const createCard = async (draft: CardDraft, initialState: string) => {
        await projectSessionService.createCard(draft, initialState)
        closeDialog()
    }

    return {
        activeCards,
        branches,
        cardTypes,
        chooseLocalProjectFolder,
        clearOpenDialogState,
        closeDialog,
        commit: () => projectSessionService.commit(),
        completeRelease,
        initialProjectSource,
        initialRemoteProject,
        newCardInitialStatus,
        browseProjectSubFolder,
        confirmProjectFolderSetup,
        createCard,
        createRemoteProject,
        isLoading: projectSession.isLoading,
        isDesktopMode: !!electronBridge,
        isProjectOpen: !!project,
        isReleaseCompleting,
        loadSwitchBranches,
        loadManualBranches,
        loadRemoteBranches,
        loadRepositoryBranches,
        projectOpenResolution,
        openBranchDialog,
        openGithubProject,
        openLocalProject,
        openNewCardDialog,
        openProjectDialog,
        openRemoteProject,
        openReleaseDialog,
        pendingGithubConflictProject: projectSession.pendingGithubConflictProject,
        pull: () => projectSessionService.pull(),
        push: () => projectSessionService.push(),
        pushMode,
        recentLocalRepositories,
        repositories,
        releaseBranchCandidates,
        releaseIncludeProjectActivityDefault,
        releaseSelectAllDefault,
        setReleaseIncludeProjectActivityDefault,
        setReleaseSelectAllDefault,
        setSwitchBranch,
        states,
        switchBranch,
        switchProjectBranch,
    }
}
