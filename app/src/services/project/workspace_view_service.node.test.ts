import { describe, expect, it } from 'vitest'
import type { ProjectReference } from '../../data/data_types'
import { CARD_PATH_CHANGED_EVENT, type CardPathChangedEventDetail, type DataService, type DataServiceState } from '../data/data_service'
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

    publishCardPathChange(fromPath: string, toPath: string) {
        const detail: CardPathChangedEventDetail = { fromPath, toPath }
        this.dispatchEvent(new CustomEvent<CardPathChangedEventDetail>(CARD_PATH_CHANGED_EVENT, { detail }))
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

    it('follows the selected card when its file is renamed', () => {
        const dataService = new TestDataService()
        dataService.setProject({ branch: 'main', id: 'project' })
        const service = new WorkspaceViewService(dataService as unknown as DataService)
        service.selectPath('design/F-1-root.md')

        dataService.publishCardPathChange('design/F-2-other.md', 'design/F-2-renamed.md')
        expect(service.getSnapshot().selectedPath).toBe('design/F-1-root.md')

        dataService.publishCardPathChange('design/F-1-root.md', 'design/F-1-renamed.md')
        expect(service.getSnapshot().selectedPath).toBe('design/F-1-renamed.md')
    })
})
