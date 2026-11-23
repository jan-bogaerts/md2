import { applicationStorage } from '../../../../services/storage/application_storage'

export const ACTION_VISIBILITY_MODE_STORAGE_KEY = 'md2.actionVisibilityMode'
export const ACTION_VISIBILITY_MODE_CHANGED_EVENT = 'changed'

export const ACTION_VISIBILITY_MODES = [
    { label: 'All', value: 'all' },
    { label: 'Specific for context', value: 'specific-for-context' },
    { label: 'Has conversation log', value: 'has-conversation-log' },
] as const

export type ActionVisibilityMode = typeof ACTION_VISIBILITY_MODES[number]['value']

interface ActionVisibilityStorage {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
}

function isActionVisibilityMode(value: string): value is ActionVisibilityMode {
    return ACTION_VISIBILITY_MODES.some((mode) => mode.value === value)
}

/** Owns the optional global action-visibility preference and persists explicit user choices. */
export class ActionVisibilityModeStore extends EventTarget {
    private reportedInvalidValue: string | null = null
    private readonly storage: ActionVisibilityStorage

    constructor(storage: ActionVisibilityStorage = applicationStorage) {
        super()
        this.storage = storage
    }

    readonly getSnapshot = (): ActionVisibilityMode | null => {
        const storedValue = this.storage.getItem(ACTION_VISIBILITY_MODE_STORAGE_KEY)
        if (storedValue !== null && !isActionVisibilityMode(storedValue) && this.reportedInvalidValue !== storedValue) {
            console.error(`Invalid stored action visibility mode: ${storedValue}`)
            this.reportedInvalidValue = storedValue
        }

        return storedValue !== null && isActionVisibilityMode(storedValue) ? storedValue : null
    }

    readonly subscribe = (listener: () => void) => {
        this.addEventListener(ACTION_VISIBILITY_MODE_CHANGED_EVENT, listener)

        return () => this.removeEventListener(ACTION_VISIBILITY_MODE_CHANGED_EVENT, listener)
    }

    setMode(mode: ActionVisibilityMode) {
        if (this.getSnapshot() === mode) return

        this.storage.setItem(ACTION_VISIBILITY_MODE_STORAGE_KEY, mode)
        this.reportedInvalidValue = null
        this.dispatchEvent(new Event(ACTION_VISIBILITY_MODE_CHANGED_EVENT))
    }
}

export const actionVisibilityModeStore = new ActionVisibilityModeStore()
