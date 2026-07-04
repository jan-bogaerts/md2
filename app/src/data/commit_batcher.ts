import { AUTO_COMMIT_DELAY_MS, type CommitRequest, type MarkdownFile } from './data_types'

type DelayId = ReturnType<typeof window.setTimeout>

interface CommitBatcherDependencies {
    clearDelay: (delayId: DelayId) => void
    commit: (request: CommitRequest) => Promise<void>
    delayMs?: number
    setDelay: (callback: () => void, delayMs: number) => DelayId
}

export class CommitBatcher {
    private readonly clearDelay
    private readonly commit
    private readonly delayMs
    private pendingBranch: string | null
    private readonly pendingFiles
    private pendingMessage: string | null
    private scheduledDelayId: DelayId | null
    private readonly setDelay

    constructor(dependencies: CommitBatcherDependencies) {
        this.clearDelay = dependencies.clearDelay
        this.commit = dependencies.commit
        this.delayMs = dependencies.delayMs ?? AUTO_COMMIT_DELAY_MS
        this.pendingBranch = null
        this.pendingFiles = new Map<string, MarkdownFile>()
        this.pendingMessage = null
        this.scheduledDelayId = null
        this.setDelay = dependencies.setDelay
    }

    schedule(branch: string, files: MarkdownFile[], message: string) {
        this.pendingBranch = branch
        this.pendingMessage = message
        files.forEach((file) => this.pendingFiles.set(file.path, file))

        if (this.scheduledDelayId !== null) return

        this.scheduledDelayId = this.setDelay(this.createFlushCallback(), this.delayMs)
    }

    async flush() {
        if (this.pendingFiles.size === 0 || this.pendingBranch === null || this.pendingMessage === null) return

        this.clearScheduledDelay()
        const request = {
            branch: this.pendingBranch,
            files: [...this.pendingFiles.values()],
            message: this.pendingMessage,
        }

        this.pendingBranch = null
        this.pendingMessage = null
        this.pendingFiles.clear()
        await this.commit(request)
    }

    private createFlushCallback() {
        return () => {
            void this.flush()
        }
    }

    private clearScheduledDelay() {
        if (this.scheduledDelayId === null) return

        this.clearDelay(this.scheduledDelayId)
        this.scheduledDelayId = null
    }
}
