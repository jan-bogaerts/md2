import { describe, expect, it, vi } from 'vitest'
import { CardDragDropService } from './card_drag_drop_service'

describe('CardDragDropService', () => {
    it('publishes active card overlay state independently', () => {
        const service = new CardDragDropService()
        const listener = vi.fn()
        service.subscribeOverlay(listener)

        service.startDrag('design/F-1.md', 107, 235)

        expect(service.getOverlaySnapshot()).toEqual({ cardPath: 'design/F-1.md', width: 235 })
        expect(listener).toHaveBeenCalledOnce()

        service.endDrag()

        expect(service.getOverlaySnapshot()).toEqual({ cardPath: null, width: null })
        expect(listener).toHaveBeenCalledTimes(2)
    })

    it('notifies only the column receiving a drop preview', () => {
        const service = new CardDragDropService()
        const todoListener = vi.fn()
        const doneListener = vi.fn()
        service.subscribeColumn('todo', todoListener)
        service.subscribeColumn('done', doneListener)
        service.startDrag('design/F-1.md', 107, 235)

        service.setDropPreview({ targetIndex: 1, targetStatus: 'done' })

        expect(service.getColumnPreview('todo')).toBeNull()
        expect(service.getColumnPreview('done')).toEqual({ dropPreviewHeight: 107, dropPreviewIndex: 1 })
        expect(todoListener).not.toHaveBeenCalled()
        expect(doneListener).toHaveBeenCalledOnce()
    })

    it('suppresses equivalent preview updates', () => {
        const service = new CardDragDropService()
        const listener = vi.fn()
        service.subscribeColumn('done', listener)
        service.startDrag('design/F-1.md', 107, 235)
        service.setDropPreview({ targetIndex: 1, targetStatus: 'done' })

        service.setDropPreview({ targetIndex: 1, targetStatus: 'done' })

        expect(listener).toHaveBeenCalledOnce()
    })

    it('notifies old and new columns when the preview changes status', () => {
        const service = new CardDragDropService()
        const todoListener = vi.fn()
        const doneListener = vi.fn()
        service.subscribeColumn('todo', todoListener)
        service.subscribeColumn('done', doneListener)
        service.startDrag('design/F-1.md', 107, 235)
        service.setDropPreview({ targetIndex: 0, targetStatus: 'todo' })
        todoListener.mockClear()

        service.setDropPreview({ targetIndex: 1, targetStatus: 'done' })

        expect(service.getColumnPreview('todo')).toBeNull()
        expect(service.getColumnPreview('done')).toEqual({ dropPreviewHeight: 107, dropPreviewIndex: 1 })
        expect(todoListener).toHaveBeenCalledOnce()
        expect(doneListener).toHaveBeenCalledOnce()
    })

    it('fails when previewing without an active drag', () => {
        const service = new CardDragDropService()

        expect(() => service.setDropPreview({ targetIndex: 0, targetStatus: 'todo' }))
            .toThrow('Cannot preview a card drop without an active drag')
    })
})
