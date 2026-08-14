import { createCardFile } from '../../data/card_naming'
import { computeMove, type CardMoveUpdate } from '../../data/card_ordering'
import type { CardDraft, CardType, MarkdownFile, Card } from '../../data/data_types'
import type { OpenDocumentSaveReference } from '../open_files_service'
import { telemetryService } from '../telemetry/telemetry_service'
import { CardArchiveOperations } from './card_archive_operations'
import { CardInternalIdOperations } from './card_internal_id_operations'
import { CardImageOperations } from './card_image_operations'
import {
    CardOperationContext,
    type CardOperationsDeps,
    type CommitRequest,
} from './card_operation_context'
import { CardRenameOperations } from './card_rename_operations'
import { ProjectFileOperations } from './project_file_operations'
import { markdownParsingService } from './markdown_parsing_service'
import {
    clearCardBranch,
    setCardAffects,
    setCardAgentLogReferences,
    setCardBody,
    setCardHeaderFields,
    setCardWorktree,
    setCardWorktreeAssignment,
    toggleCardPolicy,
} from './card_mutations'
import { buildSentryIssueMarkdown } from '../sentry/sentry_issue_markdown'
import { normalizeSentryBaseUrl, sentryIdentityKey, type SentryIssueImport } from '../sentry/sentry_types'

export type { CardOperationsDeps }

export interface SentryIssueImportRequest {
    apiBaseUrl: string
    cardState: string
    cardType: CardType
    issues: SentryIssueImport[]
    organization: string
    projectId: string
}

function importedSentryIdentities(cards: Card[]) {
    return new Set(cards.flatMap(({ header }) => {
        const { sentryBaseUrl, sentryIssueId, sentryOrganization } = header
        if (!sentryBaseUrl || !sentryIssueId || !sentryOrganization) return []

        return [sentryIdentityKey(sentryBaseUrl, sentryOrganization, sentryIssueId)]
    }))
}

/** The card-facing surface of the data service, delegating to focused operation modules. */
export class CardOperations {
    private readonly context: CardOperationContext
    private readonly archives: CardArchiveOperations
    private readonly internalIds: CardInternalIdOperations
    private readonly images: CardImageOperations
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
        this.images = new CardImageOperations(this.context)
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
        dependencies.updateFiles([file], [], config.workingFolder)
        await this.context.commitCreatedFiles({
            branch: project.branch,
            files: [file],
            message: `Create ${file.path}`,
        })
        void this.context.pushCreatedItem('Card')

        telemetryService.trackEvent('create_card')

        return file
    }

    /** Creates unseen Sentry issues through one local-state update and one storage commit. */
    async importSentryIssues(request: SentryIssueImportRequest) {
        const { config, project } = this.context.requireProject('import Sentry issues')
        if (project.id !== request.projectId) throw new Error('Opened project changed before Sentry import persistence')
        if (!config.cardTypes.some(({ type }) => type === request.cardType)) {
            throw new Error(`Configured Sentry card type no longer exists: ${request.cardType}`)
        }
        if (!config.states.some(({ state }) => state === request.cardState)) {
            throw new Error(`Configured Sentry card state no longer exists: ${request.cardState}`)
        }

        const snapshot = this.context.dependencies.snapshot()
        if (!snapshot) throw new Error('Cannot import Sentry issues before project cards are loaded')
        const identities = importedSentryIdentities([...snapshot.activeCards, ...snapshot.backgroundCards])
        const normalizedBaseUrl = normalizeSentryBaseUrl(request.apiBaseUrl)
        const preparedFiles: MarkdownFile[] = []

        for (const importedIssue of request.issues) {
            const identity = sentryIdentityKey(normalizedBaseUrl, request.organization, importedIssue.issue.id)
            if (identities.has(identity)) continue

            const draft = {
                body: buildSentryIssueMarkdown(importedIssue),
                title: importedIssue.issue.title,
                type: request.cardType,
            }
            const file = createCardFile(
                [...this.context.dependencies.files(), ...preparedFiles],
                config.workingFolder,
                config.cardSeparator,
                config.cardTypes,
                config.cardBodyTemplate,
                request.cardState,
                draft,
            )
            const content = markdownParsingService.rewriteHeader(file.content, {
                sentryBaseUrl: normalizedBaseUrl,
                sentryIssueId: importedIssue.issue.id,
                sentryOrganization: request.organization.trim(),
            })
            preparedFiles.push({ ...file, content })
            identities.add(identity)
        }

        if (preparedFiles.length === 0) return []
        if (this.context.dependencies.project()?.id !== request.projectId) {
            throw new Error('Opened project changed before Sentry import persistence')
        }

        this.context.dependencies.updateFiles(preparedFiles, [], config.workingFolder)
        await this.context.commitCreatedFiles({
            branch: project.branch,
            files: preparedFiles,
            message: `Import ${preparedFiles.length} Sentry issue${preparedFiles.length === 1 ? '' : 's'}`,
        })
        void this.context.pushCreatedItem('Sentry issues')

        return preparedFiles
    }

    savePastedImageForCard(cardPath: string, file: File) {
        return this.images.saveForCard(cardPath, file)
    }

    savePastedImageForNewCard(file: File) {
        return this.images.saveForNewCard(file)
    }

    deletePastedImage(path: string) {
        return this.images.delete(path)
    }

    createFolder(parentDirectory: string, name: string) {
        return this.projectFiles.createFolder(parentDirectory, name)
    }

    createMarkdownFile(parentDirectory: string, name: string) {
        return this.projectFiles.createMarkdownFile(parentDirectory, name)
    }

    updateCardBody(path: string, body: string, saveReference?: OpenDocumentSaveReference) {
        return this.context.saveCardChange(path, (card) => setCardBody(card, body), saveReference)
    }

    updateCardAffects(path: string, affects: string[]): Card {
        return this.context.saveCardChange(path, (card) => setCardAffects(card, affects))
    }

    updateCardHeaderFields(path: string, updates: Record<string, string>, saveReference?: OpenDocumentSaveReference) {
        return this.context.saveCardChange(path, (card) => setCardHeaderFields(card, updates), saveReference)
    }

    updateCardWorktree(path: string, worktree: number | null) {
        return this.context.saveCardChange(path, (card) => setCardWorktree(card, worktree))
    }

    assignCardWorktree(path: string, worktree: number, branch: string) {
        return this.context.saveCardChange(path, (card) => setCardWorktreeAssignment(card, worktree, branch))
    }

    clearCardBranch(path: string) {
        return this.context.saveCardChange(path, clearCardBranch)
    }

    toggleCardPolicy(path: string, policyKey: string, saveReference?: OpenDocumentSaveReference): Card {
        return this.context.saveCardChange(path, (card) => toggleCardPolicy(card, policyKey), saveReference)
    }

    addAgentLogReference(path: string, reference: string) {
        const card = this.context.dependencies.requireCard(path)
        if (card.header.agentLogReferences.includes(reference)) return card.header.internalId

        const references = [...new Set([...card.header.agentLogReferences, reference])]
        this.context.saveCardChange(path, (currentCard) => setCardAgentLogReferences(currentCard, references))

        return card.header.internalId
    }

    setAgentLogReferences(path: string, references: string[], message = `Update ${path}`) {
        const card = this.context.dependencies.requireCard(path)
        const currentReferences = card.header.agentLogReferences
        const unchanged = currentReferences.length === references.length
            && currentReferences.every((reference, index) => reference === references[index])
        if (unchanged) return card

        return this.context.saveCardChange(
            path,
            (currentCard) => setCardAgentLogReferences(currentCard, references),
            undefined,
            message,
        )
    }

    ensureCardInternalIds() {
        return this.internalIds.ensureCardInternalIds()
    }

    updateCardTitle(path: string, title: string, saveReference?: OpenDocumentSaveReference) {
        return this.renames.updateCardTitle(path, title, saveReference)
    }

    updateCardType(path: string, type: CardType, saveReference?: OpenDocumentSaveReference) {
        return this.renames.updateCardType(path, type, saveReference)
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
        const updatedCards = this.context.applyOrderingUpdates(updates)
        const changes = updatedCards.map((card) => {
            const cardInternalId = card.header.internalId
            if (!cardInternalId) throw new Error(`Cannot move a card without an internal ID: ${card.path}`)

            return {
                cardInternalId,
                path: card.path,
                saveReference: this.context.findOpenCardDocument(card.path)?.createSaveReference(),
            }
        })
        commitBatcher.schedule(project.branch, changes, `Move ${cardPath}`)
        this.context.dependencies.dispatchPersistenceChanged()
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

    deferAutomaticCommit() {
        const { commitBatcher } = this.context.requireProject('defer automatic card commits')

        return commitBatcher.deferAutomaticFlush()
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

    requireCardByInternalId(internalId: string) {
        return this.context.dependencies.requireCardByInternalId(internalId)
    }
}
