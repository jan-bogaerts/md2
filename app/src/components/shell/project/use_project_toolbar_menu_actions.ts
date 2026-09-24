import { useCallback, useEffect, useState } from 'react'
import {
    DEFAULT_CARD_TYPES,
    DEFAULT_STATES,
    type BranchReference,
    type CardDraft,
    type ProjectReference,
    type ReleaseBranchCandidate,
} from '../../../data/data_types'
import { configService } from '../../../services/config/config_service'
import { projectSessionService, type ProjectOpenResolution } from '../../../services/project/project_session_service'
import { useActiveCardCount } from '../../hooks/use_active_card_count'
import { useConfigValueOrFallback } from '../../hooks/use_config_value'
import { useProjectConfig } from '../../hooks/use_project_config'
import { useProjectReference } from '../../hooks/use_project_reference'
import { useProjectSession } from '../../hooks/use_project_session'
import {
    OPEN_NEW_CARD_DIALOG_EVENT,
    OPEN_PROJECT_DIALOG_EVENT,
    type OpenNewCardDialogDetail,
    type OpenProjectDialogDetail,
    type ProjectDialogSource,
} from '../../project_command_events'

type ProjectDialogMode = 'open' | 'branch' | 'card' | 'release'

interface UseProjectToolbarMenuActionsArgs {
    accessToken: string | null
    initialProjectOpenResolution?: ProjectOpenResolution | null
    onCloseDialog: () => void
    onOpenDialog: (mode: ProjectDialogMode) => void
}

function branchValue(branches: BranchReference[], preferredBranch: string) {
    if (branches.some(({ name }) => name === preferredBranch)) return preferredBranch

    return branches[0]?.name ?? ''
}

/** Owns project menu commands outside the open-project dialog. */
export function useProjectToolbarMenuActions(args: UseProjectToolbarMenuActionsArgs) {
    const { accessToken, initialProjectOpenResolution = null, onCloseDialog, onOpenDialog } = args
    const project = useProjectReference()
    const activeCardCount = useActiveCardCount()
    const projectSession = useProjectSession()
    const projectConfig = useProjectConfig()
    const [branches, setBranches] = useState<BranchReference[]>([])
    const [isReleaseCompleting, setIsReleaseCompleting] = useState(false)
    const [projectOpenResolution, setProjectOpenResolution] = useState<ProjectOpenResolution | null>(initialProjectOpenResolution)
    const [initialProjectSource, setInitialProjectSource] = useState<ProjectDialogSource | null>(
        initialProjectOpenResolution?.storageType === 'remote' ? 'remote' : null,
    )
    const [initialRemoteProject, setInitialRemoteProject] = useState<ProjectReference | null>(
        initialProjectOpenResolution?.storageType === 'remote' ? initialProjectOpenResolution.project : null,
    )
    const [newCardInitialStatus, setNewCardInitialStatus] = useState('')
    const [releaseBranchCandidates, setReleaseBranchCandidates] = useState<ReleaseBranchCandidate[]>([])
    const [switchBranch, setSwitchBranch] = useState(project?.branch ?? '')
    const cardTypes = projectConfig?.cardTypes ?? DEFAULT_CARD_TYPES
    const states = projectConfig?.states ?? DEFAULT_STATES
    const releaseSelectAllDefault = useConfigValueOrFallback('project.deleteBranchesAfterRelease', false)

    const closeDialog = useCallback(() => {
        onCloseDialog()
        setProjectOpenResolution(null)
        projectSessionService.setError(null)
    }, [onCloseDialog])

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
        }

        window.addEventListener(OPEN_PROJECT_DIALOG_EVENT, handleOpenProjectDialog)

        return () => window.removeEventListener(OPEN_PROJECT_DIALOG_EVENT, handleOpenProjectDialog)
    }, [onOpenDialog])

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
        setProjectOpenResolution(null)
        onOpenDialog('open')
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

    const completeRelease = async (releaseName: string, selectedBranchNames: string[]) => {
        setIsReleaseCompleting(true)
        try {
            await projectSessionService.completeRelease(releaseName, selectedBranchNames)
            closeDialog()
        } catch {
            // ProjectSessionService emits the user-visible error.
        } finally {
            setIsReleaseCompleting(false)
        }
    }

    const setReleaseSelectAllDefault = (selected: boolean) => {
        void configService.setProjectPreference('project.deleteBranchesAfterRelease', selected)
    }

    const createCard = async (draft: CardDraft, initialState: string) => {
        await projectSessionService.createCard(draft, initialState)
    }

    return {
        activeCardCount,
        branches,
        cardTypes,
        closeDialog,
        completeRelease,
        createCard,
        initialProjectSource,
        initialRemoteProject,
        isLoading: projectSession.isLoading,
        isProjectOpen: !!project,
        isReleaseCompleting,
        loadSwitchBranches,
        newCardInitialStatus,
        openNewCardDialog,
        openProjectDialog,
        openReleaseDialog,
        projectOpenResolution,
        pull: () => projectSessionService.pull(),
        push: () => projectSessionService.push(),
        releaseBranchCandidates,
        releaseSelectAllDefault,
        setReleaseSelectAllDefault,
        setSwitchBranch,
        states,
        switchBranch,
        switchProjectBranch,
    }
}
