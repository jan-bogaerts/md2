import { describe, expect, it, vi } from 'vitest'
import {
    ACTION_VISIBILITY_MODE_STORAGE_KEY,
    ActionVisibilityModeStore,
} from './action_visibility_mode_store'

function memoryStorage(initialValue: string | null = null) {
    let value = initialValue

    return {
        getItem: vi.fn(() => value),
        setItem: vi.fn((_key: string, nextValue: string) => {
            value = nextValue
        }),
    }
}

describe('ActionVisibilityModeStore', () => {
    it('returns null when no preference is stored', () => {
        const storage = memoryStorage()
        const store = new ActionVisibilityModeStore(storage)

        expect(store.getSnapshot()).toBeNull()
        expect(store.getSnapshot()).toBeNull()
        expect(storage.getItem).toHaveBeenCalledTimes(2)
        expect(storage.getItem).toHaveBeenCalledWith(ACTION_VISIBILITY_MODE_STORAGE_KEY)
    })

    it('loads a persisted explicit preference', () => {
        const store = new ActionVisibilityModeStore(memoryStorage('has-conversation-log'))

        expect(store.getSnapshot()).toBe('has-conversation-log')
    })

    it('persists and publishes a changed preference once', () => {
        const storage = memoryStorage()
        const store = new ActionVisibilityModeStore(storage)
        const listener = vi.fn()
        const unsubscribe = store.subscribe(listener)

        store.setMode('all')
        store.setMode('all')

        expect(storage.setItem).toHaveBeenCalledOnce()
        expect(storage.setItem).toHaveBeenCalledWith(ACTION_VISIBILITY_MODE_STORAGE_KEY, 'all')
        expect(store.getSnapshot()).toBe('all')
        expect(listener).toHaveBeenCalledOnce()
        unsubscribe()
    })

    it('reports and ignores an invalid stored preference', () => {
        const report = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const store = new ActionVisibilityModeStore(memoryStorage('invalid'))

        expect(store.getSnapshot()).toBeNull()
        expect(report).toHaveBeenCalledWith('Invalid stored action visibility mode: invalid')
    })
})
