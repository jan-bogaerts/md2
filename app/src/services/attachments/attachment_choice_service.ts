import { getOriginalFilePaths } from '../../data/electron_file_bridge'
import { register } from '../service_injector'

export type AttachmentLocationChoice = 'copy' | 'original'

export interface AttachmentChoiceSnapshot {
    fileCount: number
    fileNames: string[]
    originalLocationAvailable: boolean
}

interface PendingAttachmentChoice {
    originalPaths: string[] | null
    resolve: (choice: AttachmentSelection | null) => void
    snapshot: AttachmentChoiceSnapshot
}

export interface AttachmentSelection {
    choice: AttachmentLocationChoice
    originalPaths: string[] | null
}

/** Owns one application-wide attachment location decision. */
export class AttachmentChoiceService extends EventTarget {
    private pending: PendingAttachmentChoice | null = null

    constructor() {
        super()
        register('attachmentChoiceService', this)
    }

    readonly getSnapshot = () => this.pending?.snapshot ?? null

    readonly subscribe = (listener: () => void) => {
        this.addEventListener('changed', listener)

        return () => this.removeEventListener('changed', listener)
    }

    choose(files: File[]) {
        if (files.length === 0) throw new Error('Cannot choose attachment location without files')
        if (this.pending) throw new Error('Another attachment choice is already open')

        const originalPaths = getOriginalFilePaths(files)
        const snapshot = {
            fileCount: files.length,
            fileNames: files.map(({ name }) => name),
            originalLocationAvailable: originalPaths !== null,
        }

        return new Promise<AttachmentSelection | null>((resolve) => {
            this.pending = { originalPaths, resolve, snapshot }
            this.dispatchEvent(new Event('changed'))
        })
    }

    cancel() {
        this.complete(null)
    }

    select(choice: AttachmentLocationChoice) {
        const pending = this.pending
        if (!pending) throw new Error('No attachment choice is open')
        if (choice === 'original' && !pending.originalPaths) throw new Error('Original file locations are unavailable')

        this.complete({ choice, originalPaths: choice === 'original' ? pending.originalPaths : null })
    }

    private complete(selection: AttachmentSelection | null) {
        const pending = this.pending
        if (!pending) return

        this.pending = null
        pending.resolve(selection)
        this.dispatchEvent(new Event('changed'))
    }
}

export const attachmentChoiceService = new AttachmentChoiceService()
