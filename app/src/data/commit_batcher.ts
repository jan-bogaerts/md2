import { AUTO_COMMIT_DELAY_MS, type CommitRequest, type MarkdownFile } from './data_types'

type DelayId = number

interface CommitBatcherDependencies {
    clearDelay: (delayId: DelayId) => void
    commit: (request: CommitRequest) => Promise<unknown>
    delayMs?: number
    onFlushError?: (error: unknown) => void
    onPendingChange: () => void
    setDelay: (callback: () => void, delayMs: number) => DelayId
}

interface PendingFileChange {
    file: MarkdownFile
    fromPath: string
    moveSource: boolean
    onCommitted?: (fromPath: string, toPath: string) => void
}

export class CommitBatcher {
    private activeFlush: Promise<void> | null
    private readonly clearDelay
    private readonly commit
    private readonly delayMs
    private pendingBranch: string | null
    private readonly pendingChanges
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
        this.pendingChanges = new Map<string, PendingFileChange>()
        this.pendingMessagesByPath = new Map<string, string[]>()
        this.onFlushError = dependencies.onFlushError ?? null
        this.onPendingChange = dependencies.onPendingChange
        this.scheduledDelayId = null
        this.setDelay = dependencies.setDelay
    }

    schedule(branch: string, files: MarkdownFile[], message: string) {
        this.pendingBranch = branch
        files.forEach((file) => {
            this.pendingChanges.set(file.path, { file, fromPath: file.path, moveSource: false })
            this.addPendingMessage(file.path, message)
        })

        this.scheduleFlush()
    }

    schedulePathChange(
        branch: string,
        fromPath: string,
        file: MarkdownFile,
        message: string,
        onCommitted: (fromPath: string, toPath: string) => void,
        sourceExists = true,
    ) {
        this.pendingBranch = branch
        this.pendingChanges.set(fromPath, { file, fromPath, moveSource: sourceExists, onCommitted })
        this.addPendingMessage(fromPath, message)

        this.scheduleFlush()
    }

    private scheduleFlush() {
        if (this.scheduledDelayId !== null) return

        this.scheduledDelayId = this.setDelay(this.createFlushCallback(), this.delayMs)
        this.onPendingChange()
    }

    hasPending() {
        return this.pendingChanges.size > 0 && this.pendingBranch !== null
    }

    hasPendingFile(path: string) {
        return [...this.pendingChanges.values()].some(({ file, fromPath }) => fromPath === path || file.path === path)
    }

    discardPendingFile(path: string) {
        const entry = [...this.pendingChanges.entries()].find(([, { file, fromPath }]) => (
            fromPath === path || file.path === path
        ))
        if (!entry) return

        const [changeKey] = entry
        this.pendingChanges.delete(changeKey)

        this.pendingMessagesByPath.delete(changeKey)
        if (this.pendingChanges.size === 0) {
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
        const pendingChanges = [...this.pendingChanges.values()]
        const files = pendingChanges
            .filter(({ moveSource }) => !moveSource)
            .map(({ file }) => file)
        const moves = pendingChanges
            .filter(({ moveSource }) => moveSource)
            .map(({ file, fromPath }) => ({
                content: file.content,
                ...(file.encoding ? { encoding: file.encoding } : {}),
                fromPath,
                ...(file.sha ? { sha: file.sha } : {}),
                toPath: file.path,
            }))
        const request = {
            branch: this.pendingBranch as string,
            files,
            message: this.createCommitMessage(),
            ...(moves.length > 0 ? { moves } : {}),
        }

        this.activeFlush = this.commitSnapshot(request, pendingChanges)
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

    private async commitSnapshot(request: CommitRequest, changes: PendingFileChange[]) {
        await this.commit(request)
        for (const change of changes) {
            const { file, fromPath, onCommitted } = change
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
            onCommitted?.(fromPath, file.path)
        }
        if (this.pendingChanges.size === 0) this.pendingBranch = null
        this.onPendingChange()
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
            void this.flush().catch((error: unknown) => this.onFlushError?.(error))
        }
    }

    private clearScheduledDelay() {
        if (this.scheduledDelayId === null) return

        this.clearDelay(this.scheduledDelayId)
        this.scheduledDelayId = null
    }
}
