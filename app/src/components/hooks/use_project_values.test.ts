import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProjectConfig, ProjectReference, ProjectSnapshot } from '../../data/data_types'
import type { DataService, DataServiceState } from '../../services/data/data_service'
import { useProjectReference } from './use_project_reference'
import { useWorkingFolder } from './use_working_folder'

class TestDataService extends EventTarget {
    private readonly config: ProjectConfig | null = null
    private project: ProjectReference | null = { branch: 'main', id: 'project' }
    private snapshot: ProjectSnapshot | null = { activeCards: [], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' }

    getConfig(): ProjectConfig | null {
        return this.config
    }

    getState(): DataServiceState {
        return { project: this.project, runningAgents: [], snapshot: this.snapshot }
    }

    update(project: ProjectReference | null, snapshot: ProjectSnapshot | null) {
        this.project = project
        this.snapshot = snapshot
        this.dispatchEvent(new Event('changed'))
    }
}

describe('focused project value hooks', () => {
    afterEach(cleanup)

    it('does not rerender project reference consumer for snapshot-only changes', () => {
        const service = new TestDataService()
        let renderCount = 0
        const { result } = renderHook(() => {
            renderCount += 1

            return useProjectReference(service as unknown as DataService)
        })

        const snapshot = { activeCards: [], backgroundCards: [], repositoryFiles: ['README.md'], workingFolder: 'design' }
        act(() => service.update(result.current, snapshot))

        expect(renderCount).toBe(1)
    })

    it('rerenders working-folder consumer only when working folder changes', () => {
        const service = new TestDataService()
        let renderCount = 0
        const { result } = renderHook(() => {
            renderCount += 1

            return useWorkingFolder(service as unknown as DataService)
        })

        const unchangedFolder = { activeCards: [], backgroundCards: [], repositoryFiles: ['README.md'], workingFolder: 'design' }
        act(() => service.update({ branch: 'main', id: 'project' }, unchangedFolder))
        expect(renderCount).toBe(1)

        const changedFolder = { activeCards: [], backgroundCards: [], repositoryFiles: [], workingFolder: 'docs' }
        act(() => service.update({ branch: 'main', id: 'project' }, changedFolder))
        expect(result.current).toBe('docs')
        expect(renderCount).toBe(2)
    })
})
