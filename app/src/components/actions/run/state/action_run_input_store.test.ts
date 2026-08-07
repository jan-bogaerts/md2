import { describe, expect, it } from 'vitest'
import { ActionRunInputStore } from './action_run_input_store'

describe('ActionRunInputStore', () => {
    it('owns preset label and conversion message only', () => {
        const store = new ActionRunInputStore()
        store.setActionLabel('Review')
        store.setConvertMessage('Saved action')

        expect(store.getSnapshot()).toEqual({ actionLabel: 'Review', convertMessage: 'Saved action' })
    })
})
