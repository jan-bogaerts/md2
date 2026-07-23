import { describe, expect, it } from 'vitest'
import type { ProjectReference } from '../../data/data_types'
import type { DataService, DataServiceState } from '../data/data_service'
import { WorkspaceViewService } from './workspace_view_service'

class TestDataService extends EventTarget {
    private project: ProjectReference | null = null

    getState(): DataServiceState {
        return { project: this.project, runningAgents: [], snapshot: null }
    }

    setProject(project: ProjectReference | null) {
        this.project = project
        this.dispatchEvent(new Event('changed'))
    }

    publishSnapshotChange() {
        this.dispatchEvent(new Event('changed'))
    }
}

describe('WorkspaceViewService', () => {
    it('keeps view state for project data changes and resets it when project identity changes', () => {
        const dataService = new TestDataService()
        dataService.setProject({ branch: 'main', id: 'project' })
        const service = new WorkspaceViewService(dataService as unknown as DataService)
        service.setViewMode('text')
        service.selectPath('design/F-1.md')

        dataService.publishSnapshotChange()
        expect(service.getSnapshot()).toEqual({ selectedPath: 'design/F-1.md', viewMode: 'text' })

        dataService.setProject({ branch: 'feature', id: 'project' })
        expect(service.getSnapshot()).toEqual({ selectedPath: null, viewMode: 'cards' })
    })
})
