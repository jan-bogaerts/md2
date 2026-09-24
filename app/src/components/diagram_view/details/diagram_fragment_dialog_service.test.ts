import { describe, expect, it, vi } from 'vitest'
import { DiagramFragmentDialogService } from './diagram_fragment_dialog_service'

describe('DiagramFragmentDialogService', () => {
    it('publishes create, edit, and close targets without duplicate events', () => {
        const service = new DiagramFragmentDialogService()
        const listener = vi.fn()
        service.subscribeTarget(listener)

        expect(service.openCreate()).toBe(true)
        expect(service.getTargetSnapshot()).toEqual({ fragmentId: null })
        expect(service.openCreate()).toBe(false)
        expect(service.openEdit('fragment-1')).toBe(true)
        expect(service.getTargetSnapshot()).toEqual({ fragmentId: 'fragment-1' })
        expect(service.openEdit('fragment-1')).toBe(false)
        expect(service.close()).toBe(true)
        expect(service.getTargetSnapshot()).toBeNull()
        expect(listener).toHaveBeenCalledTimes(3)
    })

    it('rejects an empty edit identity', () => {
        const service = new DiagramFragmentDialogService()

        expect(() => service.openEdit(' ')).toThrow('Diagram fragment ID is required')
    })
})
