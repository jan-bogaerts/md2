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

interface CommitChangeBase {
    onPersisted?: () => void
    saveReference?: OpenDocumentSaveReference
}

export interface CommitFileChange extends MarkdownFile, CommitChangeBase {
    kind: 'file'
}

export interface CommitCardChange extends CommitChangeBase {
    cardInternalId: string
    kind: 'card'
    path: string
    targetPath?: string
}

export interface CommitActionChange extends MarkdownFile, CommitChangeBase {
    actionId: string
    kind: 'action'
    onPathCommitted?: (fromPath: string, toPath: string) => void
    sourcePath: string
}

export type CommitChange = CommitActionChange | CommitCardChange | CommitFileChange

interface PendingChange {
    change: CommitChange
    messages: string[]
    onPathCommitted?: (fromPath: string, toPath: string) => void
}

interface SerializedChange {
    card: Card | null
    file: MarkdownFile
    sourcePath: string
}

function changeKey(change: CommitChange) {
    if (change.kind === 'card') return `card:${change.cardInternalId}`
    if (change.kind === 'action') return `action:${change.actionId}`

    return `file:${change.path}`
}

function changeSourcePath(change: CommitChange) {
    if (change.kind === 'action') return change.sourcePath

    return change.path
}

function changeTargetPath(change: CommitChange) {
    return change.kind === 'card' ? change.targetPath ?? change.path : change.path
}

function serializeChange(change: CommitChange, cardOperations: CommitBatcherOperations): SerializedChange {
    const sourcePath = changeSourcePath(change)
    if (change.kind !== 'card') {
        const file = {
            content: change.content,
            ...(change.encoding ? { encoding: change.encoding } : {}),
            path: change.path,
            ...(change.sha ? { sha: change.sha } : {}),
        }

        return { card: null, file, sourcePath }
    }

    const card = cardOperations.requireCardByInternalId(change.cardInternalId)
    const file = { ...markdownParsingService.serializeCard(card), path: changeTargetPath(change) }

    return { card, file, sourcePath }
}

function rebaseChangeSource(change: CommitChange, sourcePath: string): CommitChange {
    if (change.kind === 'action') return { ...change, sourcePath }
    if (change.kind === 'card') return { ...change, path: sourcePath }

    return change
}

function createCommitMessage(changes: Map<string, PendingChange>) {
    const messages = [...changes.values()].flatMap(({ messages: entryMessages }) => entryMessages)
    const distinctMessages = [...new Set(messages)]
    if (distinctMessages.length === 1) return distinctMessages[0]

    const body = distinctMessages.map((message) => `- ${message}`).join('\n')

    return `Update ${changes.size} files\n\n${body}`
}

export class CommitBatcher extends EventTarget {
    private activeFlush: Promise<void> | null
    private automaticFlushDeferrals: number
    private readonly cardOperations: CommitBatcherOperations
    private readonly delayMs
    private pendingBranch: string | null
    private pendingChanges: Map<string, PendingChange>
    private scheduledDelayId: DelayId | null

    constructor(cardOperations: CommitBatcherOperations, delayMs = AUTO_COMMIT_DELAY_MS) {
        super()
        this.activeFlush = null
        this.automaticFlushDeferrals = 0
        this.cardOperations = cardOperations
        this.delayMs = delayMs
        this.pendingBranch = null
        this.pendingChanges = new Map()
        this.scheduledDelayId = null
    }

    schedule(branch: string, changes: CommitChange[], message: string) {
        this.pendingBranch = branch
        changes.forEach((change) => this.addPendingChange(change, message))
        this.scheduleFlush()
    }

    schedulePathChange(
        branch: string,
        change: CommitCardChange,
        message: string,
        onPathCommitted: (fromPath: string, toPath: string) => void,
    ) {
        this.pendingBranch = branch
        this.addPendingChange(change, message, onPathCommitted)
        this.scheduleFlush()
    }

    private addPendingChange(
        change: CommitChange,
        message: string,
        onPathCommitted = change.kind === 'action' ? change.onPathCommitted : undefined,
    ) {
        const key = changeKey(change)
        const existingMessages = this.pendingChanges.get(key)?.messages ?? []
        const messages = existingMessages.includes(message) ? existingMessages : [...existingMessages, message]
        this.pendingChanges.set(key, { change, messages, onPathCommitted })
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
        return [...this.pendingChanges.values()].some(({ change }) => (
            changeSourcePath(change) === path || changeTargetPath(change) === path
        ))
    }

    discardPendingFile(path: string) {
        const entry = [...this.pendingChanges.entries()].find(([, { change }]) => (
            changeSourcePath(change) === path || changeTargetPath(change) === path
        ))
        if (!entry) return

        this.pendingChanges.delete(entry[0])
        if (this.pendingChanges.size === 0) {
            this.pendingBranch = null
            this.clearScheduledDelay()
        }
        this.dispatchEvent(new Event(COMMIT_BATCHER_PENDING_CHANGED_EVENT))
    }

    async flush() {
        const currentFlush = this.activeFlush
        if (currentFlush) await currentFlush
        if (!this.hasPending()) return
        if (this.activeFlush) {
            await this.activeFlush
            return
        }

        this.clearScheduledDelay()
        const branch = this.pendingBranch as string
        const activeBatch = this.pendingChanges
        this.pendingChanges = new Map()
        this.pendingBranch = null
        this.dispatchEvent(new Event(COMMIT_BATCHER_PENDING_CHANGED_EVENT))
        this.activeFlush = this.commitActiveBatch(branch, activeBatch)
        try {
            await this.activeFlush
        } finally {
            this.activeFlush = null
        }
    }

    private async commitActiveBatch(branch: string, activeBatch: Map<string, PendingChange>) {
        const serializedChanges = new Map(
            [...activeBatch.entries()].map(([key, { change }]) => [key, serializeChange(change, this.cardOperations)]),
        )
        const files: MarkdownFile[] = []
        const moves = []
        for (const [key] of activeBatch) {
            const { file, sourcePath } = serializedChanges.get(key) as SerializedChange
            if (sourcePath === file.path) files.push(file)
            else {
                moves.push({
                    content: file.content,
                    ...(file.encoding ? { encoding: file.encoding } : {}),
                    fromPath: sourcePath,
                    ...(file.sha ? { sha: file.sha } : {}),
                    toPath: file.path,
                })
            }
        }
        const request = {
            branch,
            files,
            message: createCommitMessage(activeBatch),
            ...(moves.length > 0 ? { moves } : {}),
        }

        try {
            await this.cardOperations.commitFiles(request)
        } catch (error) {
            this.restoreFailedBatch(branch, activeBatch)
            throw error
        }

        for (const [key, { change, onPathCommitted }] of activeBatch) {
            const { card, file, sourcePath } = serializedChanges.get(key) as SerializedChange
            const newerPendingChange = this.pendingChanges.get(key)
            if (newerPendingChange && sourcePath !== file.path) {
                this.pendingChanges.set(key, {
                    ...newerPendingChange,
                    change: rebaseChangeSource(newerPendingChange.change, file.path),
                })
            }
            if (card) markdownParsingService.acknowledgeSerializedCard(card, file)
            change.saveReference?.acknowledge()
            change.onPersisted?.()
            onPathCommitted?.(sourcePath, file.path)
        }
        this.dispatchEvent(new Event(COMMIT_BATCHER_PENDING_CHANGED_EVENT))
        await this.cardOperations.pushCommittedFiles(request)
    }

    private restoreFailedBatch(branch: string, activeBatch: Map<string, PendingChange>) {
        for (const [key, entry] of activeBatch) {
            if (!this.pendingChanges.has(key)) this.pendingChanges.set(key, entry)
        }
        if (this.pendingChanges.size > 0 && this.pendingBranch === null) this.pendingBranch = branch
        this.dispatchEvent(new Event(COMMIT_BATCHER_PENDING_CHANGED_EVENT))
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
