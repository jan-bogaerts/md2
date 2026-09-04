import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import { layout } from '../../services/diagrams/diagram_layout'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { DiagramComparisonLayoutService } from './diagram_comparison_layout_service'
import { TabbedDiagramComparison } from './tabbed_diagram_comparison'

const diagram: DiagramData = {
    edges: [{ from: 'orders', id: 'orders-store', kind: 'connection', label: 'writes', to: 'store' }],
    groups: [],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { id: 'orders', label: 'Orders', role: 'focal' },
        { id: 'store', label: 'Store', role: 'store' },
    ],
}
const record: DiagramRecord = { actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'design/diagrams/overview.json' }
const project = { branch: 'main', id: 'project', rootPath: 'C:/repo' }

class DiagramSourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot = { diagram, record }

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

function createHarness() {
    const session = new DiagramEditSessionService(new DiagramSourceStub())
    session.bindProject(project)
    session.start()

    return { geometry: new DiagramGeometryService(session), session }
}

function panelForTab(tab: HTMLElement) {
    const panelId = tab.getAttribute('aria-controls')
    if (!panelId) throw new Error('Diagram comparison tab is missing aria-controls')
    const panel = document.getElementById(panelId)
    if (!panel) throw new Error(`Diagram comparison panel ${panelId} is missing`)

    return panel
}

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('TabbedDiagramComparison', () => {
    it('renders Current and New in order and follows MUI keyboard tab navigation', async () => {
        const user = userEvent.setup()
        const { geometry, session } = createHarness()
        const layoutService = new DiagramComparisonLayoutService()
        render(
            <TabbedDiagramComparison
                currentDiagram={layout(diagram)}
                geometry={geometry}
                layoutService={layoutService}
                onCurrentSelect={vi.fn()}
                session={session}
            />,
        )
        const tabs = screen.getAllByRole('tab')
        const [currentTab, newTab] = tabs
        const currentPanel = panelForTab(currentTab)
        const newPanel = panelForTab(newTab)

        expect(tabs.map((tab) => tab.textContent)).toEqual(['Current', 'New'])
        expect(currentTab).toHaveAttribute('aria-selected', 'true')
        expect(currentPanel).not.toHaveAttribute('hidden')
        expect(newPanel).toHaveAttribute('hidden')

        currentTab.focus()
        await user.keyboard('{ArrowRight}{Enter}')

        expect(newTab).toHaveFocus()
        expect(newTab).toHaveAttribute('aria-selected', 'true')
        expect(currentPanel).toHaveAttribute('hidden')
        expect(newPanel).not.toHaveAttribute('hidden')
        expect(layoutService.getActiveTabSnapshot()).toBe('new')
    })

    it('keeps both surfaces mounted and preserves edits, selection, tool section, and independent scroll', async () => {
        const user = userEvent.setup()
        const { geometry, session } = createHarness()
        const onCurrentSelect = vi.fn()
        render(
            <TabbedDiagramComparison
                currentDiagram={layout(diagram)}
                geometry={geometry}
                layoutService={new DiagramComparisonLayoutService()}
                onCurrentSelect={onCurrentSelect}
                session={session}
            />,
        )
        const [currentTab, newTab] = screen.getAllByRole('tab')
        const currentPanel = panelForTab(currentTab)
        const newPanel = panelForTab(newTab)
        const currentNode = within(currentPanel).getByRole('button', { name: 'Orders' })
        currentPanel.scrollTop = 31
        await user.click(currentNode)

        await user.click(newTab)
        const newNode = within(newPanel).getByRole('button', { name: 'Orders' })
        newPanel.scrollTop = 47
        act(() => {
            session.setActiveToolboxSection('nodes')
            session.setNodeField('orders', 'label', 'Order intake')
        })

        await user.click(currentTab)
        expect(panelForTab(currentTab)).toBe(currentPanel)
        expect(currentPanel.scrollTop).toBe(31)
        expect(within(currentPanel).getByRole('button', { name: 'Orders' })).toBe(currentNode)
        expect(onCurrentSelect).toHaveBeenCalledTimes(1)

        await user.click(newTab)
        expect(panelForTab(newTab)).toBe(newPanel)
        expect(newPanel.scrollTop).toBe(47)
        expect(within(newPanel).getByRole('button', { name: 'Order intake' })).toBe(newNode)
        expect(session.getActiveToolboxSectionSnapshot()).toBe('nodes')
        expect(session.getDirtySnapshot()).toBe(true)
    })

    it('keeps tab layout and Current unchanged when a visible New leaf updates', () => {
        const { geometry, session } = createHarness()
        const layoutService = new DiagramComparisonLayoutService()
        layoutService.setActiveTab('new')
        let comparisonRenders = 0
        const Comparison = () => {
            comparisonRenders += 1

            return (
                <TabbedDiagramComparison
                    currentDiagram={layout(diagram)}
                    geometry={geometry}
                    layoutService={layoutService}
                    onCurrentSelect={vi.fn()}
                    session={session}
                />
            )
        }
        render(<Comparison />)
        const tabList = screen.getByRole('tablist', { name: 'Diagram comparison' })
        const currentPanel = panelForTab(screen.getByRole('tab', { name: 'Current' }))
        const currentMarkup = currentPanel.innerHTML

        act(() => { session.setNodeField('orders', 'label', 'Order intake') })

        expect(screen.getByRole('tablist', { name: 'Diagram comparison' })).toBe(tabList)
        expect(currentPanel.innerHTML).toBe(currentMarkup)
        expect(screen.getByRole('button', { name: 'Order intake' })).toBeInTheDocument()
        expect(comparisonRenders).toBe(1)
    })
})
