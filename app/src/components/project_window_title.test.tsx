import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectReference } from '../data/data_types'
import type { DataService, DataServiceState } from '../services/data/data_service'
import { dialogService } from '../services/dialog_service'
import { ProjectWindowTitle } from './project_window_title'

const EMPTY_STATE: DataServiceState = {
    project: null,
    runningAgents: [],
    snapshot: null,
}

class TestDataService extends EventTarget {
    private state: DataServiceState = EMPTY_STATE

    getState() {
        return this.state
    }

    setProject(project: ProjectReference | null) {
        this.state = { ...this.state, project }
        this.dispatchEvent(new Event('changed'))
    }
}

function renderProjectWindowTitle(service: TestDataService) {
    return render(<ProjectWindowTitle service={service as unknown as DataService} />)
}

describe('ProjectWindowTitle', () => {
    let originalTitle: string

    beforeEach(() => {
        originalTitle = document.title
    })

    afterEach(() => {
        cleanup()
        document.title = originalTitle
        vi.restoreAllMocks()
    })

    it('uses the default title when no project is open', () => {
        renderProjectWindowTitle(new TestDataService())

        expect(document.title).toBe('MD²')
    })

    it('uses only the final folder name for a local project', () => {
        const service = new TestDataService()
        service.setProject({ branch: 'main', id: 'C:/work/local-project', rootPath: 'C:/work/local-project' })

        renderProjectWindowTitle(service)

        expect(document.title).toBe('local-project — MD²')
    })

    it('uses only the final folder name for a remote project', () => {
        const service = new TestDataService()
        service.setProject({ branch: 'main', id: 'remote-project-id', rootPath: '/srv/projects/remote-project/' })

        renderProjectWindowTitle(service)

        expect(document.title).toBe('remote-project — MD²')
    })

    it('uses the repository name for a GitHub project', () => {
        const service = new TestDataService()
        service.setProject({
            branch: 'main',
            id: 'owner/github-project-id',
            owner: 'owner',
            repository: 'github-project',
        })

        renderProjectWindowTitle(service)

        expect(document.title).toBe('github-project — MD²')
    })

    it('updates the title when the active project switches', () => {
        const service = new TestDataService()
        service.setProject({ branch: 'main', id: 'C:/first-project', rootPath: 'C:/first-project' })
        renderProjectWindowTitle(service)

        act(() => service.setProject({
            branch: 'main',
            id: 'owner/second-project-id',
            owner: 'owner',
            repository: 'second-project',
        }))

        expect(document.title).toBe('second-project — MD²')
    })

    it('restores the default title when the project closes', () => {
        const service = new TestDataService()
        service.setProject({ branch: 'main', id: 'C:/open-project', rootPath: 'C:/open-project' })
        renderProjectWindowTitle(service)

        act(() => service.setProject(null))

        expect(document.title).toBe('MD²')
    })

    it('restores the default title during cleanup', () => {
        const service = new TestDataService()
        service.setProject({ branch: 'main', id: 'C:/open-project', rootPath: 'C:/open-project' })
        const { unmount } = renderProjectWindowTitle(service)

        unmount()

        expect(document.title).toBe('MD²')
    })

    it('reports invalid project data and keeps the default title', () => {
        const reportError = vi.spyOn(dialogService, 'error')
        const service = new TestDataService()
        service.setProject({ branch: 'main', id: 'owner/missing-repository', owner: 'owner' })

        renderProjectWindowTitle(service)

        expect(document.title).toBe('MD²')
        expect(reportError).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Cannot derive GitHub project name without repository' }),
            { fallbackMessage: 'Project window title could not be updated' },
        )
    })
})
