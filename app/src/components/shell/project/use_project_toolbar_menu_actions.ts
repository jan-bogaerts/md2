import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    DEFAULT_CARD_BODY_TEMPLATE,
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
import { dialogService } from '../../../services/dialog_service'
import { projectSessionService, type ProjectOpenResolution } from '../../../services/project/project_session_service'
import { useProjectConfig } from '../../hooks/use_project_config'
import { useProjectSession } from '../../hooks/use_project_session'
import { useProjectState } from '../../hooks/use_project_state'
import { OPEN_NEW_CARD_DIALOG_EVENT, OPEN_PROJECT_DIALOG_EVENT, type OpenProjectDialogDetail, type ProjectDialogSource } from '../../project_command_events'

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
    const [projectOpenResolution, setProjectOpenResolution] = useState<ProjectOpenResolution | null>(null)
    const [initialProjectSource, setInitialProjectSource] = useState<ProjectDialogSource | null>(null)
    const [initialRemoteProject, setInitialRemoteProject] = useState<ProjectReference | null>(null)
    const [repositories, setRepositories] = useState<RepositoryReference[]>(EMPTY_REPOSITORIES)
    const [switchBranch, setSwitchBranch] = useState(project?.branch ?? '')
    const activeCards = snapshot?.activeCards ?? []
    const cardTypes = projectConfig?.cardTypes ?? DEFAULT_CARD_TYPES
    const cardBodyTemplate = projectConfig?.cardBodyTemplate ?? DEFAULT_CARD_BODY_TEMPLATE
    const pushMode = (projectConfig?.pushMode ?? 'auto') as PushMode

    const closeDialog = useCallback(() => {
        onCloseDialog()
        setProjectOpenResolution(null)
        projectSessionService.setError(null)
    }, [onCloseDialog])

    const openProject = useCallback(async (storageType: StorageType, nextProject: ProjectReference) => {
        setProjectOpenResolution(null)

        try {
            const resolution = await projectSessionService.openProject(storageType, nextProject, accessToken)
            if (resolution) {
                setProjectOpenResolution(resolution)
                onOpenDialog('open')

                return
            }

            closeDialog()
        } catch {
            // ProjectSessionService emits the user-visible error.
        }
    }, [accessToken, closeDialog, onOpenDialog])

    const openElectronProject = useCallback(async () => {
        if (!electronBridge) return

        let nextProject: ProjectReference | null
        try {
            nextProject = await electronBridge.openProjectFolder()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Local project selection failed' })

            return
        }

        if (nextProject) await openProject('local', nextProject)
    }, [electronBridge, openProject])

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
            if (electronBridge) {
                void openElectronProject()
                return
            }

            const detail = (event as CustomEvent<OpenProjectDialogDetail>).detail
            setInitialProjectSource(detail?.source ?? null)
            setInitialRemoteProject(detail?.project ?? null)
            setProjectOpenResolution(detail?.resolution ?? null)
            onOpenDialog('open')
            if (isGithubAuthenticated) void loadRepositories()
        }

        window.addEventListener(OPEN_PROJECT_DIALOG_EVENT, handleOpenProjectDialog)

        return () => window.removeEventListener(OPEN_PROJECT_DIALOG_EVENT, handleOpenProjectDialog)
    }, [electronBridge, isGithubAuthenticated, loadRepositories, onOpenDialog, openElectronProject])

    useEffect(() => {
        const handleOpenNewCardDialog = () => {
            if (project) onOpenDialog('card')
        }

        window.addEventListener(OPEN_NEW_CARD_DIALOG_EVENT, handleOpenNewCardDialog)

        return () => window.removeEventListener(OPEN_NEW_CARD_DIALOG_EVENT, handleOpenNewCardDialog)
    }, [onOpenDialog, project])

    const openProjectDialog = () => {
        if (electronBridge) {
            void openElectronProject()
            return
        }

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

    const loadManualBranches = async (owner: string, repositoryName: string) => {
        try {
            const result = await projectSessionService.findGithubRepositoryBranches(owner, repositoryName, accessToken)
            setBranches(result.branches)

            return result
        } catch {
            return null
        }
    }

    const createRemoteProject = (rootPath: string, branch: string): ProjectReference => {
        if (rootPath.length === 0) throw new Error('Missing remote project root path')

        return { branch: branch || 'main', id: rootPath, rootPath }
    }

    const loadRemoteBranches = async (endpoint: string, token: string, rootPath: string, branch: string) => {
        let remoteProject: ProjectReference
        try {
            remoteProject = createRemoteProject(rootPath, branch)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Remote branch list failed' })
            setBranches(EMPTY_BRANCHES)

            return EMPTY_BRANCHES
        }

        projectSessionService.configureRemote(endpoint, token)

        try {
            const nextBranches = await projectSessionService.listBranches('remote', remoteProject, accessToken)
            setBranches(nextBranches)

            return nextBranches
        } catch {
            setBranches(EMPTY_BRANCHES)

            return EMPTY_BRANCHES
        }
    }

    const openGithubProject = async (owner: string, repositoryName: string, branch: string) => {
        try {
            const result = await projectSessionService.findGithubRepositoryBranches(owner, repositoryName, accessToken)
            const fallbackBranches = branches.length > 0 ? branches : result.branches
            const selectedBranch = branch || branchValue(fallbackBranches, result.repository.branch)
            setBranches(fallbackBranches)
            await openProject('github', { ...result.repository, branch: selectedBranch })
        } catch {
            // ProjectSessionService emits the user-visible error.
        }
    }

    const openRemoteProject = async (endpoint: string, token: string, nextProject: ProjectReference) => {
        projectSessionService.configureRemote(endpoint, token)
        await openProject('remote', nextProject)
    }

    const openWorkingFolder = async (folder: TopLevelFolderReference) => {
        if (projectOpenResolution?.kind !== 'missing-working-folder') return

        try {
            await projectSessionService.openWorkingFolder(projectOpenResolution, folder, accessToken)
            closeDialog()
        } catch {
            // ProjectSessionService emits the user-visible error.
        }
    }

    const createWorkingFolder = async () => {
        if (projectOpenResolution?.kind !== 'missing-working-folder') return

        try {
            await projectSessionService.createWorkingFolder(projectOpenResolution, accessToken)
            closeDialog()
        } catch {
            // ProjectSessionService emits the user-visible error.
        }
    }

    const createProjectFolders = async (projectFolder: string) => {
        if (projectOpenResolution?.kind !== 'project-folder-setup') return

        try {
            await projectSessionService.createProjectFolders(projectOpenResolution, projectFolder, accessToken)
            closeDialog()
        } catch {
            // ProjectSessionService emits the user-visible error.
        }
    }

    const switchProjectBranch = async (branch: string) => {
        try {
            await projectSessionService.switchBranch(branch)
            closeDialog()
        } catch {
            // ProjectSessionService emits the user-visible error.
        }
    }

    const completeRelease = async (releaseName: string) => {
        setIsReleaseCompleting(true)
        try {
            await projectSessionService.completeRelease(releaseName)
            closeDialog()
        } catch {
            // ProjectSessionService emits the user-visible error.
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
        cardBodyTemplate,
        cardTypes,
        clearOpenDialogState,
        closeDialog,
        completeRelease,
        initialProjectSource,
        initialRemoteProject,
        createCard,
        createProjectFolders,
        createRemoteProject,
        createWorkingFolder,
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
        openWorkingFolder,
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
