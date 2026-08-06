import { AUTO_COMMIT_DELAY_MS, type CommitRequest, type MarkdownFile } from './data_types'

import { markdownParsingService } from '../services/data/markdown_parsing_service'
import type { OpenDocumentSaveReference } from '../services/open_files_service'
import type { Card } from './data_types'

type DelayId = number

interface CommitBatcherOperations {
    commitFiles(request: CommitRequest): Promise<unknown>
    pushCommittedFiles(request: CommitRequest): Promise<unknown>
    requireCardByInternalId(internalId: string): Card
}

export const COMMIT_BATCHER_FLUSH_FAILED_EVENT = 'flushFailed'
export const COMMIT_BATCHER_PENDING_CHANGED_EVENT = 'pendingChanged'

interface PendingFileChange {
    change: CommitChange
    fromPath: string
    moveSource: boolean
    onCommitted?: (fromPath: string, toPath: string) => void
    onPersisted?: () => void
    saveReference?: OpenDocumentSaveReference
}

export interface CommitFileChange extends MarkdownFile {
    onPersisted?: () => void
    saveReference?: OpenDocumentSaveReference
}

export interface CommitCardChange {
    cardInternalId: string
    onPersisted?: () => void
    path: string
    saveReference?: OpenDocumentSaveReference
    targetPath?: string
}

export type CommitChange = CommitFileChange | CommitCardChange

function isCardChange(change: CommitChange): change is CommitCardChange {
    return 'cardInternalId' in change
}

function changePath(change: CommitChange) {
    return isCardChange(change) ? change.targetPath ?? change.path : change.path
}

interface SerializedChange {
    card: Card | null
    file: MarkdownFile
}

function serializeChange(change: CommitChange, cardOperations: CommitBatcherOperations): SerializedChange {
    if (!isCardChange(change)) {
        const file = {
            content: change.content,
            ...(change.encoding ? { encoding: change.encoding } : {}),
            path: change.path,
            ...(change.sha ? { sha: change.sha } : {}),
        }

        return { card: null, file }
    }

    const card = cardOperations.requireCardByInternalId(change.cardInternalId)
    const file = { ...markdownParsingService.serializeCard(card), path: changePath(change) }

    return { card, file }
}

export class CommitBatcher extends EventTarget {
    private activeFlush: Promise<void> | null
    private automaticFlushDeferrals: number
    private readonly cardOperations: CommitBatcherOperations
    private readonly delayMs
    private pendingBranch: string | null
    private readonly pendingChanges
    private readonly pendingMessagesByPath
    private scheduledDelayId: DelayId | null

    constructor(cardOperations: CommitBatcherOperations, delayMs = AUTO_COMMIT_DELAY_MS) {
        super()
        this.activeFlush = null
        this.automaticFlushDeferrals = 0
        this.cardOperations = cardOperations
        this.delayMs = delayMs
        this.pendingBranch = null
        this.pendingChanges = new Map<string, PendingFileChange>()
        this.pendingMessagesByPath = new Map<string, string[]>()
        this.scheduledDelayId = null
    }

    schedule(branch: string, changes: CommitChange[], message: string) {
        this.pendingBranch = branch
        changes.forEach((change) => {
            const path = changePath(change)
            this.pendingChanges.set(path, {
                change,
                fromPath: path,
                moveSource: false,
                onPersisted: change.onPersisted,
                saveReference: change.saveReference,
            })
            this.addPendingMessage(path, message)
        })

        this.scheduleFlush()
    }

    schedulePathChange(
        branch: string,
        fromPath: string,
        change: CommitChange,
        message: string,
        onCommitted: (fromPath: string, toPath: string) => void,
        sourceExists = true,
    ) {
        this.pendingBranch = branch
        this.pendingChanges.set(fromPath, {
            change,
            fromPath,
            moveSource: sourceExists,
            onCommitted,
            onPersisted: change.onPersisted,
            saveReference: change.saveReference,
        })
        this.addPendingMessage(fromPath, message)

        this.scheduleFlush()
    }

    private scheduleFlush() {
        this.clearScheduledDelay()
        if (this.automaticFlushDeferrals > 0) {
            this.dispatchEvent(new Event(COMMIT_BATCHER_PENDING_CHANGED_EVENT))
            return
        }
        this.scheduledDelayId = window.setTimeout(this.createFlushCallback(), this.delayMs)
        this.dispatchEvent(new Event(COMMIT_BATCHER_PENDING_CHANGED_EVENT))
    }

    /** Pauses timer-driven flushes while one caller adds fields that must share a card version. */
    deferAutomaticFlush() {
        this.automaticFlushDeferrals += 1
        this.clearScheduledDelay()
        let released = false

        return () => {
            if (released) return

            released = true
            this.automaticFlushDeferrals -= 1
            if (this.automaticFlushDeferrals === 0 && this.hasPending()) this.scheduleFlush()
        }
    }

    hasPending() {
        return this.pendingChanges.size > 0 && this.pendingBranch !== null
    }

    hasPendingFile(path: string) {
        return [...this.pendingChanges.values()].some(({ change, fromPath }) => (
            fromPath === path || changePath(change) === path
        ))
    }

    discardPendingFile(path: string) {
        const entry = [...this.pendingChanges.entries()].find(([, { change, fromPath }]) => (
            fromPath === path || changePath(change) === path
        ))
        if (!entry) return

        const [changeKey] = entry
        this.pendingChanges.delete(changeKey)

        this.pendingMessagesByPath.delete(changeKey)
        if (this.pendingChanges.size === 0) {
            this.pendingBranch = null
            this.clearScheduledDelay()
        }
        this.dispatchEvent(new Event(COMMIT_BATCHER_PENDING_CHANGED_EVENT))
    }

    async flush() {
        if (this.activeFlush) {
            await this.activeFlush
            if (this.hasPending()) await this.flush()
            return
        }
        if (!this.hasPending()) return

        this.clearScheduledDelay()
        const pendingChanges = [...this.pendingChanges.values()]
        const serializedChanges = new Map(
            pendingChanges.map((change) => [change, serializeChange(change.change, this.cardOperations)]),
        )
        const files = pendingChanges
            .filter(({ moveSource }) => !moveSource)
            .map((change) => (serializedChanges.get(change) as SerializedChange).file)
        const moves = pendingChanges
            .filter(({ moveSource }) => moveSource)
            .map((change) => {
                const { file } = serializedChanges.get(change) as SerializedChange

                return {
                    content: file.content,
                    ...(file.encoding ? { encoding: file.encoding } : {}),
                    fromPath: change.fromPath,
                    ...(file.sha ? { sha: file.sha } : {}),
                    toPath: file.path,
                }
            })
        const request = {
            branch: this.pendingBranch as string,
            files,
            message: this.createCommitMessage(),
            ...(moves.length > 0 ? { moves } : {}),
        }

        this.activeFlush = this.commitSnapshot(request, pendingChanges, serializedChanges)
        try {
            await this.activeFlush
        } finally {
            this.activeFlush = null
        }
    }

    private addPendingMessage(path: string, message: string) {
        const messages = this.pendingMessagesByPath.get(path) ?? []
        if (messages.includes(message)) return

        this.pendingMessagesByPath.set(path, [...messages, message])
    }

    private async commitSnapshot(
        request: CommitRequest,
        changes: PendingFileChange[],
        serializedChanges: Map<PendingFileChange, SerializedChange>,
    ) {
        await this.cardOperations.commitFiles(request)
        for (const change of changes) {
            const { fromPath, onCommitted, onPersisted, saveReference } = change
            const { card, file } = serializedChanges.get(change) as SerializedChange
            const current = this.pendingChanges.get(fromPath)
            if (current === change) {
                this.pendingChanges.delete(fromPath)
                this.pendingMessagesByPath.delete(fromPath)
            } else if (current && file.path !== fromPath) {
                this.pendingChanges.delete(fromPath)
                this.pendingChanges.set(file.path, { ...current, fromPath: file.path, moveSource: true })
                const messages = this.pendingMessagesByPath.get(fromPath)
                this.pendingMessagesByPath.delete(fromPath)
                if (messages) this.pendingMessagesByPath.set(file.path, messages)
            }
            if (card) markdownParsingService.acknowledgeSerializedCard(card, file)
            saveReference?.acknowledge()
            onPersisted?.()
            onCommitted?.(fromPath, file.path)
        }
        if (this.pendingChanges.size === 0) this.pendingBranch = null
        this.dispatchEvent(new Event(COMMIT_BATCHER_PENDING_CHANGED_EVENT))
        await this.cardOperations.pushCommittedFiles(request)
    }

    private createCommitMessage() {
        const messages = [...this.pendingMessagesByPath.values()].flat()
        const distinctMessages = [...new Set(messages)]
        if (distinctMessages.length === 1) return distinctMessages[0]

        const body = distinctMessages.map((message) => `- ${message}`).join('\n')

        return `Update ${this.pendingChanges.size} files\n\n${body}`
    }

    private createFlushCallback() {
        return () => {
            void this.flush().catch((error: unknown) => {
                this.dispatchEvent(new CustomEvent(COMMIT_BATCHER_FLUSH_FAILED_EVENT, { detail: error }))
            })
        }
    }

    private clearScheduledDelay() {
        if (this.scheduledDelayId === null) return

        window.clearTimeout(this.scheduledDelayId)
        this.scheduledDelayId = null
    }
}
