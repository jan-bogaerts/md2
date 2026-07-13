import { register } from './service_injector'

export const GLOBAL_PROGRESS_EVENT = 'md2:global-progress'

export interface GlobalProgress {
    completed: number
    info: string
    total: number
}

/** Owns progress state for blocking application-wide operations. */
export class GlobalProgressService extends EventTarget {
    private progress: GlobalProgress | null = null

    constructor() {
        super()
        register('globalProgressService', this)
    }

    getProgress() {
        return this.progress
    }

    start(info: string, total: number) {
        if (info.length === 0) throw new Error('Global progress info is required')
        if (!Number.isInteger(total) || total <= 0) throw new Error('Global progress total must be a positive integer')

        this.progress = { completed: 0, info, total }
        this.dispatchChanged()
    }

    update(completed: number, info?: string) {
        const currentProgress = this.progress
        if (!currentProgress) throw new Error('Global progress has not started')
        if (!Number.isInteger(completed) || completed < 0 || completed > currentProgress.total) {
            throw new Error(`Global progress completed value must be between 0 and ${currentProgress.total}`)
        }

        this.progress = { ...currentProgress, completed, info: info ?? currentProgress.info }
        this.dispatchChanged()
    }

    finish() {
        if (!this.progress) return

        this.progress = null
        this.dispatchChanged()
    }

    private dispatchChanged() {
        this.dispatchEvent(new CustomEvent<GlobalProgress | null>(GLOBAL_PROGRESS_EVENT, { detail: this.progress }))
    }
}

export const globalProgressService = new GlobalProgressService()
