import { describe, expect, it, vi } from 'vitest'
import { MarkdownEditorStateStore } from './markdown_editor_state_store'

describe('MarkdownEditorStateStore', () => {
    it('emits only when dirty state changes', () => {
        const store = new MarkdownEditorStateStore()
        const changed = vi.fn()
        const unsubscribe = store.subscribe(changed)

        store.setDirty(true)
        store.setDirty(true)
        store.setDirty(false)
        unsubscribe()

        expect(changed).toHaveBeenCalledTimes(2)
        expect(store.getSnapshot()).toBe(false)
    })
})
