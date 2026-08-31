import type { CardMoveUpdate } from '../../data/card_ordering'
import type { Card, MarkdownFile, MoveFile, ProjectReference, ProjectSnapshot, StorageService } from '../../data/data_types'
import type { CardOpenDocument, OpenDocumentSaveReference } from '../open_files_service'
import { openFilesService } from '../open_files_service'
import { telemetryService } from '../telemetry/telemetry_service'
import { projectAccessService } from '../project/project_access_service'
import {
    errorMessage,
    type RequiredDataServiceDependencies,
    reportCommitFlushFailure,
    reportWorkspaceError,
} from './data_service_context'
import { setCardHeaderFields } from './card_mutations'

export type CommitRequest = Parameters<StorageService['commit']>[0]
type PendingCommitFile = MarkdownFile & { saveReference?: OpenDocumentSaveReference }

export interface CardOperationsDeps {
    addRepositoryFile(path: string): void
    applyMoves(moves: MoveFile[], workingFolder: string): void
    cardPathChanged(fromPath: string, toPath: string): void
    deleteFile(path: string, committedFiles: MarkdownFile[], workingFolder: string): void
    dispatchChanged(): void
    dispatchPersistenceChanged(): void
    files(): MarkdownFile[]
    mergeCommittedFiles(files: MarkdownFile[], workingFolder: string): void
    mutateCard(path: string, mutation: (card: Card) => void, workingFolder: string): Card
    project(): ProjectReference | null
    recordCurrentContent(files: MarkdownFile[]): void
    reconcileDeletedActionFile(path: string): void
    refreshSnapshot(workingFolder: string): void
    reloadCurrentProjectSnapshot(): Promise<ProjectSnapshot | null>
    removeFolder(path: string, workingFolder: string): void
    renameFile(fromPath: string, toPath: string, workingFolder: string): void
    requireDependencies(): RequiredDataServiceDependencies
    requireCard(path: string): Card
    requireCardByInternalId(internalId: string): Card
    requireFile(path: string): MarkdownFile
    replaceFiles(files: MarkdownFile[], workingFolder: string): void
    snapshot(): ProjectSnapshot | null
    updateFiles(updatedFiles: MarkdownFile[], removedPaths: string[], workingFolder: string): void
}

/** The dependencies every card operation resolves once it knows a project is open. */
export interface OpenProjectDependencies extends RequiredDataServiceDependencies {
    project: ProjectReference
}

function attachSaveReference(file: MarkdownFile, saveReference: OpenDocumentSaveReference | undefined): PendingCommitFile {
    return saveReference ? { ...file, saveReference } : file
}

/**
 * Shared state and primitives every card operation module builds on: project lookup,
 * snapshot indexing, open-document synchronization, local file replacement and commits.
 */
export class CardOperationContext {
    readonly dependencies: CardOperationsDeps
    /** Path index per snapshot instance so repeated card lookups do not rescan both card lists. */
    private readonly cardsBySnapshot = new WeakMap<ProjectSnapshot, Map<string, Card>>()

    constructor(dependencies: CardOperationsDeps) {
        this.dependencies = dependencies
    }

    /** Resolves the storage dependencies plus the open project, or throws `Cannot <action> before a project is open`. */
    requireProject(action: string): OpenProjectDependencies {
        projectAccessService.requireWritable()
        const { commitBatcher, config, storage } = this.dependencies.requireDependencies()
        const project = this.dependencies.project()
        if (!project) throw new Error(`Cannot ${action} before a project is open`)

        return { commitBatcher, config, project, storage }
    }

    findCard(path: string): Card | null {
        const snapshot = this.dependencies.snapshot()
        if (!snapshot) return null

        let cardsByPath = this.cardsBySnapshot.get(snapshot)
        if (!cardsByPath) {
            cardsByPath = new Map([...snapshot.activeCards, ...snapshot.backgroundCards].map((card) => [card.path, card]))
            this.cardsBySnapshot.set(snapshot, cardsByPath)
        }

        return cardsByPath.get(path) ?? null
    }

    findOpenCardDocument(path: string): CardOpenDocument | null {
        const card = this.findCard(path)
        const document = card ? openFilesService.findDocument(card) : null

        return document?.kind === 'card' ? document : null
    }

    /** Overlays updated files onto the loaded files by path, leaving every other file untouched. */
    mergeUpdatedFiles(updatedFiles: MarkdownFile[]): MarkdownFile[] {
        const updatedFilesByPath = new Map(updatedFiles.map((file) => [file.path, file]))

        return this.dependencies.files().map((file) => updatedFilesByPath.get(file.path) ?? file)
    }

    replaceUpdatedFiles(updatedFiles: MarkdownFile[]) {
        const { config } = this.dependencies.requireDependencies()
        this.dependencies.replaceFiles(this.mergeUpdatedFiles(updatedFiles), config.workingFolder)
    }

    /** Applies a focused card mutation while carrying any unsaved editor body into owned state. */
    mutateCardPreservingOpenBody(path: string, mutation: (card: Card) => void, workingFolder: string) {
        const openDocument = this.findOpenCardDocument(path)
        const dirtyBody = openDocument?.dirty ? openDocument.getDraft().content : null

        return this.dependencies.mutateCard(path, (ownedCard) => {
            if (dirtyBody !== null) ownedCard.content = dirtyBody
            mutation(ownedCard)
        }, workingFolder)
    }

    /** Mutates the `after`/`status` fields for every ordering link produced by a move. */
    applyOrderingUpdates(updates: CardMoveUpdate[]): Card[] {
        const { config } = this.dependencies.requireDependencies()

        return updates.map((update) => {
            return this.dependencies.mutateCard(update.path, (card) => setCardHeaderFields(card, {
                after: update.after ?? '',
                status: update.status,
            }), config.workingFolder)
        })
    }

    /** Commits through storage, which records expected persistence outcomes before mutation. */
    async commitTrackingPaths(request: CommitRequest): Promise<MarkdownFile[]> {
        const { storage } = this.dependencies.requireDependencies()
        const committedFiles = await storage.commit(request)
        this.dependencies.recordCurrentContent([
            ...request.files,
            ...(request.moves ?? []).map(({ content, toPath }) => ({ content, path: toPath })),
        ])

        return committedFiles
    }

    /** Commits and merges the result into local state. */
    async commitFiles(request: CommitRequest) {
        const { config } = this.dependencies.requireDependencies()
        const updatedFiles = await this.commitTrackingPaths(request)
        const loadedPaths = new Set(this.dependencies.files().map(({ path }) => path))
        const fallbackFiles = request.files.filter(({ path }) => loadedPaths.has(path))
        const committedFiles = updatedFiles.length > 0 ? updatedFiles : fallbackFiles

        if (committedFiles.length > 0) {
            this.dependencies.mergeCommittedFiles(committedFiles, config.workingFolder)
            this.dependencies.refreshSnapshot(config.workingFolder)
        }

        if (config.pushMode === 'manual') this.dependencies.dispatchPersistenceChanged()

        return updatedFiles
    }

    /** Pushes a successfully persisted batch without delaying local save acknowledgement. */
    async pushCommittedFiles(request: CommitRequest) {
        const { config, storage } = this.dependencies.requireDependencies()
        if (config.pushMode !== 'auto') return

        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot push committed files before a project is open')
        if (currentProject.branch !== request.branch) throw new Error(`Cannot push committed files for inactive branch: ${request.branch}`)

        await storage.push(currentProject)
        this.dependencies.dispatchPersistenceChanged()
    }

    /** Commits and merges, falling back to the requested files when storage returns nothing. */
    async commitAndMergeFiles(request: CommitRequest, fallbackFiles: MarkdownFile[] = []) {
        const { config } = this.dependencies.requireDependencies()
        const updatedFiles = await this.commitTrackingPaths(request)
        const committedFiles = updatedFiles.length > 0 ? updatedFiles : fallbackFiles
        if (committedFiles.length === 0) return updatedFiles

        this.dependencies.mergeCommittedFiles(committedFiles, config.workingFolder)
        this.dependencies.refreshSnapshot(config.workingFolder)

        return updatedFiles
    }

    /** Commits newly inserted files and applies only persistence metadata returned by storage. */
    async commitCreatedFiles(request: CommitRequest) {
        const { config } = this.dependencies.requireDependencies()
        const updatedFiles = await this.commitTrackingPaths(request)
        if (updatedFiles.length > 0) this.dependencies.updateFiles(updatedFiles, [], config.workingFolder)

        return updatedFiles
    }

    /** Queues a local file change for the batched commit, keeping the open document in sync. */
    saveFile(file: MarkdownFile, saveReference?: OpenDocumentSaveReference) {
        const { commitBatcher, project } = this.requireProject('save a file')
        const existingFile = this.dependencies.requireFile(file.path)
        if (existingFile.content === file.content) return existingFile

        this.replaceUpdatedFiles([file])
        const change = { ...attachSaveReference(file, saveReference), kind: 'file' as const }
        commitBatcher.schedule(project.branch, [change], `Update ${file.path}`)
        this.dependencies.dispatchChanged()

        return file
    }

    /** Mutates one owned card and queues its reference for serialization at flush. */
    saveCardChange(
        path: string,
        mutation: (card: Card) => void,
        saveReference?: OpenDocumentSaveReference,
        message = `Update ${path}`,
    ) {
        const { commitBatcher, config, project } = this.requireProject('save a card')
        const openDocument = this.findOpenCardDocument(path)
        const card = this.mutateCardPreservingOpenBody(path, mutation, config.workingFolder)
        const cardInternalId = card.header.internalId
        if (!cardInternalId) throw new Error(`Cannot save a card without an internal ID: ${path}`)
        const documentSaveReference = saveReference ?? openDocument?.createSaveReference()

        const change = { cardInternalId, kind: 'card' as const, path: card.path, saveReference: documentSaveReference }
        commitBatcher.schedule(project.branch, [change], message)
        this.dependencies.dispatchChanged()

        return card
    }

    async flushPendingCommits() {
        const { commitBatcher } = this.dependencies.requireDependencies()
        const hadPendingCommits = commitBatcher.hasPending()

        try {
            await commitBatcher.flush()
        } catch (error) {
            reportCommitFlushFailure(error, this.dependencies.dispatchPersistenceChanged)
            throw error
        }

        if (hadPendingCommits) this.dependencies.dispatchPersistenceChanged()
    }

    /** Pushes a freshly created item when auto push is on, reporting failures without failing the creation. */
    async pushCreatedItem(createdItem: string) {
        const { config, project, storage } = this.requireProject('push')
        if (config.pushMode !== 'auto') return

        try {
            await storage.push(project)
        } catch (error) {
            const detail = errorMessage(error, 'GitHub push failed')
            reportWorkspaceError(
                `${createdItem} created locally, but GitHub push failed. Use Push after resolving the GitHub access problem. ${detail}`,
            )
            telemetryService.captureError(error)
        }
    }

    /** Rejects a new project item path that an existing file or folder already occupies. */
    requireAvailablePath(path: string) {
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
}

export { attachSaveReference }
