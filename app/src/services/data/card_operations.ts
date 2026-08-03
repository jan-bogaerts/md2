import { createCardFile } from '../../data/card_naming'
import { computeMove, type CardMoveUpdate } from '../../data/card_ordering'
import type { CardDraft, MarkdownFile } from '../../data/data_types'
import type { OpenDocumentSaveReference } from '../open_files_service'
import { telemetryService } from '../telemetry/telemetry_service'
import { CardArchiveOperations } from './card_archive_operations'
import { CardInternalIdOperations } from './card_internal_id_operations'
import {
    attachSaveReference,
    CardOperationContext,
    type CardOperationsDeps,
    type CommitRequest,
} from './card_operation_context'
import { CardRenameOperations } from './card_rename_operations'
import { markdownParsingService } from './markdown_parsing_service'
import { ProjectFileOperations } from './project_file_operations'

export type { CardOperationsDeps }

/** The card-facing surface of the data service, delegating to focused operation modules. */
export class CardOperations {
    private readonly context: CardOperationContext
    private readonly archives: CardArchiveOperations
    private readonly internalIds: CardInternalIdOperations
    private readonly projectFiles: ProjectFileOperations
    private readonly renames: CardRenameOperations
    private readonly triggerStateActions: (cardPath: string, state: string) => void

    constructor(
        dependencies: CardOperationsDeps,
        triggerStateActions: (cardPath: string, state: string) => void,
    ) {
        this.context = new CardOperationContext(dependencies)
        this.triggerStateActions = triggerStateActions
        this.archives = new CardArchiveOperations(this.context, triggerStateActions)
        this.renames = new CardRenameOperations(this.context)
        this.internalIds = new CardInternalIdOperations(this.context, () => this.renames.reset())
        this.projectFiles = new ProjectFileOperations(this.context)
    }

    async createCard(draft: CardDraft, initialState: string) {
        const { config, project } = this.context.requireProject('create a card')
        const { dependencies } = this.context

        const file = createCardFile(
            dependencies.files(),
            config.workingFolder,
            config.cardSeparator,
            config.cardTypes,
            config.cardBodyTemplate,
            initialState,
            draft,
        )
        dependencies.replaceFiles([...dependencies.files(), file], config.workingFolder)
        await this.context.commitAndMergeFiles({
            branch: project.branch,
            files: [file],
            message: `Create ${file.path}`,
        }, [file])
        await this.context.pushCreatedItem('Card')

        dependencies.refreshSnapshot(config.workingFolder)
        telemetryService.trackEvent('create_card')

        return file
    }

    createFolder(parentDirectory: string, name: string) {
        return this.projectFiles.createFolder(parentDirectory, name)
    }

    createMarkdownFile(parentDirectory: string, name: string) {
        return this.projectFiles.createMarkdownFile(parentDirectory, name)
    }

    updateCardBody(path: string, body: string, saveReference?: OpenDocumentSaveReference) {
        const existingFile = this.context.dependencies.requireFile(path)

        return this.saveFile(
            { content: markdownParsingService.replaceBody(existingFile.content, body), path, sha: existingFile.sha },
            saveReference,
        )
    }

    updateCardAffects(path: string, affects: string[]) {
        return this.context.saveCardContentChange(path, (content) => markdownParsingService.setAffects(content, affects))
    }

    updateCardHeaderFields(path: string, updates: Record<string, string>, saveReference?: OpenDocumentSaveReference) {
        return this.context.saveCardContentChange(
            path,
            (content) => markdownParsingService.rewriteHeader(content, updates),
            saveReference,
        )
    }

    updateCardWorktree(path: string, worktree: number | null) {
        return this.context.saveCardContentChange(path, (content) => markdownParsingService.setWorktree(content, worktree))
    }

    toggleCardPolicy(path: string, policyKey: string, saveReference?: OpenDocumentSaveReference) {
        const { config } = this.context.dependencies.requireDependencies()
        const existingFile = this.context.dependencies.requireFile(path)
        const card = markdownParsingService.parseCard(existingFile, config.workingFolder)
        const enabled = card.header.policy[policyKey] ?? false

        return this.context.saveCardContentChange(
            path,
            (content) => markdownParsingService.setPolicyFlag(content, policyKey, !enabled),
            saveReference,
        )
    }

    ensureCardInternalIds() {
        return this.internalIds.ensureCardInternalIds()
    }

    updateCardTitle(path: string, title: string, saveReference?: OpenDocumentSaveReference) {
        return this.renames.updateCardTitle(path, title, saveReference)
    }

    async moveCard(cardPath: string, targetStatus: string, targetIndex: number) {
        if (targetStatus === 'archived') return this.archives.archiveCard(cardPath, targetIndex)

        const activeCards = this.context.dependencies.snapshot()?.activeCards ?? []
        const movedCard = activeCards.find((card) => card.path === cardPath)
        const previousStatus = movedCard?.header.status ?? null
        const updates = computeMove(activeCards, cardPath, targetStatus, targetIndex)

        this.saveCardMoveUpdates(cardPath, updates)

        if (movedCard && previousStatus !== targetStatus) this.triggerStateActions(movedCard.path, targetStatus)

        return updates
    }

    /** Applies every ordering link from one move to local state and one persistence batch. */
    private saveCardMoveUpdates(cardPath: string, updates: CardMoveUpdate[]) {
        if (updates.length === 0) return

        const { commitBatcher, project } = this.context.requireProject('move a card')
        const openDocumentsByPath = new Map(updates.map(({ path }) => [path, this.context.findOpenCardDocument(path)]))
        const updatedFiles = this.context.applyOrderingUpdates(updates)
        this.context.replaceUpdatedFiles(updatedFiles)

        const changes = updatedFiles.map((file) => attachSaveReference(
            file,
            this.context.resyncOpenCardDocument(openDocumentsByPath.get(file.path) ?? null, file.path, undefined, 'Moved'),
        ))
        commitBatcher.schedule(project.branch, changes, `Move ${cardPath}`)
        this.context.dependencies.dispatchChanged()
    }

    async deleteCard(path: string) {
        const card = this.context.dependencies.snapshot()?.activeCards.find((currentCard) => currentCard.path === path)
        if (!card) throw new Error(`Cannot delete an active card that is not loaded: ${path}`)

        return this.projectFiles.deleteProjectFile(path, true)
    }

    async deleteFile(path: string) {
        const { dependencies } = this.context
        const loadedFile = dependencies.files().some((file) => file.path === path)
        const repositoryFile = dependencies.snapshot()?.repositoryFiles.includes(path) ?? false
        if (!loadedFile && !repositoryFile) throw new Error(`Cannot delete a file that is not loaded: ${path}`)

        const activeCard = dependencies.snapshot()?.activeCards.some((card) => card.path === path) ?? false

        return this.projectFiles.deleteProjectFile(path, activeCard)
    }

    deleteFolder(path: string) {
        return this.projectFiles.deleteFolder(path)
    }

    saveFile(file: MarkdownFile, saveReference?: OpenDocumentSaveReference) {
        return this.context.saveFile(file, saveReference)
    }

    saveProjectFile(file: MarkdownFile, message: string) {
        return this.projectFiles.saveProjectFile(file, message)
    }

    flushPendingCommits() {
        return this.context.flushPendingCommits()
    }

    commitFiles(request: CommitRequest) {
        return this.context.commitFiles(request)
    }

    pushCommittedFiles(request: CommitRequest) {
        return this.context.pushCommittedFiles(request)
    }

    commitAndMergeFiles(request: CommitRequest, fallbackFiles: MarkdownFile[] = []) {
        return this.context.commitAndMergeFiles(request, fallbackFiles)
    }
}
