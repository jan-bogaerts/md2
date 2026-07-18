import { describe, expect, it, vi } from 'vitest'
import { getService } from '.././service_injector'
import { WorkspaceNavigationService, type WorkspaceOpenRequest } from './workspace_navigation_service'

describe('WorkspaceNavigationService', () => {
    it('dispatches an open event carrying the requested path', () => {
        const service = new WorkspaceNavigationService()
        const listener = vi.fn((event: Event) => (event as CustomEvent<WorkspaceOpenRequest>).detail.path)
        service.addEventListener('open', listener)

        service.open('design/history/change.md')

        expect(listener).toHaveBeenCalledTimes(1)
        const event = listener.mock.calls[0][0] as CustomEvent<WorkspaceOpenRequest>
        expect(event.detail.path).toBe('design/history/change.md')
    })

    it('fails fast when opening without a path', () => {
        const service = new WorkspaceNavigationService()

        expect(() => service.open('')).toThrow('Cannot open a workspace path without a path')
    })

    it('registers itself in the service injector', () => {
        expect(getService('workspaceNavigationService')).toBeInstanceOf(WorkspaceNavigationService)
    })
})
