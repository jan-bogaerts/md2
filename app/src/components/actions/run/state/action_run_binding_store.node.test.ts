import { describe, expect, it, vi } from 'vitest'
import { ActionRunBindingStore } from './action_run_binding_store'

describe('ActionRunBindingStore', () => {
    it('publishes run selection changes and represents New conversation with null', () => {
        const store = new ActionRunBindingStore('run-1')
        const listener = vi.fn()
        const unsubscribe = store.subscribe(listener)

        store.setRunId('run-1')
        store.setRunId('run-2')
        store.setRunId(null)

        expect(listener).toHaveBeenCalledTimes(2)
        expect(store.getSnapshot()).toBeNull()
        unsubscribe()
    })
})
