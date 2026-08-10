import { describe, expect, it, vi } from 'vitest'
import { ActionUsageScopeStore } from './action_usage_scope_store'

describe('ActionUsageScopeStore', () => {
    it('defaults to action/card and toggles all usage through one scope', () => {
        const store = new ActionUsageScopeStore()
        const listener = vi.fn()
        store.subscribe(listener)

        expect(store.getSnapshot()).toBe('actionCard')

        store.toggle(true)
        expect(store.getSnapshot()).toBe('conversation')

        store.toggle(true)
        expect(store.getSnapshot()).toBe('actionCard')
        expect(listener).toHaveBeenCalledTimes(2)
    })

    it('does not select conversation scope when no conversation is available', () => {
        const store = new ActionUsageScopeStore()
        const listener = vi.fn()
        store.subscribe(listener)

        store.toggle(false)

        expect(store.getSnapshot()).toBe('actionCard')
        expect(listener).not.toHaveBeenCalled()
    })

    it('returns to action/card scope when conversation becomes unavailable', () => {
        const store = new ActionUsageScopeStore()
        store.toggle(true)

        store.useActionCardScope()

        expect(store.getSnapshot()).toBe('actionCard')
    })
})
