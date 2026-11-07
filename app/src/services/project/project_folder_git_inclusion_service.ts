import type { ConfigValues } from '../config/config_entries'
import { configService } from '../config/config_service'
import { dataService } from '../data/data_service'
import { register } from '../service_injector'

export const PROJECT_FOLDER_GIT_REMOVAL_CHANGED_EVENT = 'removalConfirmationChanged'

/** Whether a config draft changes the Git inclusion or moves a project folder that is kept out of Git. */
export function hasProjectFolderGitInclusionDraftChange(draft: ConfigValues) {
    if (!dataService.projectLoading.supportsLocalOnlyProjectFolder()) return false

    const included = draft['project.includeProjectFolderInGit']
    if (included !== configService.get('project.includeProjectFolderInGit')) return true

    return !included && draft['project.projectFolder'] !== configService.get('project.projectFolder')
}

interface RemovalConfirmation {
    projectFolder: string
    resolve: (confirmed: boolean) => void
}

/**
 * Owns switching the project folder between committed and local-only, including the blocking
 * confirmation shown before tracked project-folder files are removed from the Git index.
 */
export class ProjectFolderGitInclusionService extends EventTarget {
    private activeConfirmation: RemovalConfirmation | null = null

    constructor() {
        super()
        register('projectFolderGitInclusionService', this)
    }

    /** Project folder awaiting removal confirmation, or null when no confirmation is open. */
    getPendingProjectFolder() {
        return this.activeConfirmation?.projectFolder ?? null
    }

    /** Opens the confirmation; resolves true when the user accepts removing tracked files from the Git index. */
    requestRemovalConfirmation(projectFolder: string) {
        if (this.activeConfirmation) throw new Error('A project folder Git removal confirmation is already open')

        const confirmation = new Promise<boolean>((resolve) => {
            this.activeConfirmation = { projectFolder, resolve }
        })
        this.dispatchEvent(new Event(PROJECT_FOLDER_GIT_REMOVAL_CHANGED_EVENT))

        return confirmation
    }

    confirmRemoval() {
        this.finishConfirmation(true)
    }

    cancelRemoval() {
        this.finishConfirmation(false)
    }

    /**
     * Persists the draft's Git inclusion before the rest of the draft is saved.
     * Cancelling the confirmation restores the draft's inclusion and project folder to their saved values.
     */
    async applyDraft(draft: ConfigValues) {
        const included = draft['project.includeProjectFolderInGit']
        const projectFolder = draft['project.projectFolder']
        const savedIncluded = configService.get('project.includeProjectFolderInGit')
        const savedProjectFolder = configService.get('project.projectFolder')
        const removeTrackedFiles = !included && await dataService.projectLoading.hasTrackedProjectFolderFiles(projectFolder)
        if (removeTrackedFiles && !await this.requestRemovalConfirmation(projectFolder)) {
            configService.setDraftValue('project.includeProjectFolderInGit', savedIncluded)
            configService.setDraftValue('project.projectFolder', savedProjectFolder)
            return
        }

        await configService.setProjectFolderGitInclusion(projectFolder, included, removeTrackedFiles)
    }

    private finishConfirmation(confirmed: boolean) {
        const activeConfirmation = this.activeConfirmation
        if (!activeConfirmation) return

        this.activeConfirmation = null
        this.dispatchEvent(new Event(PROJECT_FOLDER_GIT_REMOVAL_CHANGED_EVENT))
        activeConfirmation.resolve(confirmed)
    }
}

export const projectFolderGitInclusionService = new ProjectFolderGitInclusionService()
