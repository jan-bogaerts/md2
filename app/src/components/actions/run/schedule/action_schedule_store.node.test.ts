import { describe, expect, it, vi } from 'vitest'
import { ActionScheduleStore } from './action_schedule_store'

describe('ActionScheduleStore', () => {
    it('publishes through EventTarget and exposes only active trigger fields', () => {
        const store = new ActionScheduleStore()
        const listener = vi.fn()
        const anchorElement = {} as HTMLElement
        store.subscribe(listener)

        store.toggle(anchorElement)
        store.setTimestamp('2099-07-07T10:30')
        store.setTriggerType('account-reset')

        expect(listener).toHaveBeenCalledTimes(3)
        expect(store.getSnapshot()).toEqual({agent: '', anchorElement, limitId: '', message: null, open: true, triggerType: 'account-reset', windowId: ''})
        expect(store.getSnapshot()).not.toHaveProperty('timestamp')
    })

    it('toggles anchored popup and clears stale registration message', () => {
        const store = new ActionScheduleStore()
        const listener = vi.fn()
        const anchorElement = {} as HTMLElement
        store.subscribe(listener)

        store.toggle(anchorElement)
        store.setMessage('Schedule registered')
        store.toggle(anchorElement)

        expect(store.getSnapshot()).toMatchObject({ anchorElement: null, message: null, open: false })
        expect(listener).toHaveBeenCalledTimes(3)

        store.toggle(anchorElement)
        expect(store.getSnapshot()).toMatchObject({ anchorElement, message: null, open: true })
    })

    it('closes an anchored popup while preserving its trigger draft', () => {
        const store = new ActionScheduleStore()
        const anchorElement = {} as HTMLElement
        store.setTimestamp('2099-07-07T10:30')
        store.toggle(anchorElement)

        store.close()

        expect(store.getSnapshot()).toMatchObject({ anchorElement: null, message: null, open: false, timestamp: '2099-07-07T10:30' })
    })

    it('preserves valid trigger drafts while switching', () => {
        const store = new ActionScheduleStore()
        store.setTimestamp('2099-07-07T10:30')
        store.setTriggerType('account-reset')
        store.setAgent('codex')
        store.setAccountTracker('codex,pro', 'primary')
        store.setTriggerType('card-state')
        store.setCardInternalId('card-2')
        store.setTargetState('ready')

        store.setTriggerType('at')
        expect(store.getSnapshot()).toMatchObject({ timestamp: '2099-07-07T10:30', triggerType: 'at' })
        store.setTriggerType('account-reset')
        expect(store.getSnapshot()).toMatchObject({ agent: 'codex', limitId: 'codex,pro', windowId: 'primary' })
        store.setTriggerType('card-state')
        expect(store.getSnapshot()).toMatchObject({ cardInternalId: 'card-2', targetState: 'ready' })
    })
})
