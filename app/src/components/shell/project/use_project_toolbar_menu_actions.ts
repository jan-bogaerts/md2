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
import { projectSessionService, type MissingWorkingFolderResolution } from '../../../services/project_session_service'
import { useProjectConfig } from '../../hooks/use_project_config'
import { useProjectSession } from '../../hooks/use_project_session'
import { useProjectState } from '../../hooks/use_project_state'
import { OPEN_PROJECT_DIALOG_EVENT } from '../../project_command_events'

type ProjectDialogMode = 'open' | 'branch' | 'card' | 'release'

const EMPTY_BRANCHES: BranchReference[] = []
const EMPTY_REPOSITORIES: RepositoryReference[] = []

interface UseProjectToolbarMenuActionsArgs {
    accessToken: string | null
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
    const { accessToken, isGithubAuthenticated, onCloseDialog, onOpenDialog } = args
    const { project, snapshot } = useProjectState()
    const projectSession = useProjectSession()
    const projectConfig = useProjectConfig()
    const electronBridge = useMemo(() => getElectronDataBridge(), [])
    const [branches, setBranches] = useState<BranchReference[]>(EMPTY_BRANCHES)
    const [isReleaseCompleting, setIsReleaseCompleting] = useState(false)
    const [missingWorkingFolder, setMissingWorkingFolder] = useState<MissingWorkingFolderResolution | null>(null)
    const [repositories, setRepositories] = useState<RepositoryReference[]>(EMPTY_REPOSITORIES)
    const [switchBranch, setSwitchBranch] = useState(project?.branch ?? '')
    const activeCards = snapshot?.activeCards ?? []
    const cardTypes = projectConfig?.cardTypes ?? DEFAULT_CARD_TYPES
    const pushMode = (projectConfig?.pushMode ?? 'auto') as PushMode

    const closeDialog = useCallback(() => {
        onCloseDialog()
        setMissingWorkingFolder(null)
        projectSessionService.setError(null)
    }, [onCloseDialog])

    const loadRepositories = useCallback(async () => {
        try {
            setRepositories(await projectSessionService.listRepositories(accessToken))
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Repository list failed')
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
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Branch list failed')
        }
    }, [accessToken, project])

    useEffect(() => {
        const handleOpenProjectDialog = () => {
            onOpenDialog('open')
            if (isGithubAuthenticated) void loadRepositories()
        }

        window.addEventListener(OPEN_PROJECT_DIALOG_EVENT, handleOpenProjectDialog)

        return () => window.removeEventListener(OPEN_PROJECT_DIALOG_EVENT, handleOpenProjectDialog)
    }, [isGithubAuthenticated, loadRepositories, onOpenDialog])

    const openProjectDialog = () => {
        onOpenDialog('open')
        if (isGithubAuthenticated) void loadRepositories()
    }

    const openBranchDialog = () => {
        onOpenDialog('branch')
        void loadSwitchBranches()
    }

    const clearOpenDialogState = () => {
        setBranches(EMPTY_BRANCHES)
        setMissingWorkingFolder(null)
    }

    const loadRepositoryBranches = async (repository: RepositoryReference) => {
        try {
            const nextBranches = await projectSessionService.listBranches('github', repository, accessToken)
            setBranches(nextBranches)

            return nextBranches
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Branch list failed')
            setBranches(EMPTY_BRANCHES)

            return EMPTY_BRANCHES
        }
    }

    const chooseLocalFolder = async () => {
        if (!electronBridge) return null

        try {
            const nextProject = await electronBridge.openProjectFolder()
            if (!nextProject) return null

            const nextBranches = await projectSessionService.listBranches('local', nextProject, accessToken)
            setBranches(nextBranches)

            return { branches: nextBranches, project: nextProject }
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Local project selection failed')

            return null
        }
    }

    const loadManualBranches = async (owner: string, repositoryName: string) => {
        try {
            const result = await projectSessionService.findGithubRepositoryBranches(owner, repositoryName, accessToken)
            setBranches(result.branches)

            return result
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Manual repository branch list failed')

            return null
        }
    }

    const createRemoteProject = (rootPath: string, branch: string): ProjectReference => {
        if (rootPath.length === 0) throw new Error('Missing remote project root path')

        return { branch: branch || 'main', id: rootPath, rootPath }
    }

    const loadRemoteBranches = async (endpoint: string, token: string, rootPath: string, branch: string) => {
        try {
            projectSessionService.configureRemote(endpoint, token)
            const nextBranches = await projectSessionService.listBranches('remote', createRemoteProject(rootPath, branch), accessToken)
            setBranches(nextBranches)

            return nextBranches
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Remote branch list failed')
            setBranches(EMPTY_BRANCHES)

            return EMPTY_BRANCHES
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

            closeDialog()
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Project load failed')
        }
    }

    const openGithubProject = async (owner: string, repositoryName: string, branch: string) => {
        try {
            const result = await projectSessionService.findGithubRepositoryBranches(owner, repositoryName, accessToken)
            const fallbackBranches = branches.length > 0 ? branches : result.branches
            const selectedBranch = branch || branchValue(fallbackBranches, result.repository.branch)
            setBranches(fallbackBranches)
            await openProject('github', { ...result.repository, branch: selectedBranch })
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'GitHub project load failed')
        }
    }

    const openRemoteProject = async (endpoint: string, token: string, nextProject: ProjectReference) => {
        projectSessionService.configureRemote(endpoint, token)
        await openProject('remote', nextProject)
    }

    const openWorkingFolder = async (folder: TopLevelFolderReference) => {
        if (!missingWorkingFolder) return

        try {
            await projectSessionService.openWorkingFolder(missingWorkingFolder, folder, accessToken)
            closeDialog()
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Working folder selection failed')
        }
    }

    const createWorkingFolder = async () => {
        if (!missingWorkingFolder) return

        try {
            await projectSessionService.createWorkingFolder(missingWorkingFolder, accessToken)
            closeDialog()
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Working folder creation failed')
        }
    }

    const switchProjectBranch = async (branch: string) => {
        try {
            await projectSessionService.switchBranch(branch)
            closeDialog()
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Branch switch failed')
        }
    }

    const completeRelease = async (releaseName: string) => {
        setIsReleaseCompleting(true)
        try {
            await projectSessionService.completeRelease(releaseName)
            closeDialog()
        } catch (error) {
            projectSessionService.setError(error instanceof Error ? error.message : 'Release completion failed')
        } finally {
            setIsReleaseCompleting(false)
        }
    }

    const createCard = async (draft: CardDraft) => {
        await projectSessionService.createCard(draft)
        closeDialog()
    }

    return {
        activeCards,
        branches,
        cardTypes,
        chooseLocalFolder,
        clearOpenDialogState,
        closeDialog,
        completeRelease,
        createCard,
        createRemoteProject,
        createWorkingFolder,
        errorMessage: projectSession.errorMessage,
        isLoading: projectSession.isLoading,
        isLocalAvailable: !!electronBridge,
        isProjectOpen: !!project,
        isReleaseCompleting,
        loadManualBranches,
        loadRemoteBranches,
        loadRepositoryBranches,
        missingWorkingFolder,
        openBranchDialog,
        openGithubProject,
        openWorkingFolder,
        openLocalProject: (localProject: ProjectReference, branch: string) => openProject('local', { ...localProject, branch }),
        openProjectDialog,
        openRemoteProject,
        pendingGithubConflictProject: projectSession.pendingGithubConflictProject,
        push: () => projectSessionService.push(),
        pushMode,
        repositories,
        setSwitchBranch,
        switchBranch,
        switchProjectBranch,
    }
}
