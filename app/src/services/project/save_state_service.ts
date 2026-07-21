import type { StorageService } from '../../data/data_types'

const SAVE_STATE_EVENT = 'changed'
const STORAGE_SAVE_METHODS = new Set<PropertyKey>([
    'addWorktree',
    'cancelActionSchedule',
    'commit',
    'createProject',
    'createWorkingFolderFromTemplate',
    'deleteFile',
    'deleteFolder',
    'moveFiles',
    'removeWorktree',
    'saveActionSchedules',
    'saveProjectConfig',
])

export interface SaveState {
    isSaving: boolean
}

/** Tracks active local persistence operations for global UI state. */
export class SaveStateService extends EventTarget {
    private activeSaveCount = 0

    beginSave() {
        this.activeSaveCount += 1
        if (this.activeSaveCount === 1) this.dispatchChanged()

        let finished = false

        return () => {
            if (finished) return
            finished = true
            this.activeSaveCount -= 1
            if (this.activeSaveCount === 0) this.dispatchChanged()
        }
    }

    getState(): SaveState {
        return { isSaving: this.activeSaveCount > 0 }
    }

    async track<T>(operation: () => Promise<T>): Promise<T> {
        const finish = this.beginSave()

        try {
            return await operation()
        } finally {
            finish()
        }
    }

    private dispatchChanged() {
        this.dispatchEvent(new CustomEvent<SaveState>(SAVE_STATE_EVENT, { detail: this.getState() }))
    }
}

/** Wrap storage mutations so every persisted project change contributes to save state. */
export function withSaveStateTracking(storage: StorageService, saveStateService: SaveStateService): StorageService {
    return new Proxy(storage, {
        get(target, property, receiver) {
            const value: unknown = Reflect.get(target, property, receiver)
            if (typeof value !== 'function') return value

            const storageMethod = value.bind(target) as (...parameters: unknown[]) => unknown
            if (!STORAGE_SAVE_METHODS.has(property)) return storageMethod

            return (...parameters: unknown[]) => saveStateService.track(async () => (
                await storageMethod(...parameters)
            ))
        },
    })
}
