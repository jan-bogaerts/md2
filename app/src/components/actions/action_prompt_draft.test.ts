import { describe, expect, it, vi } from 'vitest'
import { ActionPromptDraft } from './action_prompt_draft'

describe('ActionPromptDraft', () => {
    it('publishes changed prompt values to subscribers', () => {
        const draft = new ActionPromptDraft('')
        const listener = vi.fn()
        const unsubscribe = draft.subscribe(listener)

        draft.set('Plan')
        draft.set('Plan')
        unsubscribe()
        draft.set('Review')

        expect(listener).toHaveBeenCalledTimes(1)
        expect(draft.getSnapshot()).toBe('Review')
    })
})
