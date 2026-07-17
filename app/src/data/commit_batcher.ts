import { AUTO_COMMIT_DELAY_MS, type CommitRequest, type MarkdownFile } from './data_types'

type DelayId = number

interface CommitBatcherDependencies {
    clearDelay: (delayId: DelayId) => void
    commit: (request: CommitRequest) => Promise<void>
    delayMs?: number
    onFlushError?: (error: unknown) => void
    onPendingChange: () => void
    setDelay: (callback: () => void, delayMs: number) => DelayId
}

export class CommitBatcher {
    private activeFlush: Promise<void> | null
    private readonly clearDelay
    private readonly commit
    private readonly delayMs
    private pendingBranch: string | null
    private readonly pendingFiles
    private readonly pendingMessagesByPath
    private readonly onFlushError: ((error: unknown) => void) | null
    private readonly onPendingChange: () => void
    private scheduledDelayId: DelayId | null
    private readonly setDelay

    constructor(dependencies: CommitBatcherDependencies) {
        this.activeFlush = null
        this.clearDelay = dependencies.clearDelay
        this.commit = dependencies.commit
        this.delayMs = dependencies.delayMs ?? AUTO_COMMIT_DELAY_MS
        this.pendingBranch = null
        this.pendingFiles = new Map<string, MarkdownFile>()
        this.pendingMessagesByPath = new Map<string, string[]>()
        this.onFlushError = dependencies.onFlushError ?? null
        this.onPendingChange = dependencies.onPendingChange
        this.scheduledDelayId = null
        this.setDelay = dependencies.setDelay
    }

    schedule(branch: string, files: MarkdownFile[], message: string) {
        this.pendingBranch = branch
        files.forEach((file) => {
            this.pendingFiles.set(file.path, file)
            this.addPendingMessage(file.path, message)
        })

        if (this.scheduledDelayId !== null) return

        this.scheduledDelayId = this.setDelay(this.createFlushCallback(), this.delayMs)
        this.onPendingChange()
    }

    hasPending() {
        return this.pendingFiles.size > 0 && this.pendingBranch !== null
    }

    hasPendingFile(path: string) {
        return this.pendingFiles.has(path)
    }

    discardPendingFile(path: string) {
        if (!this.pendingFiles.delete(path)) return

        this.pendingMessagesByPath.delete(path)
        if (this.pendingFiles.size === 0) {
            this.pendingBranch = null
            this.clearScheduledDelay()
        }
        this.onPendingChange()
    }

    async flush() {
        if (this.activeFlush) {
            await this.activeFlush
            if (this.hasPending()) await this.flush()
            return
        }
        if (!this.hasPending()) return

        this.clearScheduledDelay()
        const pendingFiles = [...this.pendingFiles.values()]
        const request = {
            branch: this.pendingBranch as string,
            files: pendingFiles,
            message: this.createCommitMessage(),
        }

        this.activeFlush = this.commitSnapshot(request, pendingFiles)
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

    private async commitSnapshot(request: CommitRequest, files: MarkdownFile[]) {
        await this.commit(request)
        for (const file of files) {
            if (this.pendingFiles.get(file.path) !== file) continue
            this.pendingFiles.delete(file.path)
            this.pendingMessagesByPath.delete(file.path)
        }
        if (this.pendingFiles.size === 0) this.pendingBranch = null
        this.onPendingChange()
    }

    private createCommitMessage() {
        const messages = [...this.pendingMessagesByPath.values()].flat()
        const distinctMessages = [...new Set(messages)]
        if (distinctMessages.length === 1) return distinctMessages[0]

        const body = distinctMessages.map((message) => `- ${message}`).join('\n')

        return `Update ${this.pendingFiles.size} files\n\n${body}`
    }

    private createFlushCallback() {
        return () => {
            void this.flush().catch((error: unknown) => this.onFlushError?.(error))
        }
    }

    private clearScheduledDelay() {
        if (this.scheduledDelayId === null) return

        this.clearDelay(this.scheduledDelayId)
        this.scheduledDelayId = null
    }
}
