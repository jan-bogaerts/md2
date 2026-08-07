import { describe, expect, it, vi } from 'vitest'
import { MobileCardViewService } from './mobile_card_view_service'

describe('MobileCardViewService', () => {
    it('selects first visible column by default', () => {
        const service = new MobileCardViewService()

        service.selectVisibleColumn(['todo', 'done'])

        expect(service.getSnapshot().selectedColumnStatus).toBe('todo')
    })

    it('keeps visible selection and falls back when it disappears', () => {
        const service = new MobileCardViewService()
        service.selectColumn('done')

        service.selectVisibleColumn(['todo', 'done'])
        expect(service.getSnapshot().selectedColumnStatus).toBe('done')

        service.selectVisibleColumn(['todo'])
        expect(service.getSnapshot().selectedColumnStatus).toBe('todo')
    })

    it('publishes only changed selections', () => {
        const service = new MobileCardViewService()
        const listener = vi.fn()
        service.addEventListener('changed', listener)

        service.selectColumn('todo')
        service.selectColumn('todo')

        expect(listener).toHaveBeenCalledOnce()
    })
})
