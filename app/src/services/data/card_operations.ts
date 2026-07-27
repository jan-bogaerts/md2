import { createCardFile, desiredCardPath } from '../../data/card_naming'
import { computeMove, orderByAfter, UNASSIGNED_STATUS } from '../../data/card_ordering'
import type { CardDraft, MarkdownFile, ProjectReference, ProjectSnapshot, StorageService } from '../../data/data_types'
import type { OpenDocumentSaveReference } from '../open_files_service'
import { openFilesService } from '../open_files_service'
import { newFolderPath, newMarkdownFilePath } from '../../data/project_tree_paths'
import { markdownParsingService } from './markdown_parsing_service'
import { telemetryService } from '../telemetry/telemetry_service'
import { buildCardArchiveMoves, findArchiveAssetPaths } from '../../data/release_archiving'
import {
    errorMessage,
    type RequiredDataServiceDependencies,
    reportCommitFlushFailure,
    reportWorkspaceError,
} from './data_service_context'

type CommitRequest = Parameters<StorageService['commit']>[0]
const FOLDER_PLACEHOLDER_NAME = '.gitkeep'

function findCard(snapshot: ProjectSnapshot | null, path: string) {
    return [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]
        .find((card) => card.path === path) ?? null
}

export interface CardOperationsDeps {
    cardPathChanged(fromPath: string, toPath: string): void
    commitPathsInFlight(): Set<string>
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
    private generatedInternalIdProjectKey: string | null = null
    private readonly generatedInternalIdsByPath = new Map<string, string>()
    /** Tracks where renamed cards landed so queued title updates keep targeting the same card. */
    private readonly committedPathsByPath = new Map<string, string>()
    private readonly titleChainByPath = new Map<string, Promise<void>>()
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

    updateCardBody(path: string, body: string, saveReference?: OpenDocumentSaveReference) {
        const existingFile = this.dependencies.requireFile(path)

        return this.saveFile(
            { content: markdownParsingService.replaceBody(existingFile.content, body), path, sha: existingFile.sha },
            saveReference,
        )
    }

    updateCardAffects(path: string, affects: string[]) {
        const existingFile = this.dependencies.requireFile(path)

        return this.saveCardMetadataFile({
            content: markdownParsingService.setAffects(existingFile.content, affects),
            path,
            sha: existingFile.sha,
        })
    }

    updateCardHeaderFields(path: string, updates: Record<string, string>, saveReference?: OpenDocumentSaveReference) {
        const existingFile = this.dependencies.requireFile(path)

        return this.saveCardMetadataFile({
            content: markdownParsingService.rewriteHeader(existingFile.content, updates),
            path,
            sha: existingFile.sha,
        }, saveReference)
    }

    /** Adds persisted identities to legacy cards loaded without an internal ID. */
    ensureCardInternalIds() {
        const snapshot = this.dependencies.snapshot()
        const cards = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]
        const { commitBatcher, config } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot add card identities before a project is open')
        const projectKey = `${currentProject.id}:${currentProject.branch}`
        if (projectKey !== this.generatedInternalIdProjectKey) {
            this.generatedInternalIdProjectKey = projectKey
            this.generatedInternalIdsByPath.clear()
            this.committedPathsByPath.clear()
        }
        for (const card of cards) {
            if (card.header.internalId) this.generatedInternalIdsByPath.delete(card.path)
        }
        const cardsWithoutInternalId = cards.filter(({ header }) => !header.internalId)
        if (cardsWithoutInternalId.length === 0) return 0

        const filesToPersist: MarkdownFile[] = []
        const updatedFiles = cardsWithoutInternalId.map((card) => {
            const existingFile = this.dependencies.requireFile(card.path)
            const generatedInternalId = this.generatedInternalIdsByPath.get(card.path)
            const internalId = generatedInternalId ?? markdownParsingService.generateInternalId()
            this.generatedInternalIdsByPath.set(card.path, internalId)
            const updatedFile = {
                ...existingFile,
                content: markdownParsingService.rewriteHeader(existingFile.content, { internalId }),
            }
            if (!generatedInternalId) filesToPersist.push(updatedFile)

            return updatedFile
        })
        const updatedFilesByPath = new Map(updatedFiles.map((file) => [file.path, file]))
        const files = this.dependencies.files().map((file) => updatedFilesByPath.get(file.path) ?? file)
        this.dependencies.replaceFiles(files, config.workingFolder)
        if (filesToPersist.length > 0) {
            commitBatcher.schedule(currentProject.branch, filesToPersist, 'Add missing card internal IDs')
        }
        this.dependencies.dispatchChanged()

        return filesToPersist.length
    }

    /**
     * Saves the new title and, when it changes the card file name, renames the file.
     * Renames flush the pending batch before and after so the move never shares a batch with other edits.
     */
    async updateCardTitle(path: string, title: string, saveReference?: OpenDocumentSaveReference) {
        const pending = this.titleChainByPath.get(path) ?? Promise.resolve()
        const applyTitle = async () => this.applyCardTitle(this.committedPath(path), title, saveReference)
        const titleUpdate = pending.then(applyTitle, applyTitle)
        const chained = titleUpdate.then(() => undefined, () => undefined)
        this.titleChainByPath.set(path, chained)
        void chained.then(() => {
            if (this.titleChainByPath.get(path) === chained) this.titleChainByPath.delete(path)
        })

        return titleUpdate
    }

    private async applyCardTitle(path: string, title: string, saveReference?: OpenDocumentSaveReference) {
        const existingFile = this.dependencies.requireFile(path)
        const file = {
            content: markdownParsingService.setCardTitle(existingFile.content, title),
            path,
            ...(existingFile.sha ? { sha: existingFile.sha } : {}),
        }
        const snapshot = this.dependencies.snapshot()
        const occupiedPaths = [
            ...this.dependencies.files().map((currentFile) => currentFile.path),
            ...(snapshot?.repositoryFiles ?? []),
        ]
        const targetPath = desiredCardPath(path, title, occupiedPaths)
        if (targetPath === path) return this.saveCardMetadataFile(file, saveReference)

        return this.renameCardFile(file, targetPath, saveReference)
    }

    /** Commits pending work, then commits the rename on its own so no other change shares its batch entry. */
    private async renameCardFile(file: MarkdownFile, targetPath: string, saveReference?: OpenDocumentSaveReference) {
        const { commitBatcher, config } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot rename a card before a project is open')

        await this.flushPendingCommitBatch()

        const existingFile = this.dependencies.requireFile(file.path)
        const currentCard = findCard(this.dependencies.snapshot(), file.path)
        const openDocument = currentCard ? openFilesService.findDocument(currentCard) : null
        const content = openDocument?.kind === 'card'
            ? markdownParsingService.replaceBody(file.content, openDocument.getDraft().content)
            : file.content
        const renamedFile = { content, path: targetPath, ...(existingFile.sha ? { sha: existingFile.sha } : {}) }

        const files = this.dependencies.files().map((currentFile) => (
            currentFile.path === file.path ? { ...currentFile, content } : currentFile
        ))
        // replaceFiles already rebuilds the snapshot; the file keeps its old path until the move is committed.
        this.dependencies.replaceFiles(files, config.workingFolder)
        if (openDocument?.kind === 'card' && !saveReference) {
            const nextCard = findCard(this.dependencies.snapshot(), file.path)
            if (!nextCard) throw new Error(`Renamed card was not rebuilt: ${file.path}`)
            openDocument.updateDraft(nextCard, this)
        }
        const documentSaveReference = saveReference ?? openDocument?.createSaveReference()
        commitBatcher.schedulePathChange(
            currentProject.branch,
            file.path,
            { ...renamedFile, saveReference: documentSaveReference },
            `Rename ${file.path} to ${targetPath}`,
            (fromPath, toPath) => this.reconcileCardPath(fromPath, toPath),
        )
        this.dependencies.dispatchChanged()
        await this.flushPendingCommitBatch()

        return renamedFile
    }

    /** Moves local state onto the committed path and lets path-keyed callers follow the card. */
    private reconcileCardPath(fromPath: string, toPath: string) {
        if (fromPath === toPath) return

        const { config } = this.dependencies.requireDependencies()
        this.dependencies.renameFile(fromPath, toPath, config.workingFolder)
        for (const [sourcePath, currentPath] of this.committedPathsByPath) {
            if (currentPath === fromPath) this.committedPathsByPath.set(sourcePath, toPath)
        }
        this.committedPathsByPath.set(fromPath, toPath)
        this.dependencies.cardPathChanged(fromPath, toPath)
        this.dependencies.dispatchChanged()
    }

    private committedPath(path: string) {
        return this.committedPathsByPath.get(path) ?? path
    }

    updateCardWorktree(path: string, worktree: number | null) {
        const existingFile = this.dependencies.requireFile(path)

        return this.saveCardMetadataFile({
            content: markdownParsingService.setWorktree(existingFile.content, worktree),
            path,
            sha: existingFile.sha,
        })
    }

    toggleCardPolicy(path: string, policyKey: string, saveReference?: OpenDocumentSaveReference) {
        const { config } = this.dependencies.requireDependencies()
        const existingFile = this.dependencies.requireFile(path)
        const card = markdownParsingService.parseCard(existingFile, config.workingFolder)
        const enabled = card.header.policy[policyKey] ?? false

        return this.saveCardMetadataFile({
            content: markdownParsingService.setPolicyFlag(existingFile.content, policyKey, !enabled),
            path,
            sha: existingFile.sha,
        }, saveReference)
    }

    async moveCard(cardPath: string, targetStatus: string, targetIndex: number) {
        if (targetStatus === 'archived') return this.archiveCard(cardPath, targetIndex)

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

    private async archiveCard(cardPath: string, targetIndex: number) {
        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot archive a card before a project is open')

        await this.flushPendingCommitBatch()

        const snapshot = this.dependencies.snapshot()
        const activeCards = snapshot?.activeCards ?? []
        const archivedCard = activeCards.find((card) => card.path === cardPath)
        if (!archivedCard) throw new Error(`Cannot archive an active card that is not loaded: ${cardPath}`)

        const updates = computeMove(activeCards, cardPath, 'archived', targetIndex)
        const updatedFiles = updates.map((update) => {
            const existingFile = this.dependencies.requireFile(update.path)
            const content = markdownParsingService.rewriteHeader(existingFile.content, {
                after: update.after ?? '',
                status: update.status,
            })

            return this.mergeOpenCardBody({ ...existingFile, content })
        })
        const updatedFilesByPath = new Map(updatedFiles.map((file) => [file.path, file]))
        const files = this.dependencies.files().map((file) => updatedFilesByPath.get(file.path) ?? file)
        const assetPaths = findArchiveAssetPaths(files, [archivedCard])
        const assetFiles = await this.loadArchiveAssets(assetPaths)
        const moves = buildCardArchiveMoves(
            [...files, ...assetFiles],
            [archivedCard],
            config.archivedFolder,
            snapshot?.repositoryFiles ?? [],
        )
        const orderingFiles = updatedFiles.filter((file) => file.path !== cardPath)
        const request = {
            branch: currentProject.branch,
            files: orderingFiles,
            message: `Archive ${cardPath}`,
            moves,
        }
        const commitPaths = [
            ...orderingFiles.map((file) => file.path),
            ...moves.flatMap(({ fromPath, toPath }) => [fromPath, toPath]),
        ]
        const inFlightCommitPaths = this.dependencies.commitPathsInFlight()
        commitPaths.forEach((path) => inFlightCommitPaths.add(path))

        try {
            await storage.commit(request)
        } finally {
            commitPaths.forEach((path) => inFlightCommitPaths.delete(path))
        }

        this.triggerStateActions(cardPath, 'archived')
        if (config.pushMode === 'auto') await storage.push(currentProject)
        if (config.pushMode === 'manual') this.dependencies.dispatchPersistenceChanged()
        await this.dependencies.reloadCurrentProjectSnapshot()

        const cardMove = moves.find((move) => move.fromPath === cardPath)
        if (!cardMove) throw new Error(`Missing archived card move: ${cardPath}`)

        this.dependencies.cardPathChanged(cardPath, cardMove.toPath)

        return updates
    }

    private async loadArchiveAssets(assetPaths: string[]) {
        if (assetPaths.length === 0) return []

        const { storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot load archived card assets before a project is open')
        if (!storage.loadProjectAsset) throw new Error('Project asset loading is not available')

        const assets: MarkdownFile[] = []
        for (const assetPath of assetPaths) {
            const asset = await storage.loadProjectAsset(currentProject, assetPath)
            assets.push({ content: asset.content, encoding: asset.encoding, path: asset.path })
        }

        return assets
    }

    async deleteCard(path: string) {
        const card = this.dependencies.snapshot()?.activeCards.find((currentCard) => currentCard.path === path)
        if (!card) throw new Error(`Cannot delete an active card that is not loaded: ${path}`)

        return this.deleteProjectFile(path, true)
    }

    async deleteFile(path: string) {
        const loadedFile = this.dependencies.files().some((file) => file.path === path)
        const repositoryFile = this.dependencies.snapshot()?.repositoryFiles.includes(path) ?? false
        if (!loadedFile && !repositoryFile) throw new Error(`Cannot delete a file that is not loaded: ${path}`)

        const activeCard = this.dependencies.snapshot()?.activeCards.some((card) => card.path === path) ?? false

        return this.deleteProjectFile(path, activeCard)
    }

    async deleteFolder(path: string) {
        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot delete a folder before a project is open')

        const folderPrefix = `${path.replace(/\/+$/u, '')}/`
        const repositoryFiles = this.dependencies.snapshot()?.repositoryFiles ?? []
        if (!repositoryFiles.some((filePath) => filePath.startsWith(folderPrefix))) {
            throw new Error(`Cannot delete a folder that is not loaded: ${path}`)
        }

        await this.flushPendingCommitBatch()
        await storage.deleteFolder({ branch: currentProject.branch, message: `Delete ${path}`, path })
        if (config.pushMode === 'auto') await storage.push(currentProject)
        await this.dependencies.reloadCurrentProjectSnapshot()

        return this.dependencies.snapshot()
    }

    saveFile(file: MarkdownFile, saveReference?: OpenDocumentSaveReference) {
        const { commitBatcher, config } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot save a file before a project is open')
        const existingFile = this.dependencies.requireFile(file.path)
        if (existingFile.content === file.content) return existingFile

        const currentCard = findCard(this.dependencies.snapshot(), file.path)
        const openDocument = currentCard ? openFilesService.findDocument(currentCard) : null

        const currentFiles = this.dependencies.files().map((currentFile) => (currentFile.path === file.path ? file : currentFile))
        // replaceFiles already rebuilds the snapshot; only the change event is still needed.
        this.dependencies.replaceFiles(currentFiles, config.workingFolder)
        if (openDocument?.kind === 'card' && !saveReference) {
            const nextCard = findCard(this.dependencies.snapshot(), file.path)
            if (!nextCard) throw new Error(`Saved card was not rebuilt: ${file.path}`)
            openDocument.updateDraft(nextCard, this)
        }
        const documentSaveReference = saveReference ?? openDocument?.createSaveReference()
        commitBatcher.schedule(
            currentProject.branch,
            [{ ...file, saveReference: documentSaveReference }],
            `Update ${file.path}`,
        )
        this.dependencies.dispatchChanged()

        return file
    }

    private saveCardMetadataFile(file: MarkdownFile, saveReference?: OpenDocumentSaveReference) {
        return this.saveFile(this.mergeOpenCardBody(file), saveReference)
    }

    private mergeOpenCardBody(file: MarkdownFile) {
        const currentCard = findCard(this.dependencies.snapshot(), file.path)
        const openDocument = currentCard ? openFilesService.findDocument(currentCard) : null
        const content = openDocument?.kind === 'card'
            ? markdownParsingService.replaceBody(file.content, openDocument.getDraft().content)
            : file.content

        return { ...file, content }
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
            reportCommitFlushFailure(error, this.dependencies.dispatchPersistenceChanged)
            throw error
        }

        if (hadPendingCommits) this.dependencies.dispatchPersistenceChanged()
    }

    async commitFiles(request: CommitRequest) {
        const { config, storage } = this.dependencies.requireDependencies()
        const commitPaths = [
            ...request.files.map((file) => file.path),
            ...(request.moves ?? []).flatMap(({ fromPath, toPath }) => [fromPath, toPath]),
        ]
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
        if (config.pushMode === 'manual') this.dependencies.dispatchPersistenceChanged()

        return updatedFiles
    }

    async commitAndMergeFiles(request: CommitRequest, fallbackFiles: MarkdownFile[] = []) {
        const { config, storage } = this.dependencies.requireDependencies()
        const commitPaths = [
            ...request.files.map((file) => file.path),
            ...(request.moves ?? []).flatMap(({ fromPath, toPath }) => [fromPath, toPath]),
        ]
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

    private async deleteProjectFile(path: string, repairActiveOrdering: boolean) {
        const { config, storage } = this.dependencies.requireDependencies()
        const currentProject = this.dependencies.project()
        if (!currentProject) throw new Error('Cannot delete a file before a project is open')

        await this.flushPendingCommitBatch()

        const existingFile = this.dependencies.files().find((file) => file.path === path)
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
            ...(existingFile?.sha ? { sha: existingFile.sha } : {}),
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
