import {
    DEFAULT_PROJECT_CONFIG,
    type ProjectConfig,
    isMissingWorkingFolderError,
    resolveProjectConfigPaths,
    type BranchReference,
    type CardDraft,
    type ProjectReference,
    type RepositoryReference,
    type StorageService,
    type TopLevelFolderReference,
} from '../../data/data_types'
import { deriveStatesFromCards, mergeStatesWithDefaults } from '../../data/card_ordering'
import { createStorageService, readLastProject, writeLastProject, type StorageType } from '../../data/project_session'
import { activateStorageService } from '../../data/project_storage_activation'
import { configureRemoteControlConnection } from '../../data/remote_control_connection'
import { configService } from '../config/config_service'
import { dataService } from '../data/data_service'
import { remoteConnectionService } from '../data/remote_connection_service'
import { RemoteControlStorageService } from '../data/remote_control_storage_service'
import { dialogService } from '../dialog_service'
import { GithubPendingCommitConflictError, GithubStorageService } from '../github/github_storage_service'
import { markdownParsingService } from '../data/markdown_parsing_service'
import { register } from '../service_injector'
import { MarkdownDraft } from '../markdown/markdown_draft'
import { createRandomProjectBackgroundShade } from '../../theme/project_background_shade'
import { isProjectLoadErrorReported } from './project_loading'
import { projectPersistenceService } from './project_persistence_service'
import { projectAccessService } from './project_access_service'
import { createDefaultActionFiles } from '../../project_template/project_template'

/** Configurable folders edited by setup; sub-folders are relative to `projectFolder`. */
export interface ProjectFolderValues {
    actionsFolder: string
    archivedFolder: string
    diagramsFolder: string
    projectFolder: string
    releasesFolder: string
    workingFolder: string
}

/**
 * Everything the folder-setup dialog needs, for both situations it covers: a project without an
 * `md2.config.json` at all, and a configured project whose working folder is missing on disk.
 * The two differ only in which values are pre-filled and whether an existing config is amended.
 */
export interface ProjectFolderSetupResolution {
    existingFolderPaths: string[]
    folders: TopLevelFolderReference[]
    hasProjectConfig: boolean
    kind: 'project-folder-setup'
    project: ProjectReference
    storageType: StorageType
    values: ProjectFolderValues
}

export type ProjectOpenResolution = ProjectFolderSetupResolution

export interface ProjectSessionState {
    errorMessage: string | null
    isCommitting: boolean
    isLoading: boolean
    isPulling: boolean
    isPushing: boolean
    pendingGithubConflictProject: ProjectReference | null
}

export interface CardCreationState {
    isCreatingCard: boolean
}

const EMPTY_TOP_LEVEL_FOLDERS: TopLevelFolderReference[] = []

function createGithubStorage(accessToken: string | null, isReadOnly = false) {
    const storage = new GithubStorageService(isReadOnly)
    storage.init({ accessToken: accessToken ?? '' })

    return storage
}

/** Derives card states from the working folder when the stored config never declared any. */
async function withDerivedStates(storage: StorageService, project: ProjectReference, config: ProjectConfig, hasStoredStates: boolean) {
    if (hasStoredStates) return config

    const resolvedConfig = resolveProjectConfigPaths(config)
    const projectFiles = await storage.loadProjectRoot(project, resolvedConfig.workingFolder)
    const { activeCards } = markdownParsingService.splitCards(projectFiles.files, resolvedConfig.workingFolder)

    return { ...config, states: mergeStatesWithDefaults(deriveStatesFromCards(activeCards)) }
}

function normalizeFolderValue(folderPath: string) {
    return folderPath.trim().replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
}

function isAbsoluteFolderValue(folderPath: string) {
    const normalizedFolder = folderPath.trim().replace(/\\/gu, '/')

    return normalizedFolder.startsWith('/') || /^[A-Za-z]:/u.test(normalizedFolder)
}

export function requireProjectFolder(projectFolder: string) {
    if (isAbsoluteFolderValue(projectFolder)) throw new Error('Project folder must be a root folder name')

    const normalizedFolder = normalizeFolderValue(projectFolder)
    if (normalizedFolder.length === 0) throw new Error('Project folder is required')
    if (normalizedFolder === '.' || normalizedFolder === '..' || normalizedFolder.includes('/')) {
        throw new Error('Project folder must be a root folder name')
    }

    return normalizedFolder
}

/** Rejects empty sub-folder values and any path that would escape the repository root. */
export function requireSubFolder(label: string, folderPath: string) {
    if (isAbsoluteFolderValue(folderPath)) throw new Error(`${label} must stay inside the project folder`)

    const normalizedFolder = normalizeFolderValue(folderPath)
    if (normalizedFolder.length === 0) throw new Error(`${label} is required`)
    if (normalizedFolder.split('/').some((segment) => segment === '.' || segment === '..' || segment.length === 0)) {
        throw new Error(`${label} must stay inside the project folder`)
    }

    return normalizedFolder
}

/** Validates all five folder values together, as the setup dialog submits them. */
export function requireProjectFolderValues(values: ProjectFolderValues): ProjectFolderValues {
    return {
        actionsFolder: requireSubFolder('Actions folder', values.actionsFolder),
        archivedFolder: requireSubFolder('Archived folder', values.archivedFolder),
        diagramsFolder: requireSubFolder('Diagrams folder', values.diagramsFolder),
        projectFolder: requireProjectFolder(values.projectFolder),
        releasesFolder: requireSubFolder('Releases folder', values.releasesFolder),
        workingFolder: requireSubFolder('Working folder', values.workingFolder),
    }
}

/** Resolved sub-folder paths, in the order the setup dialog lists them. */
export function resolvedSetupFolders(config: ProjectConfig) {
    const resolvedConfig = resolveProjectConfigPaths(config)

    return [
        resolvedConfig.workingFolder,
        resolvedConfig.archivedFolder,
        resolvedConfig.actionsFolder,
        resolvedConfig.releasesFolder,
        resolvedConfig.diagramsFolder,
    ]
}

/** Folder paths represented by repository files. */
function folderPathsOf(files: string[]) {
    const folderPaths = new Set<string>()
    for (const filePath of files) {
        const segments = filePath.split('/')
        segments.pop()
        let currentPath = ''
        for (const segment of segments) {
            currentPath = currentPath.length === 0 ? segment : `${currentPath}/${segment}`
            folderPaths.add(currentPath)
        }
    }

    return [...folderPaths].sort((left, right) => left.localeCompare(right))
}

async function listExistingFolderPaths(storage: StorageService, project: ProjectReference) {
    try {
        return folderPathsOf(await storage.listRepositoryFiles(project))
    } catch {
        return []
    }
}

export function folderValuesOf(config: ProjectConfig): ProjectFolderValues {
    return {
        actionsFolder: config.actionsFolder,
        archivedFolder: config.archivedFolder,
        diagramsFolder: config.diagramsFolder,
        projectFolder: config.projectFolder,
        releasesFolder: config.releasesFolder,
        workingFolder: config.workingFolder,
    }
}

async function listTopLevelFolders(storage: StorageService, project: ProjectReference) {
    try {
        return await storage.listTopLevelFolders(project)
    } catch {
        return EMPTY_TOP_LEVEL_FOLDERS
    }
}

async function createFolderSetupResolution(
    storage: StorageService,
    storageType: StorageType,
    project: ProjectReference,
    hasProjectConfig: boolean,
): Promise<ProjectFolderSetupResolution> {
    const [folders, existingFolderPaths] = await Promise.all([
        listTopLevelFolders(storage, project),
        listExistingFolderPaths(storage, project),
    ])

    return {
        existingFolderPaths,
        folders,
        hasProjectConfig,
        kind: 'project-folder-setup',
        project,
        storageType,
        values: folderValuesOf(hasProjectConfig ? configService.getProjectConfig() : DEFAULT_PROJECT_CONFIG),
    }
}

async function loadProjectSession(
    storage: StorageService,
    storageType: StorageType,
    project: ProjectReference,
    onActivated: () => void,
) {
    try {
        await activateProjectSession(storage, storageType, project)
        onActivated()

        return null
    } catch (error) {
        if (!isMissingWorkingFolderError(error)) throw error

        return createFolderSetupResolution(storage, storageType, project, true)
    }
}

async function activateProjectSession(storage: StorageService, storageType: StorageType, project: ProjectReference) {
    await projectPersistenceService.flushPendingChanges()
    projectAccessService.setReadOnly(storageType === 'github-readonly')
    const activeStorage = await activateStorageService(storageType, storage)
    dataService.init({ storage: activeStorage })
    await dataService.projectLoading.openProject(project)
    remoteConnectionService.setProjectStorageActive(storageType === 'remote')
    writeLastProject(storageType, project)
}

async function resolveRestoredProject(storageType: StorageType, storage: StorageService, project: ProjectReference) {
    if (storageType === 'remote') {
        if (!(storage instanceof RemoteControlStorageService)) throw new Error('Remote project lookup is not available')

        await activateStorageService('remote', storage)

        return await storage.getActiveProject() ?? project
    }
    if (storageType === 'local') {
        if (!storage.resolveProject) throw new Error('Local project validation is not available')

        return storage.resolveProject(project)
    }

    return project
}

export class ProjectSessionService extends EventTarget {
    private cardCreationState: CardCreationState = { isCreatingCard: false }
    private readonly newCardAttachmentPaths = new Set<string>()
    private readonly newCardAttachmentSaves = new Set<Promise<unknown>>()
    private readonly newCardImageSaves = new Set<Promise<void>>()
    private readonly newCardImagePaths = new Set<string>()
    readonly newCardMarkdownDraft = new MarkdownDraft('')
    private readonly projectAccess = projectAccessService
    private state: ProjectSessionState = {
        errorMessage: null,
        isCommitting: false,
        isLoading: false,
        isPulling: false,
        isPushing: false,
        pendingGithubConflictProject: null,
    }

    constructor() {
        super()
        register('projectSessionService', this)
    }

    getSnapshot(): ProjectSessionState {
        return this.state
    }

    getCardCreationSnapshot(): CardCreationState {
        return this.cardCreationState
    }

    get isReadOnly() {
        return this.projectAccess.getSnapshot()
    }

    hasNewCardDraftImages() {
        return this.hasNewCardDraftAssets()
    }

    hasNewCardDraftAssets() {
        return this.newCardAttachmentPaths.size > 0
            || this.newCardAttachmentSaves.size > 0
            || this.newCardImagePaths.size > 0
            || this.newCardImageSaves.size > 0
    }

    async pasteNewCardImage(file: File, insertMarkdown: (markdown: string) => void) {
        const operation = this.saveAndInsertNewCardImage(file, insertMarkdown)
        this.newCardImageSaves.add(operation)
        try {
            await operation
        } finally {
            this.newCardImageSaves.delete(operation)
        }
    }

    async waitForNewCardImageSaves() {
        await this.waitForNewCardAssetSaves()
    }

    async copyNewCardAttachments(files: File[]) {
        const operation = dataService.cards.copyAttachmentsForNewCard(files)
        this.newCardAttachmentSaves.add(operation)
        try {
            const attachments = await operation
            attachments.forEach(({ path }) => this.newCardAttachmentPaths.add(path))

            return attachments
        } finally {
            this.newCardAttachmentSaves.delete(operation)
        }
    }

    async deleteNewCardDraftAttachments(paths: string[]) {
        for (const path of paths) {
            await dataService.cards.deleteCopiedAttachments([path])
            this.newCardAttachmentPaths.delete(path)
        }
    }

    async waitForNewCardAssetSaves() {
        while (this.newCardAttachmentSaves.size > 0 || this.newCardImageSaves.size > 0) {
            await Promise.allSettled([...this.newCardAttachmentSaves, ...this.newCardImageSaves])
        }
    }

    async discardNewCardDraftImages() {
        await this.discardNewCardDraftAssets()
    }

    async discardNewCardDraftAssets() {
        await this.waitForNewCardAssetSaves()
        let deletionError: unknown = null
        for (const path of [...this.newCardImagePaths]) {
            try {
                await dataService.cards.deletePastedImage(path)
                this.newCardImagePaths.delete(path)
            } catch (error) {
                deletionError ??= error
            }
        }
        for (const path of [...this.newCardAttachmentPaths]) {
            try {
                await dataService.cards.deleteCopiedAttachments([path])
                this.newCardAttachmentPaths.delete(path)
            } catch (error) {
                deletionError ??= error
            }
        }
        if (deletionError) throw deletionError
    }

    setError(message: string | null) {
        this.state = { ...this.state, errorMessage: message, pendingGithubConflictProject: null }
        this.dispatchChanged()
    }

    /**
     * Restore last project through the same resolution-returning path used by explicit project
     * opens, so a missing folder opens the folder-setup dialog instead of failing startup.
     */
    async restoreLastProject(accessToken: string | null): Promise<ProjectOpenResolution | null> {
        this.setError(null)
        const lastProject = readLastProject()
        if (!lastProject) return null
        if ((lastProject.storageType === 'github' || lastProject.storageType === 'github-readonly') && !accessToken) return null

        const storage = createStorageService(lastProject.storageType, accessToken)
        const project = await resolveRestoredProject(lastProject.storageType, storage, lastProject.project)

        return this.openProject(lastProject.storageType, project, accessToken, storage)
    }

    async listRepositories(accessToken: string | null): Promise<RepositoryReference[]> {
        return this.withLoading('Repository list failed', async () => createGithubStorage(accessToken).listRepositories())
    }

    async listBranches(storageType: StorageType, project: ProjectReference, accessToken: string | null): Promise<BranchReference[]> {
        return this.withLoading('Branch list failed', async () => {
            const storage = createStorageService(storageType, accessToken)

            return storage.listBranches(project)
        })
    }

    async findGithubRepositoryBranches(
        owner: string,
        repositoryName: string,
        accessToken: string | null,
        storageType: 'github' | 'github-readonly' = 'github',
    ) {
        return this.withLoading('Manual repository branch list failed', async () => {
            const storage = createGithubStorage(accessToken, storageType === 'github-readonly')
            const repository = await storage.findRepository(owner, repositoryName)
            const branches = await storage.listBranches(repository)

            return { branches, repository }
        })
    }

    async openProject(
        storageType: StorageType,
        project: ProjectReference,
        accessToken: string | null,
        existingStorage?: StorageService,
    ): Promise<ProjectOpenResolution | null> {
        return this.withLoading('Project load failed', async () => {
            const storage = existingStorage ?? createStorageService(storageType, accessToken)
            if (storageType === 'github-readonly') {
                return loadProjectSession(storage, storageType, project, () => this.setReadOnly(true))
            }
            if (storageType === 'github' || storageType === 'local') {
                const projectConfig = await storage.loadProjectConfig(project)
                if (projectConfig !== null) {
                    return loadProjectSession(
                        storage,
                        storageType,
                        project,
                        () => this.setReadOnly(false),
                    )
                }

                this.setReadOnly(false)

                return createFolderSetupResolution(storage, storageType, project, false)
            }

            return loadProjectSession(storage, storageType, project, () => this.setReadOnly(false))
        })
    }

    /**
     * Single confirm path for the folder-setup dialog: creates every folder that is still missing,
     * seeds the default action files, writes the five values to the project config and opens the
     * project. Folders that already exist are left untouched.
     */
    async confirmProjectFolderSetup(
        resolution: ProjectFolderSetupResolution,
        values: ProjectFolderValues,
        accessToken: string | null,
    ) {
        projectAccessService.requireWritable()
        await this.withLoading('Project folder setup failed', async () => {
            const storage = createStorageService(resolution.storageType, accessToken)
            const folderValues = requireProjectFolderValues(values)
            const storedConfig = resolution.hasProjectConfig ? await storage.loadProjectConfig(resolution.project) : null
            const baseConfig = {
                ...DEFAULT_PROJECT_CONFIG,
                ...(storedConfig ?? { backgroundShade: createRandomProjectBackgroundShade() }),
            }
            const projectConfig: ProjectConfig = { ...baseConfig, ...folderValues }
            const resolvedConfig = resolveProjectConfigPaths(projectConfig)
            const existingFilePaths = new Set(await storage.listRepositoryFiles(resolution.project))
            const existingFolders = new Set(folderPathsOf([...existingFilePaths]))
            const missingFolders = resolvedSetupFolders(projectConfig).filter((folder) => !existingFolders.has(folder))
            const project = await storage.createProject(resolution.project, missingFolders)
            const defaultActionFiles = createDefaultActionFiles(resolvedConfig.actionsFolder)
                .filter(({ path }) => !existingFilePaths.has(path))

            if (defaultActionFiles.length > 0) {
                await storage.commit({
                    branch: project.branch,
                    files: defaultActionFiles,
                    message: 'Add default MD² actions',
                })
            }

            const nextConfig = await withDerivedStates(storage, project, projectConfig, storedConfig?.states !== undefined)
            configService.loadProjectConfig(nextConfig)
            await storage.saveProjectConfig(project, nextConfig)
            await activateProjectSession(storage, resolution.storageType, project)
            this.setReadOnly(false)
        })
    }

    configureRemote(endpoint: string) {
        this.setError(null)
        configureRemoteControlConnection({ endpoint })
    }

    async activateRemoteConnection(storage: StorageService) {
        await this.withLoading('Remote desktop config load failed', async () => {
            await activateStorageService('remote', storage)
        })
    }

    async switchBranch(branch: string) {
        await this.withLoading('Branch switch failed', () => dataService.projectLoading.switchBranch(branch))
    }

    async push() {
        projectAccessService.requireWritable()
        this.state = { ...this.state, isPushing: true }
        this.dispatchChanged()

        try {
            await this.withLoading('Push failed', async () => {
                await projectPersistenceService.flushPendingChanges()
                await dataService.projectLoading.push()
            })
        } finally {
            this.state = { ...this.state, isPushing: false }
            this.dispatchChanged()
        }
    }

    async commit() {
        projectAccessService.requireWritable()
        this.state = { ...this.state, isCommitting: true }
        this.dispatchChanged()

        try {
            await this.withLoading('Commit failed', () => projectPersistenceService.flushPendingChanges())
        } finally {
            this.state = { ...this.state, isCommitting: false }
            this.dispatchChanged()
        }
    }

    async pull() {
        projectAccessService.requireWritable()
        this.state = { ...this.state, isPulling: true }
        this.dispatchChanged()

        try {
            await this.withLoading('Pull failed', () => dataService.projectLoading.pull())
        } finally {
            this.state = { ...this.state, isPulling: false }
            this.dispatchChanged()
        }
    }

    discardGithubPendingCommits(project: ProjectReference, accessToken: string | null) {
        projectAccessService.requireWritable()
        const storage = createGithubStorage(accessToken)
        storage.discardPendingCommits(project)
        this.state = { ...this.state, errorMessage: null, pendingGithubConflictProject: null }
        this.dispatchChanged()
    }

    async getReleaseBranchCandidates() {
        return this.withLoading('Release preparation failed', () => dataService.releases.getReleaseBranchCandidates())
    }

    async completeRelease(releaseName: string, selectedBranchNames: string[], includeProjectActivity = false) {
        projectAccessService.requireWritable()
        await this.withLoading(
            'Release completion failed',
            () => dataService.releases.completeRelease(releaseName, selectedBranchNames, includeProjectActivity),
        )
    }

    async createCard(draft: CardDraft, initialState: string) {
        projectAccessService.requireWritable()
        this.setCardCreationState(true)
        if (this.state.errorMessage !== null) this.setError(null)

        try {
            await this.waitForNewCardImageSaves()
            await dataService.cards.createCard(draft, initialState)
            this.newCardAttachmentPaths.clear()
            this.newCardImagePaths.clear()
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Card creation failed'
            this.state = { ...this.state, errorMessage: message, pendingGithubConflictProject: null }
            this.dispatchChanged()
            if (!isProjectLoadErrorReported(error)) dialogService.error(error, { fallbackMessage: 'Card creation failed' })
            throw error
        } finally {
            this.setCardCreationState(false)
        }
    }

    private setCardCreationState(isCreatingCard: boolean) {
        if (this.cardCreationState.isCreatingCard === isCreatingCard) return

        this.cardCreationState = { isCreatingCard }
        this.dispatchEvent(new CustomEvent<CardCreationState>('cardCreationChanged', { detail: this.cardCreationState }))
    }

    private async saveAndInsertNewCardImage(file: File, insertMarkdown: (markdown: string) => void) {
        const savedImage = await dataService.cards.savePastedImageForNewCard(file)
        this.newCardImagePaths.add(savedImage.path)
        try {
            insertMarkdown(`![pasted image](<${savedImage.fileName}>)`)
        } catch (error) {
            try {
                await dataService.cards.deletePastedImage(savedImage.path)
                this.newCardImagePaths.delete(savedImage.path)
            } catch (cleanupError) {
                dialogService.error(cleanupError, { fallbackMessage: `Could not remove ${savedImage.path}` })
            }
            throw error
        }
    }

    private setReadOnly(isReadOnly: boolean) {
        this.projectAccess.setReadOnly(isReadOnly)
    }

    private async withLoading<T>(fallbackMessage: string, operation: () => Promise<T>): Promise<T> {
        this.state = { ...this.state, errorMessage: null, isLoading: true, pendingGithubConflictProject: null }
        this.dispatchChanged()

        try {
            return await operation()
        } catch (error) {
            const message = error instanceof Error ? error.message : fallbackMessage
            this.state = {
                ...this.state,
                errorMessage: message,
                isLoading: false,
                pendingGithubConflictProject: error instanceof GithubPendingCommitConflictError ? error.project : null,
            }
            this.dispatchChanged()
            if (!isProjectLoadErrorReported(error)) dialogService.error(error, { fallbackMessage })
            throw error
        } finally {
            if (this.state.isLoading) {
                this.state = { ...this.state, isLoading: false }
                this.dispatchChanged()
            }
        }
    }

    private dispatchChanged() {
        this.dispatchEvent(new CustomEvent<ProjectSessionState>('changed', { detail: this.state }))
    }
}

export const projectSessionService = new ProjectSessionService()
