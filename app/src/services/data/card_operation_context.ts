import type { CardMoveUpdate } from '../../data/card_ordering'
import type { MarkdownFile, ProjectCard, ProjectReference, ProjectSnapshot, StorageService } from '../../data/data_types'
import type { CardOpenDocument, OpenDocumentSaveReference } from '../open_files_service'
import { openFilesService } from '../open_files_service'
import { telemetryService } from '../telemetry/telemetry_service'
import {
    errorMessage,
    type RequiredDataServiceDependencies,
    reportCommitFlushFailure,
    reportWorkspaceError,
} from './data_service_context'
import { markdownParsingService } from './markdown_parsing_service'

export type CommitRequest = Parameters<StorageService['commit']>[0]
type PendingCommitFile = MarkdownFile & { saveReference?: OpenDocumentSaveReference }

export interface CardOperationsDeps {
    cardPathChanged(fromPath: string, toPath: string): void
    commitPathsInFlight(): Set<string>
    deleteFile(path: string, committedFiles: MarkdownFile[], workingFolder: string): void
    dispatchChanged(): void
    dispatchPersistenceChanged(): void
    files(): MarkdownFile[]
    mergeCommittedFiles(files: MarkdownFile[], workingFolder: string): void
    project(): ProjectReference | null
    refreshSnapshot(workingFolder: string): void
    reloadCurrentProjectSnapshot(): Promise<ProjectSnapshot | null>
    renameFile(fromPath: string, toPath: string, workingFolder: string): void
    requireDependencies(): RequiredDataServiceDependencies
    requireFile(path: string): MarkdownFile
    replaceFiles(files: MarkdownFile[], workingFolder: string): void
    snapshot(): ProjectSnapshot | null
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
    private readonly cardsBySnapshot = new WeakMap<ProjectSnapshot, Map<string, ProjectCard>>()

    constructor(dependencies: CardOperationsDeps) {
        this.dependencies = dependencies
    }

    /** Resolves the storage dependencies plus the open project, or throws `Cannot <action> before a project is open`. */
    requireProject(action: string): OpenProjectDependencies {
        const { commitBatcher, config, storage } = this.dependencies.requireDependencies()
        const project = this.dependencies.project()
        if (!project) throw new Error(`Cannot ${action} before a project is open`)

        return { commitBatcher, config, project, storage }
    }

    findCard(path: string): ProjectCard | null {
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

    /** Replaces the file body with the unsaved editor draft so metadata writes never drop local edits. */
    mergeOpenCardBody(file: MarkdownFile): MarkdownFile {
        const openDocument = this.findOpenCardDocument(file.path)
        if (!openDocument) return file

        return { ...file, content: markdownParsingService.replaceBody(file.content, openDocument.getDraft().content) }
    }

    /**
     * Points the open document at the rebuilt card and returns the reference the commit must acknowledge.
     * Callers pass the document they captured before the snapshot was rebuilt.
     */
    resyncOpenCardDocument(
        openDocument: CardOpenDocument | null,
        path: string,
        saveReference: OpenDocumentSaveReference | undefined,
        rebuiltLabel: string,
    ) {
        if (!openDocument) return saveReference
        if (!saveReference) {
            const nextCard = this.findCard(path)
            if (!nextCard) throw new Error(`${rebuiltLabel} card was not rebuilt: ${path}`)
            openDocument.updateDraft(nextCard, this)
        }

        return saveReference ?? openDocument.createSaveReference()
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

    /** Rewrites the `after`/`status` header of every ordering link a move produced, keeping open drafts. */
    applyOrderingUpdates(updates: CardMoveUpdate[]): MarkdownFile[] {
        return updates.map((update) => {
            const existingFile = this.dependencies.requireFile(update.path)
            const content = markdownParsingService.rewriteHeader(existingFile.content, {
                after: update.after ?? '',
                status: update.status,
            })

            return this.mergeOpenCardBody({ ...existingFile, content })
        })
    }

    /** Commits while every touched path is marked in flight so snapshot reloads skip them. */
    async commitTrackingPaths(request: CommitRequest): Promise<MarkdownFile[]> {
        const { storage } = this.dependencies.requireDependencies()
        const commitPaths = [
            ...request.files.map((file) => file.path),
            ...(request.moves ?? []).flatMap(({ fromPath, toPath }) => [fromPath, toPath]),
        ]
        const inFlightCommitPaths = this.dependencies.commitPathsInFlight()
        commitPaths.forEach((path) => inFlightCommitPaths.add(path))

        try {
            return await storage.commit(request)
        } finally {
            commitPaths.forEach((path) => inFlightCommitPaths.delete(path))
        }
    }

    /** Commits, merges the result into local state and applies the configured push mode. */
    async commitFiles(request: CommitRequest) {
        const { config, storage } = this.dependencies.requireDependencies()
        const updatedFiles = await this.commitTrackingPaths(request)

        if (updatedFiles.length > 0) {
            this.dependencies.mergeCommittedFiles(updatedFiles, config.workingFolder)
            this.dependencies.refreshSnapshot(config.workingFolder)
        }

        const currentProject = this.dependencies.project()
        if (currentProject && config.pushMode === 'auto') await storage.push(currentProject)
        if (config.pushMode === 'manual') this.dependencies.dispatchPersistenceChanged()

        return updatedFiles
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

    /** Queues a local file change for the batched commit, keeping the open document in sync. */
    saveFile(file: MarkdownFile, saveReference?: OpenDocumentSaveReference) {
        const { commitBatcher, project } = this.requireProject('save a file')
        const existingFile = this.dependencies.requireFile(file.path)
        if (existingFile.content === file.content) return existingFile

        const openDocument = this.findOpenCardDocument(file.path)
        // replaceUpdatedFiles already rebuilds the snapshot; only the change event is still needed.
        this.replaceUpdatedFiles([file])
        const documentSaveReference = this.resyncOpenCardDocument(openDocument, file.path, saveReference, 'Saved')
        commitBatcher.schedule(project.branch, [attachSaveReference(file, documentSaveReference)], `Update ${file.path}`)
        this.dependencies.dispatchChanged()

        return file
    }

    saveCardMetadataFile(file: MarkdownFile, saveReference?: OpenDocumentSaveReference) {
        return this.saveFile(this.mergeOpenCardBody(file), saveReference)
    }

    /** Saves a card after rewriting its raw content, the shape every header setter shares. */
    saveCardContentChange(
        path: string,
        rewriteContent: (content: string) => string,
        saveReference?: OpenDocumentSaveReference,
    ) {
        const existingFile = this.dependencies.requireFile(path)

        return this.saveCardMetadataFile({
            content: rewriteContent(existingFile.content),
            path,
            sha: existingFile.sha,
        }, saveReference)
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
