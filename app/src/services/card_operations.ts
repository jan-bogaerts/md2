import { createCardFile } from '../data/card_naming'
import { computeMove, orderByAfter, UNASSIGNED_STATUS } from '../data/card_ordering'
import type { CardDraft, MarkdownFile, ProjectReference, ProjectSnapshot, StorageService } from '../data/data_types'
import { newFolderPath, newMarkdownFilePath } from '../data/project_tree_paths'
import { markdownParsingService } from './markdown_parsing_service'
import { telemetryService } from './telemetry_service'
import {
    errorMessage,
    type RequiredDataServiceDependencies,
    reportCommitFlushFailure,
    reportWorkspaceError,
} from './data_service_context'

type CommitRequest = Parameters<StorageService['commit']>[0]
const FOLDER_PLACEHOLDER_NAME = '.gitkeep'

export interface CardOperationsDeps {
    commitPathsInFlight(): Set<string>
    dispatchChanged(): void
    files(): MarkdownFile[]
    mergeCommittedFiles(files: MarkdownFile[], workingFolder: string): void
    project(): ProjectReference | null
    refreshSnapshot(workingFolder: string): void
    reloadCurrentProjectSnapshot(): Promise<ProjectSnapshot | null>
    requireDependencies(): RequiredDataServiceDependencies
    requireFile(path: string): MarkdownFile
    replaceFiles(files: MarkdownFile[], workingFolder: string): void
    snapshot(): ProjectSnapshot | null
}

function statusOf(card: ProjectSnapshot['activeCards'][number]) {
    return card.header.status ?? UNASSIGNED_STATUS
}

function reportAutoPushFailure(error: unknown, createdItem: string) {
    const detail = errorMessage(error, 'GitHub push failed')

    reportWorkspaceError(`${createdItem} created locally, but GitHub push failed. Use Push after resolving the GitHub access problem. ${detail}`)
    telemetryService.captureError(error)
}

async function pushCreatedItem(
    storage: StorageService,
    project: ProjectReference,
    shouldPush: boolean,
    createdItem: string,
) {
    if (!shouldPush) return

    try {
        await storage.push(project)
    } catch (error) {
        reportAutoPushFailure(error, createdItem)
    }
}

export class CardOperations {
    private readonly dependencies: CardOperationsDeps
    private readonly triggerStateActions: (cardPath: string, state: string) => void

    constructor(
        dependencies: CardOperationsDeps,
        triggerStateActions: (cardPath: string, state: string) => void,
    ) {
        this.dependencies = dependencies
        this.triggerStateActions = triggerStateActions
    }

    async createCard(draft: CardDraft) {
        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot create a card before a project is open')

        const initialState = config.states[0].state
        const file = createCardFile(
            this.dependencies.files(),
            config.workingFolder,
            config.cardSeparator,
            config.cardTypes,
            config.cardBodyTemplate,
            initialState,
            draft,
        )
        this.dependencies.replaceFiles([...this.dependencies.files(), file], config.workingFolder)
        await this.commitAndMergeFiles({
            branch: currentProject.branch,
            files: [file],
            message: `Create ${file.path}`,
        }, [file])

        if (config.pushMode === 'auto') {
            try {
                await storage.push(currentProject)
            } catch (error) {
                reportAutoPushFailure(error, 'Card')
            }
        }

        this.dependencies.refreshSnapshot(config.workingFolder)
        telemetryService.trackEvent('create_card')

        return file
    }

    async createFolder(parentDirectory: string, name: string) {
        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot create a folder before a project is open')

        const folderPath = newFolderPath(parentDirectory, name, config.projectFolder)
        this.requireAvailablePath(folderPath)
        const placeholderFile = { content: '', path: `${folderPath}/${FOLDER_PLACEHOLDER_NAME}` }
        await storage.commit({
            branch: currentProject.branch,
            files: [placeholderFile],
            message: `Create ${folderPath}`,
        })
        await pushCreatedItem(storage, currentProject, config.pushMode === 'auto', 'Folder')
        await this.dependencies.reloadCurrentProjectSnapshot()

        return folderPath
    }

    async createMarkdownFile(parentDirectory: string, name: string) {
        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot create a Markdown file before a project is open')

        const path = newMarkdownFilePath(parentDirectory, name, config.projectFolder)
        this.requireAvailablePath(path)
        const file = { content: '', path }
        await this.commitAndMergeFiles({
            branch: currentProject.branch,
            files: [file],
            message: `Create ${path}`,
        }, [file])
        await pushCreatedItem(storage, currentProject, config.pushMode === 'auto', 'Markdown file')

        return file
    }

    updateCardBody(path: string, body: string) {
        const existingFile = this.dependencies.requireFile(path)

        return this.saveFile({ content: markdownParsingService.replaceBody(existingFile.content, body), path, sha: existingFile.sha })
    }

    updateCardAffects(path: string, affects: string[]) {
        const existingFile = this.dependencies.requireFile(path)

        return this.saveFile({ content: markdownParsingService.setAffects(existingFile.content, affects), path, sha: existingFile.sha })
    }

    updateCardHeaderFields(path: string, updates: Record<string, string>) {
        const existingFile = this.dependencies.requireFile(path)

        return this.saveFile({
            content: markdownParsingService.rewriteHeader(existingFile.content, updates),
            path,
            sha: existingFile.sha,
        })
    }

    updateCardTitle(path: string, title: string) {
        const existingFile = this.dependencies.requireFile(path)

        return this.saveFile({ content: markdownParsingService.setCardTitle(existingFile.content, title), path, sha: existingFile.sha })
    }

    updateCardWorktree(path: string, worktree: number | null) {
        const existingFile = this.dependencies.requireFile(path)

        return this.saveFile({ content: markdownParsingService.setWorktree(existingFile.content, worktree), path, sha: existingFile.sha })
    }

    toggleCardPolicy(path: string, policyKey: string) {
        const { config } = this.dependencies.requireDependencies()
        const existingFile = this.dependencies.requireFile(path)
        const card = markdownParsingService.parseCard(existingFile, config.workingFolder)
        const enabled = card.header.policy[policyKey] ?? false

        return this.saveFile({
            content: markdownParsingService.setPolicyFlag(existingFile.content, policyKey, !enabled),
            path,
            sha: existingFile.sha,
        })
    }

    moveCard(cardPath: string, targetStatus: string, targetIndex: number) {
        const activeCards = this.dependencies.snapshot()?.activeCards ?? []
        const movedCard = activeCards.find((card) => card.path === cardPath)
        const previousStatus = movedCard?.header.status ?? null
        const updates = computeMove(activeCards, cardPath, targetStatus, targetIndex)

        for (const update of updates) {
            this.updateCardHeaderFields(update.path, { after: update.after ?? '', status: update.status })
        }

        if (movedCard && previousStatus !== targetStatus) this.triggerStateActions(movedCard.path, targetStatus)

        return updates
    }

    async deleteCard(path: string) {
        const card = this.dependencies.snapshot()?.activeCards.find((currentCard) => currentCard.path === path)
        if (!card) throw new Error(`Cannot delete an active card that is not loaded: ${path}`)

        return this.deleteLoadedFile(path, true)
    }

    async deleteFile(path: string) {
        this.dependencies.requireFile(path)

        const activeCard = this.dependencies.snapshot()?.activeCards.some((card) => card.path === path) ?? false

        return this.deleteLoadedFile(path, activeCard)
    }

    saveFile(file: MarkdownFile) {
        const { commitBatcher, config } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot save a file before a project is open')

        const currentFiles = this.dependencies.files().map((currentFile) => (currentFile.path === file.path ? file : currentFile))
        // replaceFiles already rebuilds the snapshot; only the change event is still needed.
        this.dependencies.replaceFiles(currentFiles, config.workingFolder)
        commitBatcher.schedule(currentProject.branch, [file], `Update ${file.path}`)
        this.dependencies.dispatchChanged()

        return file
    }

    async saveProjectFile(file: MarkdownFile, message: string) {
        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot save a project file before a project is open')

        await this.commitAndMergeFiles({
            branch: currentProject.branch,
            files: [file],
            message,
        }, [file])

        if (config.pushMode === 'auto') await storage.push(currentProject)

        return file
    }

    async flushPendingCommits() {
        await this.flushPendingCommitBatch()
    }

    async flushPendingCommitBatch() {
        const { commitBatcher } = this.dependencies.requireDependencies()
        const hadPendingCommits = commitBatcher.hasPending()

        try {
            await commitBatcher.flush()
        } catch (error) {
            reportCommitFlushFailure(error, this.dependencies.dispatchChanged)
            throw error
        }

        if (hadPendingCommits) this.dependencies.dispatchChanged()
    }

    async commitFiles(request: CommitRequest) {
        const { config, storage } = this.dependencies.requireDependencies()
        const commitPaths = request.files.map((file) => file.path)
        const inFlightCommitPaths = this.dependencies.commitPathsInFlight()
        commitPaths.forEach((path) => inFlightCommitPaths.add(path))
        let updatedFiles: MarkdownFile[] = []

        try {
            updatedFiles = await storage.commit(request)
        } finally {
            commitPaths.forEach((path) => inFlightCommitPaths.delete(path))
        }

        if (updatedFiles.length > 0) {
            this.dependencies.mergeCommittedFiles(updatedFiles, config.workingFolder)
            this.dependencies.refreshSnapshot(config.workingFolder)
        }

        const currentProject = this.dependencies.project()
        if (currentProject && config.pushMode === 'auto') await storage.push(currentProject)
        if (config.pushMode === 'manual') this.dependencies.dispatchChanged()
    }

    async commitAndMergeFiles(request: CommitRequest, fallbackFiles: MarkdownFile[] = []) {
        const { config, storage } = this.dependencies.requireDependencies()
        const commitPaths = request.files.map((file) => file.path)
        const inFlightCommitPaths = this.dependencies.commitPathsInFlight()
        commitPaths.forEach((path) => inFlightCommitPaths.add(path))
        let updatedFiles: MarkdownFile[] = []

        try {
            updatedFiles = await storage.commit(request)
        } finally {
            commitPaths.forEach((path) => inFlightCommitPaths.delete(path))
        }
        const committedFiles = updatedFiles.length > 0 ? updatedFiles : fallbackFiles
        if (committedFiles.length === 0) return updatedFiles

        this.dependencies.mergeCommittedFiles(committedFiles, config.workingFolder)
        this.dependencies.refreshSnapshot(config.workingFolder)

        return updatedFiles
    }

    private async deleteLoadedFile(path: string, repairActiveOrdering: boolean) {
        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot delete a file before a project is open')

        await this.flushPendingCommitBatch()

        const existingFile = this.dependencies.requireFile(path)
        const repairFile = repairActiveOrdering ? this.createDeleteRepairFile(path) : null

        if (repairFile) {
            await storage.commit({
                branch: currentProject.branch,
                files: [repairFile],
                message: `Repair ordering after deleting ${path}`,
            })
        }

        await storage.deleteFile({
            branch: currentProject.branch,
            message: `Delete ${path}`,
            path,
            sha: existingFile.sha,
        })

        if (config.pushMode === 'auto') await storage.push(currentProject)

        await this.dependencies.reloadCurrentProjectSnapshot()

        return this.dependencies.snapshot()
    }

    private requireAvailablePath(path: string) {
        const snapshot = this.dependencies.snapshot()
        if (!snapshot) throw new Error('Cannot create a project item before project files are loaded')

        const normalizedPath = path.toLowerCase()
        const existingPaths = [
            ...this.dependencies.files().map((file) => file.path),
            ...snapshot.repositoryFiles,
        ].map((existingPath) => existingPath.replace(/\\/gu, '/').toLowerCase())
        const pathExists = existingPaths.some((existingPath) => (
            existingPath === normalizedPath
            || existingPath.startsWith(`${normalizedPath}/`)
        ))
        if (pathExists) throw new Error(`A project item already exists at ${path}`)
    }

    private createDeleteRepairFile(path: string): MarkdownFile | null {
        const activeCards = this.dependencies.snapshot()?.activeCards ?? []
        const deletedCard = activeCards.find((card) => card.path === path)
        if (!deletedCard) return null
        if (!deletedCard.header.internalId) return null

        const column = orderByAfter(activeCards.filter((card) => statusOf(card) === statusOf(deletedCard)))
        const deletedIndex = column.findIndex((card) => card.path === path)
        const follower = column[deletedIndex + 1]
        if (!follower || follower.header.after !== deletedCard.header.internalId) return null

        const followerFile = this.dependencies.requireFile(follower.path)

        return {
            content: markdownParsingService.rewriteHeader(followerFile.content, { after: deletedCard.header.after ?? '' }),
            path: followerFile.path,
            sha: followerFile.sha,
        }
    }
}
