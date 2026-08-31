import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProjectReference } from '../../../data/data_types'
import type { DataService, DataServiceState } from '../../../services/data/data_service'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ProjectNameLabel } from './project_name_label'

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

function renderProjectNameLabel(service: TestDataService) {
    return render(
        <AppThemeProvider>
            <ProjectNameLabel service={service as unknown as DataService} />
        </AppThemeProvider>,
    )
}

describe('ProjectNameLabel', () => {
    afterEach(cleanup)

    it('renders nothing when no project is open', () => {
        const service = new TestDataService()
        const { container } = renderProjectNameLabel(service)

        expect(container).toBeEmptyDOMElement()
    })

    it('updates when the active project changes', () => {
        const service = new TestDataService()
        service.setProject({ branch: 'main', id: 'C:/first-project', rootPath: 'C:/first-project' })
        renderProjectNameLabel(service)

        expect(screen.getByText('first-project')).toBeInTheDocument()

        act(() => service.setProject({
            branch: 'main',
            id: 'owner/second-project',
            owner: 'owner',
            repository: 'second-project',
        }))

        expect(screen.getByText('second-project')).toBeInTheDocument()
        expect(screen.queryByText('first-project')).toBeNull()
    })

    it('keeps constrained project names on one truncating line', () => {
        const service = new TestDataService()
        service.setProject({
            branch: 'main',
            id: 'C:/work/a-very-long-project-name',
            rootPath: 'C:/work/a-very-long-project-name',
        })
        renderProjectNameLabel(service)

        expect(screen.getByTestId('project-name-label')).toHaveStyle({
            minWidth: '0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
        })
    })
})
