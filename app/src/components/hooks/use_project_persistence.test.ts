import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProjectPersistenceService, ProjectPersistenceSnapshot } from '../../services/project/project_persistence_service'
import { useProjectPersistence } from './use_project_persistence'

const savedSnapshot: ProjectPersistenceSnapshot = {
    hasPendingPush: false,
    hasPendingSave: false,
    localSaveState: 'saved',
}

class TestProjectPersistenceService extends EventTarget {
    private snapshot = savedSnapshot
    private shouldChangeDuringSubscribe = false

    getSnapshot() {
        return this.snapshot
    }

    changeDuringSubscribe() {
        this.shouldChangeDuringSubscribe = true
    }

    setSnapshot(snapshot: ProjectPersistenceSnapshot) {
        this.snapshot = snapshot
        this.dispatchEvent(new Event('changed'))
    }

    publishProjectChange() {
        this.dispatchEvent(new Event('projectChanged'))
    }

    override addEventListener(
        type: string,
        callback: EventListenerOrEventListenerObject | null,
        options?: AddEventListenerOptions | boolean,
    ) {
        super.addEventListener(type, callback, options)
        if (!this.shouldChangeDuringSubscribe) return

        this.shouldChangeDuringSubscribe = false
        this.snapshot = { hasPendingPush: false, hasPendingSave: true, localSaveState: 'dirty' }
    }
}

describe('useProjectPersistence', () => {
    afterEach(cleanup)

    it('reads current snapshot after subscribing', () => {
        const service = new TestProjectPersistenceService()
        service.changeDuringSubscribe()

        const { result } = renderHook(() => useProjectPersistence(service as unknown as ProjectPersistenceService))

        expect(result.current.localSaveState).toBe('dirty')
    })

    it('publishes persistence changes without reacting to project events', () => {
        const service = new TestProjectPersistenceService()
        let renderCount = 0
        const { result } = renderHook(() => {
            renderCount += 1

            return useProjectPersistence(service as unknown as ProjectPersistenceService)
        })

        act(() => service.publishProjectChange())
        expect(renderCount).toBe(1)

        act(() => service.setSnapshot({ hasPendingPush: true, hasPendingSave: true, localSaveState: 'dirty' }))
        expect(result.current.hasPendingPush).toBe(true)
        expect(renderCount).toBe(2)
    })
})
