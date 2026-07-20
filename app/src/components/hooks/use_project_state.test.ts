import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProjectReference } from '../../data/data_types'
import type { DataService, DataServiceState } from '../../services/data/data_service'
import { useProjectState } from './use_project_state'

const emptyState: DataServiceState = {
    project: null,
    runningAgents: [],
    snapshot: null,
}

const loadedProject: ProjectReference = { branch: 'main', id: 'project' }

const loadedState: DataServiceState = {
    project: loadedProject,
    runningAgents: [],
    snapshot: { activeCards: [], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
}

class TestProjectStateService extends EventTarget {
    private state: DataServiceState = emptyState
    private shouldLoadDuringSubscribe = false

    getState() {
        return this.state
    }

    loadDuringSubscribe() {
        this.shouldLoadDuringSubscribe = true
    }

    setState(state: DataServiceState) {
        this.state = state
        this.dispatchEvent(new Event('changed'))
    }

    publishPersistenceChange() {
        this.dispatchEvent(new Event('persistenceChanged'))
    }

    override addEventListener(
        type: string,
        callback: EventListenerOrEventListenerObject | null,
        options?: AddEventListenerOptions | boolean,
    ) {
        super.addEventListener(type, callback, options)
        if (!this.shouldLoadDuringSubscribe) return

        this.shouldLoadDuringSubscribe = false
        this.state = loadedState
    }
}

describe('useProjectState', () => {
    afterEach(cleanup)

    it('reads the current state after subscribing so project loads are not missed', () => {
        const service = new TestProjectStateService()
        service.loadDuringSubscribe()

        const { result } = renderHook(() => useProjectState(service as unknown as DataService))

        expect(result.current.project).toEqual(loadedProject)
    })

    it('does not re-render for persistence-only events', () => {
        const service = new TestProjectStateService()
        let renderCount = 0
        renderHook(() => {
            renderCount += 1

            return useProjectState(service as unknown as DataService)
        })

        act(() => service.publishPersistenceChange())

        expect(renderCount).toBe(1)
    })
})
