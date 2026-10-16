import type { BranchReference, ProjectReference, RepositoryReference } from '../../data/data_types'
import { unwrapBridgeResult } from '../../data/bridge_error_rehydration'
import { getElectronDataBridge } from '../../data/electron_data_bridge'
import {
    readRecentLocalRepositories,
    recordRecentLocalRepository,
    removeRecentLocalRepository,
} from '../../data/recent_local_repositories'
import { toProjectFolderRelativePath, toRepositoryRelativePath } from '../../data/repository_relative_path'
import type { StorageType } from '../../data/project_session'
import { dialogService } from '../dialog_service'
import { register } from '../service_injector'
import {
    projectSessionService,
    type ProjectFolderSetupResolution,
    type ProjectFolderValues,
    type ProjectOpenResolution,
} from './project_session_service'

export type ProjectOpenSource = 'local' | 'personal' | 'public'
export type ProjectOpenPhase = 'closed' | 'selecting' | 'loading' | 'folder-setup'

export type ProjectOpenRequest =
    | { source: 'local'; rootPath: string }
    | { source: 'personal' | 'public'; owner: string; repository: string; branch: string }

export interface ProjectOpenFlowState {
    phase: ProjectOpenPhase
    source: ProjectOpenSource | null
    resolution: ProjectOpenResolution | null
    folderValues: ProjectFolderValues | null
    branches: BranchReference[]
    repositories: RepositoryReference[]
    recentLocalRepositories: string[]
    isGithubAuthenticated: boolean
}

interface ProjectOpenEntry {
    source?: ProjectOpenSource | null
    resolution?: ProjectOpenResolution | null
}

function branchValue(branches: BranchReference[], preferredBranch: string) {
    if (branches.some(({ name }) => name === preferredBranch)) return preferredBranch

    return branches[0]?.name ?? ''
}

function folderSetupOf(resolution: ProjectOpenResolution | null): ProjectFolderSetupResolution | null {
    return resolution?.kind === 'project-folder-setup' && resolution.storageType !== 'github-readonly'
        ? resolution
        : null
}

/** Resolves a command-line folder to its local project; reports failures and returns null. */
async function resolveStartupProject(rootPath: string) {
    const bridge = getElectronDataBridge()
    if (!bridge) {
        dialogService.displayError('Local project bridge is unavailable')

        return null
    }
    try {
        return unwrapBridgeResult(await bridge.resolveProject({ branch: '', id: rootPath, rootPath }))
    } catch (error) {
        dialogService.error(error, { fallbackMessage: 'Could not open project folder' })

        return null
    }
}

export function isDesktopProjectMode() {
    return !!getElectronDataBridge()
}

export function canBrowseProjectFolders() {
    return !!getElectronDataBridge()?.selectProjectSubFolder
}

/** Owns the open-project workflow and its dialog-facing data across dialog mounts. */
export class ProjectOpenFlowService extends EventTarget {
    private accessToken: string | null = null
    private isGithubAuthenticated = false
    private pendingLocalRootPath: string | null = null
    private state: ProjectOpenFlowState = {
        phase: 'closed',
        source: null,
        resolution: null,
        folderValues: null,
        branches: [],
        repositories: [],
        recentLocalRepositories: [],
        isGithubAuthenticated: false,
    }

    getSnapshot() {
        return this.state
    }

    getValue<Field extends keyof ProjectOpenFlowState>(field: Field): ProjectOpenFlowState[Field] {
        return this.state[field]
    }

    getPhase() {
        return this.state.phase
    }

    setAuthentication(accessToken: string | null, isGithubAuthenticated: boolean) {
        const authenticationChanged = this.accessToken !== accessToken || this.isGithubAuthenticated !== isGithubAuthenticated
        this.accessToken = accessToken
        this.isGithubAuthenticated = isGithubAuthenticated
        if (authenticationChanged) this.update({ isGithubAuthenticated })
        if (authenticationChanged && this.state.phase === 'selecting' && isGithubAuthenticated) {
            void this.loadRepositories()
        }
    }

    show(entry: ProjectOpenEntry = {}) {
        const resolution = entry.resolution ?? null
        const folderSetup = folderSetupOf(resolution)
        this.pendingLocalRootPath = null
        this.update({
            phase: folderSetup ? 'folder-setup' : 'selecting',
            source: entry.source ?? null,
            resolution,
            folderValues: folderSetup?.values ?? null,
            branches: [],
            repositories: [],
            recentLocalRepositories: readRecentLocalRepositories(),
        })
        if (this.isGithubAuthenticated && !folderSetup) void this.loadRepositories()
    }

    close() {
        this.pendingLocalRootPath = null
        this.update({ phase: 'closed', resolution: null, folderValues: null })
        projectSessionService.setError(null)
    }

    setSource(source: ProjectOpenSource) {
        this.update({ source, branches: [], resolution: null })
    }

    setFolderValues(values: ProjectFolderValues) {
        this.update({ folderValues: values })
    }

    async loadRepositories() {
        try {
            const repositories = await projectSessionService.listRepositories(this.accessToken)
            if (this.state.phase === 'selecting') this.update({ repositories })
        } catch {
            if (this.state.phase === 'selecting') this.update({ repositories: [] })
        }
    }

    async loadRepositoryBranches(repository: RepositoryReference) {
        try {
            const branches = await projectSessionService.listBranches('github', repository, this.accessToken)
            this.update({ branches })

            return branchValue(branches, repository.branch)
        } catch {
            this.update({ branches: [] })

            return ''
        }
    }

    async loadManualBranches(owner: string, repository: string, isPublic: boolean) {
        try {
            const storageType = isPublic ? 'github-readonly' : 'github'
            const result = await projectSessionService.findGithubRepositoryBranches(
                owner, repository, this.accessToken, storageType,
            )
            this.update({ branches: result.branches })

            return { branch: branchValue(result.branches, result.repository.branch), repository: result.repository }
        } catch {
            this.update({ branches: [] })

            return null
        }
    }

    async chooseLocalFolder() {
        const bridge = getElectronDataBridge()
        if (!bridge) {
            dialogService.displayError('Local project folder selection is unavailable')

            return
        }

        try {
            const project = unwrapBridgeResult(await bridge.openProjectFolder())
            if (project) await this.openResolvedProject('local', project)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Local project selection failed' })
        }
    }

    async submit(request: ProjectOpenRequest) {
        if (request.source === 'local' && request.rootPath.trim().length === 0) {
            throw new Error('Local project root path is required')
        }
        if ((request.source === 'personal' || request.source === 'public') && (!request.owner || !request.repository)) {
            throw new Error('GitHub owner and repository are required')
        }

        this.update({ phase: 'loading' })
        if (request.source === 'local') {
            await this.openLocalPath(request.rootPath)

            return
        }
        try {
            const storageType = request.source === 'public' ? 'github-readonly' : 'github'
            const result = await projectSessionService.findGithubRepositoryBranches(
                request.owner, request.repository, this.accessToken, storageType,
            )
            const availableBranches = this.state.branches.length > 0 ? this.state.branches : result.branches
            const branch = request.branch || branchValue(availableBranches, result.repository.branch)
            await this.openResolvedProject(storageType, { ...result.repository, branch })
        } catch {
            // ProjectSessionService emits the user-visible error.
            this.update({ phase: 'closed' })
        }
    }

    async openRecentLocal(rootPath: string) {
        this.update({ phase: 'loading' })
        await this.openLocalPath(rootPath)
    }

    async removeRecentLocal(rootPath: string) {
        try {
            const recentLocalRepositories = await removeRecentLocalRepository(rootPath)
            this.update({ recentLocalRepositories })
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Recent local project removal failed' })
        }
    }

    async browseFolder(field: keyof ProjectFolderValues, values: ProjectFolderValues) {
        const rootPath = folderSetupOf(this.state.resolution)?.project.rootPath
        const bridge = getElectronDataBridge()
        if (!bridge?.selectProjectSubFolder || !rootPath) return null

        try {
            const pickedFolder = unwrapBridgeResult(await bridge.selectProjectSubFolder(rootPath))
            if (pickedFolder === null) return null

            const repositoryRelativePath = toRepositoryRelativePath(rootPath, pickedFolder)
            if (!repositoryRelativePath) {
                dialogService.displayError('Choose a folder inside the repository.')

                return null
            }
            if (field === 'projectFolder') return repositoryRelativePath

            const picked = toProjectFolderRelativePath(values.projectFolder, repositoryRelativePath)
            if (!picked) dialogService.displayError(`Choose a folder inside '${values.projectFolder}'.`)

            return picked
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Project folder selection failed' })

            return null
        }
    }

    async confirmFolders(values: ProjectFolderValues) {
        const resolution = folderSetupOf(this.state.resolution)
        if (!resolution) throw new Error('Project folder setup resolution is missing')

        this.update({ phase: 'loading', folderValues: values })
        try {
            await projectSessionService.confirmProjectFolderSetup(resolution, values, this.accessToken)
            await this.recordOpenedLocalProject()
            this.update({ phase: 'closed', resolution: null, folderValues: null })
        } catch {
            // ProjectSessionService emits the user-visible error.
            this.update({ phase: 'folder-setup' })
        }
    }

    /** Opens the folder passed on the command line; failures fall back to the local open dialog. */
    async openStartupProject(rootPath: string) {
        const project = await resolveStartupProject(rootPath)
        if (!project) {
            this.show({ source: 'local' })

            return
        }
        try {
            const resolution = await projectSessionService.openProject('local', project, null)
            this.pendingLocalRootPath = project.rootPath ?? null
            const folderSetup = folderSetupOf(resolution)
            if (folderSetup) {
                this.update({ phase: 'folder-setup', resolution: folderSetup, folderValues: folderSetup.values })

                return
            }
            await this.recordOpenedLocalProject()
        } catch {
            // ProjectSessionService emits the user-visible error.
            this.show({ source: 'local' })
        }
    }

    discardGithubPendingCommits(project: ProjectReference) {
        projectSessionService.discardGithubPendingCommits(project, this.accessToken)
    }

    private async openLocalPath(rootPath: string) {
        const bridge = getElectronDataBridge()
        if (!bridge || rootPath.trim().length === 0) {
            dialogService.displayError(!bridge ? 'Local project bridge is unavailable' : 'Local project root path is required')
            this.update({ phase: 'closed' })

            return
        }
        try {
            const normalizedPath = rootPath.trim()
            const project = unwrapBridgeResult(await bridge.resolveProject({ branch: '', id: normalizedPath, rootPath: normalizedPath }))
            await this.openResolvedProject('local', project)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Local project selection failed' })
            this.update({ phase: 'closed' })
        }
    }

    private async openResolvedProject(storageType: StorageType, project: ProjectReference) {
        this.update({ phase: 'loading' })
        try {
            const resolution = await projectSessionService.openProject(storageType, project, this.accessToken)
            if (resolution) {
                const folderSetup = folderSetupOf(resolution)
                this.pendingLocalRootPath = storageType === 'local' ? project.rootPath ?? null : null
                this.update({
                    phase: folderSetup ? 'folder-setup' : 'selecting',
                    resolution,
                    folderValues: folderSetup?.values ?? null,
                })

                return
            }
            if (storageType === 'local') {
                this.pendingLocalRootPath = project.rootPath ?? null
                await this.recordOpenedLocalProject()
            }
            this.update({ phase: 'closed', resolution: null })
        } catch {
            // ProjectSessionService emits the user-visible error.
            this.update({ phase: 'closed' })
        }
    }

    private async recordOpenedLocalProject() {
        if (!this.pendingLocalRootPath) return

        const rootPath = this.pendingLocalRootPath
        this.pendingLocalRootPath = null
        try {
            const recentLocalRepositories = await recordRecentLocalRepository(rootPath)
            this.update({ recentLocalRepositories })
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Recent local project recording failed' })
        }
    }

    private update(changes: Partial<ProjectOpenFlowState>) {
        const changedFields = (Object.keys(changes) as Array<keyof ProjectOpenFlowState>)
            .filter((field) => this.state[field] !== changes[field])
        if (changedFields.length === 0) return

        this.state = { ...this.state, ...changes }
        changedFields.forEach((field) => this.dispatchEvent(new Event(field)))
    }
}

export const projectOpenFlowService = register('projectOpenFlowService', new ProjectOpenFlowService())
