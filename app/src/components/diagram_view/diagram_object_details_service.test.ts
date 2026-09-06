import { describe, expect, it, vi } from 'vitest'
import { DiagramObjectDetailsService } from './diagram_object_details_service'

describe('DiagramObjectDetailsService', () => {
    it('publishes only target identity changes', () => {
        const service = new DiagramObjectDetailsService()
        const listener = vi.fn()
        service.subscribeTarget(listener)

        expect(service.open({ objectId: 'orders', objectKind: 'node' })).toBe(true)
        const target = service.getTargetSnapshot()
        expect(target).toEqual({ objectId: 'orders', objectKind: 'node' })
        expect(service.open({ objectId: 'orders', objectKind: 'node' })).toBe(false)
        expect(service.getTargetSnapshot()).toBe(target)
        expect(service.close()).toBe(true)
        expect(service.close()).toBe(false)
        expect(listener).toHaveBeenCalledTimes(2)
    })

    it('rejects an empty object ID', () => {
        const service = new DiagramObjectDetailsService()

        expect(() => service.open({ objectId: ' ', objectKind: 'edge' })).toThrow('Diagram details object ID is required')
    })

    it('publishes singleton metadata target without an object identity', () => {
        const service = new DiagramObjectDetailsService()
        const listener = vi.fn()
        service.subscribeTarget(listener)

        expect(service.open({ objectKind: 'meta' })).toBe(true)
        const target = service.getTargetSnapshot()
        expect(target).toEqual({ objectKind: 'meta' })
        expect(service.open({ objectKind: 'meta' })).toBe(false)
        expect(service.getTargetSnapshot()).toBe(target)
        expect(listener).toHaveBeenCalledOnce()
    })
})
