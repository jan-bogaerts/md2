import { cardPathForId, desiredCardPath, getNextCardNumber } from '../../data/card_naming'
import { buildCardId, getCardIdPrefix } from '../../data/card_identifiers'
import type { Card, CardType, MarkdownFile } from '../../data/data_types'
import type { OpenDocumentSaveReference } from '../open_files_service'
import type { CardOperationContext } from './card_operation_context'
import { setCardHeaderFields, setCardTitle } from './card_mutations'
import { markdownParsingService } from './markdown_parsing_service'

/**
 * Card title edits and the file renames they trigger. Renames are serialized per card and
 * flushed on their own so a move never shares a commit batch entry with another edit.
 */
export class CardRenameOperations {
    private readonly context: CardOperationContext
    /** Tracks where renamed cards landed so queued title updates keep targeting the same card. */
    private readonly committedPathsByPath = new Map<string, string>()
    private readonly renameChainByPath = new Map<string, Promise<void>>()

    constructor(context: CardOperationContext) {
        this.context = context
    }

    /** Drops rename tracking that only applies to the previously open project. */
    reset() {
        this.committedPathsByPath.clear()
    }

    /** Saves the new title and, when it changes the card file name, renames the file. */
    async updateCardTitle(path: string, title: string, saveReference?: OpenDocumentSaveReference) {
        return this.queueRename(path, (currentPath) => this.applyCardTitle(currentPath, title, saveReference))
    }

    /** Changes a card id and path to the next number for the selected configured type. */
    async updateCardType(path: string, type: CardType, saveReference?: OpenDocumentSaveReference) {
        return this.queueRename(path, (currentPath) => this.applyCardType(currentPath, type, saveReference))
    }

    private queueRename(path: string, applyRename: (currentPath: string) => Promise<MarkdownFile> | MarkdownFile) {
        const pending = this.renameChainByPath.get(path) ?? Promise.resolve()
        const renameUpdate = pending.then(
            () => applyRename(this.committedPath(path)),
            () => applyRename(this.committedPath(path)),
        )
        const chained = renameUpdate.then(() => undefined, () => undefined)
        this.renameChainByPath.set(path, chained)
        void chained.then(() => {
            if (this.renameChainByPath.get(path) === chained) this.renameChainByPath.delete(path)
        })

        return renameUpdate
    }

    private async applyCardTitle(path: string, title: string, saveReference?: OpenDocumentSaveReference) {
        const { dependencies } = this.context
        const snapshot = dependencies.snapshot()
        const occupiedPaths = [
            ...dependencies.files().map((currentFile) => currentFile.path),
            ...(snapshot?.repositoryFiles ?? []),
        ]
        const targetPath = desiredCardPath(path, title, occupiedPaths)
        if (targetPath === path) {
            const card = this.context.saveCardChange(path, (currentCard) => setCardTitle(currentCard, title), saveReference)

            return markdownParsingService.serializeCard(card)
        }

        return this.renameCard(path, targetPath, (card) => setCardTitle(card, title), saveReference)
    }

    private async applyCardType(path: string, type: CardType, saveReference?: OpenDocumentSaveReference) {
        const { dependencies } = this.context
        const { config } = dependencies.requireDependencies()
        const cardType = config.cardTypes.find((candidate) => candidate.type === type)
        if (!cardType) throw new Error(`Unknown card type: ${type}`)

        const card = dependencies.requireCard(path)
        if (getCardIdPrefix(card.header.id) === cardType.idPrefix) return markdownParsingService.serializeCard(card)

        const number = getNextCardNumber(dependencies.files(), cardType.idPrefix)
        const id = buildCardId(cardType.idPrefix, number, config.cardSeparator)
        const targetPath = cardPathForId(path, id, card.header.title, config.cardSeparator)
        this.context.requireAvailablePath(targetPath)
        return this.renameCard(path, targetPath, (currentCard) => setCardHeaderFields(currentCard, { id }), saveReference)
    }

    /** Commits pending work, then commits the rename on its own so no other change shares its batch entry. */
    private async renameCard(
        path: string,
        targetPath: string,
        mutation: (card: Card) => void,
        saveReference?: OpenDocumentSaveReference,
    ) {
        const { dependencies } = this.context
        const { commitBatcher, config, project } = this.context.requireProject('rename a card')

        await this.context.flushPendingCommits()

        const card = this.context.mutateCardPreservingOpenBody(path, mutation, config.workingFolder)
        const cardInternalId = card.header.internalId
        if (!cardInternalId) throw new Error(`Cannot rename a card without an internal ID: ${path}`)
        const documentSaveReference = saveReference ?? this.context.findOpenCardDocument(path)?.createSaveReference()
        commitBatcher.schedulePathChange(
            project.branch,
            { cardInternalId, kind: 'card', path, saveReference: documentSaveReference, targetPath },
            `Rename ${path} to ${targetPath}`,
            (fromPath, toPath) => this.reconcileCardPath(fromPath, toPath),
        )
        dependencies.dispatchChanged()
        await this.context.flushPendingCommits()

        return markdownParsingService.serializeCard(card)
    }

    /** Moves local state onto the committed path and lets path-keyed callers follow the card. */
    private reconcileCardPath(fromPath: string, toPath: string) {
        if (fromPath === toPath) return

        const { dependencies } = this.context
        const { config } = dependencies.requireDependencies()
        dependencies.renameFile(fromPath, toPath, config.workingFolder)
        for (const [sourcePath, currentPath] of this.committedPathsByPath) {
            if (currentPath === fromPath) this.committedPathsByPath.set(sourcePath, toPath)
        }
        this.committedPathsByPath.set(fromPath, toPath)
        dependencies.cardPathChanged(fromPath, toPath)
        dependencies.dispatchChanged()
    }

    private committedPath(path: string) {
        return this.committedPathsByPath.get(path) ?? path
    }
}
