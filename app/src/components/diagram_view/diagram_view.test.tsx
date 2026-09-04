import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../data/action_types'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type {
    DiagramLegendPosition, DiagramMenuState, DiagramViewSnapshot, DiagramViewService, DiagramViewSourceSnapshot,
} from '../../services/diagrams/diagram_view_service'
import { layout } from '../../services/diagrams/diagram_layout'
import { DiagramComparisonLayoutService } from './diagram_comparison_layout_service'
import { DiagramView } from './diagram_view'

vi.mock('../hooks/use_workspace_view', () => ({ useWorkspaceView: () => ({ selectedPath: null, viewMode: 'diagrams' }) }))

const actions = vi.hoisted(() => [
    { appliesTo: { kind: 'diagram', type: 'child' }, builtin: false, id: 'detail', label: 'Detail' },
    { appliesTo: { kind: 'diagram', type: 'root' }, builtin: false, id: 'overview', label: 'Overview' },
]) as ActionDefinition[]

vi.mock('../hooks/use_actions', () => ({ useActions: () => ({ actions }) }))
vi.mock('../actions/run/popup/action_popup', () => ({
    ActionPopup: ({ context, draggable, initialActionId }: {
        context: { kind: string, type?: string }, draggable?: boolean, initialActionId?: string,
    }) => {
        const matchingActions = actions.filter(({ appliesTo, builtin }) => (
            !builtin && appliesTo?.kind === context.kind && (appliesTo.type === undefined || appliesTo.type === context.type)
        ))
        if (matchingActions.length === 0) return null

        return (
            <div
                data-action-id={initialActionId}
                data-context={JSON.stringify(context)}
                data-draggable={String(!!draggable)}
                role="dialog"
            >
                {matchingActions.map(({ label }) => <span key={label}>{label}</span>)}
            </div>
        )
    },
}))

const diagramData: DiagramData = {
    edges: [{ from: 'customer', id: 'customer-orders', kind: 'connection', label: 'places', to: 'orders' }],
    groups: [{ id: 'domain', label: 'Domain', nodeIds: ['customer', 'orders'] }],
    meta: {
        description: 'Customer ordering flow',
        title: 'Orders',
        type: 'architecture',
        version: 1,
    },
    nodes: [
        { id: 'customer', label: 'Customer', role: 'focal' },
        { id: 'orders', label: 'Orders', role: 'backend' },
    ],
}

function initialSnapshot(): DiagramViewSnapshot {
    return {
        currentDiagram: layout(diagramData),
        currentDiagramError: null,
        error: null,
        index: {
            activePath: ['root-1', 'child-1'],
            children: {},
            diagrams: {
                'child-1': {
                    actionId: 'detail', id: 'child-1', label: 'Orders',
                    parent: { diagramId: 'root-1', itemId: 'orders', itemLabel: 'Orders' },
                    path: 'design/diagrams/child.json',
                },
                'root-1': { actionId: 'overview', id: 'root-1', label: 'Overview', path: 'design/diagrams/root.json' },
            },
            roots: { overview: ['root-1'] },
            version: 1,
        },
        legend: { collapsed: false, position: null },
        menu: null,
        popup: null,
        status: 'ready',
    }
}

class DiagramSourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot = {
        diagram: diagramData,
        record: {actionId: 'detail', id: 'child-1', label: 'Orders', path: 'design/diagrams/child.json'},
    }

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

function createEditHarness() {
    const editSession = new DiagramEditSessionService(new DiagramSourceStub())
    editSession.bindProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' })
    editSession.start()

    return { editSession, geometry: new DiagramGeometryService(editSession) }
}

function createService() {
    let snapshot = initialSnapshot()
    const listeners = new Set<() => void>()
    const publish = (next: DiagramViewSnapshot) => {
        snapshot = next
        for (const listener of listeners) listener()
    }
    const service = {
        collapseLegend: vi.fn(() => publish({ ...snapshot, legend: { ...snapshot.legend, collapsed: true } })),
        closeItemMenu: vi.fn(() => publish({ ...snapshot, menu: null })),
        closePopup: vi.fn(() => publish({ ...snapshot, popup: null })),
        expandLegend: vi.fn(() => publish({ ...snapshot, legend: { ...snapshot.legend, collapsed: false } })),
        getSavedChildren: vi.fn(() => [{ actionId: 'saved-action', id: 'saved-1', label: 'Saved Orders', path: 'design/diagrams/saved.json' }]),
        getSnapshot: () => snapshot,
        navigateBack: vi.fn(async () => undefined),
        navigateToCrumb: vi.fn(async () => undefined),
        navigateToSavedDiagram: vi.fn(async () => undefined),
        moveLegend: vi.fn((position: DiagramLegendPosition) => publish({ ...snapshot, legend: { ...snapshot.legend, position } })),
        open: vi.fn(async () => undefined),
        openChildPopup: vi.fn((actionId: string) => {
            const menu = snapshot.menu
            if (!menu) return
            publish({
                ...snapshot,
                menu: null,
                popup: {
                    anchorElement: menu.anchorElement as HTMLElement,
                    context: {
                        diagramId: menu.diagramId,
                        diagramItemId: menu.itemId,
                        kind: 'diagram',
                        parentNode: menu.itemLabel,
                        type: 'child',
                    },
                    initialActionId: actionId,
                },
            })
        }),
        openItemMenu: vi.fn((menu: DiagramMenuState) => publish({ ...snapshot, menu })),
        openRootPopup: vi.fn((anchorElement: HTMLElement) => publish({
            ...snapshot,
            popup: snapshot.popup?.context.type === 'root'
                ? null
                : { anchorElement, context: { kind: 'diagram', type: 'root' } },
        })),
        subscribe: (listener: () => void) => {
            listeners.add(listener)

            return () => listeners.delete(listener)
        },
    }

    return service as unknown as DiagramViewService & {
        navigateBack: ReturnType<typeof vi.fn>
        navigateToCrumb: ReturnType<typeof vi.fn>
        navigateToSavedDiagram: ReturnType<typeof vi.fn>
        closePopup: ReturnType<typeof vi.fn>
        openItemMenu: ReturnType<typeof vi.fn>
        openRootPopup: ReturnType<typeof vi.fn>
    }
}

describe('DiagramView', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        actions.splice(0, actions.length,
            { appliesTo: { kind: 'diagram', type: 'child' }, builtin: false, id: 'detail', label: 'Detail' } as ActionDefinition,
            { appliesTo: { kind: 'diagram', type: 'root' }, builtin: false, id: 'overview', label: 'Overview' } as ActionDefinition,
        )
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    })
    afterEach(cleanup)

    it('overlays derived legend outside scroller and provides collapse and expand controls', async () => {
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)
        const viewport = screen.getByLabelText('Active diagram')
        const scroller = screen.getByLabelText('Diagram scroller')
        const legend = screen.getByLabelText('Diagram legend')

        expect(viewport).toContainElement(legend)
        expect(scroller).not.toContainElement(legend)
        expect(legend).toHaveTextContent('focalbackendconnection')
        expect(legend).toHaveStyle({ position: 'absolute', right: '12px', top: '12px' })

        scroller.scrollLeft = 200
        scroller.scrollTop = 100
        fireEvent.scroll(scroller)
        expect(legend).toHaveStyle({ right: '12px', top: '12px' })

        await user.click(screen.getByRole('button', { name: 'Collapse legend' }))
        expect(service.collapseLegend).toHaveBeenCalledTimes(1)
        expect(screen.queryByText('focal')).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Expand legend' }))
        expect(screen.getByText('focal')).toBeInTheDocument()
    })

    it('opens item menu by pointer and offers matching child actions plus saved diagrams', async () => {
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)

        await user.click(screen.getByRole('button', { name: 'Customer' }))

        expect(service.openItemMenu).toHaveBeenCalledWith(expect.objectContaining({diagramId: 'child-1', itemId: 'customer', itemLabel: 'Customer'}))
        expect(screen.getByRole('menuitem', { name: 'Detail' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Saved Orders' })).toBeInTheDocument()
    })

    it('supports keyboard activation and opens preselected child action with parent label', async () => {
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)

        const item = screen.getByRole('button', { name: 'Customer' })
        item.focus()
        await user.keyboard('{Enter}')
        await user.click(screen.getByRole('menuitem', { name: 'Detail' }))

        const popup = screen.getByRole('dialog')
        expect(popup).toHaveAttribute('data-action-id', 'detail')
        expect(popup.getAttribute('data-context')).toContain('"parentNode":"Customer"')
    })

    it('opens item menu from a selectable edge with its accessible label', async () => {
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)

        await user.click(screen.getByRole('button', { name: 'places' }))

        expect(service.openItemMenu).toHaveBeenCalledWith(expect.objectContaining({diagramId: 'child-1', itemId: 'customer-orders', itemLabel: 'places'}))
    })

    it('navigates Back, breadcrumbs, and saved diagrams without opening action popup', async () => {
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)

        await user.click(screen.getByRole('button', { name: 'Back' }))
        await user.click(screen.getByRole('button', { name: 'Overview' }))
        await user.click(screen.getByRole('button', { name: 'Customer' }))
        await user.click(screen.getByRole('menuitem', { name: 'Saved Orders' }))

        expect(service.navigateBack).toHaveBeenCalledTimes(1)
        expect(service.navigateToCrumb).toHaveBeenCalledWith(0)
        expect(service.navigateToSavedDiagram).toHaveBeenCalledWith('saved-1')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows Current and New regions only while an edit session is active', () => {
        const service = createService()
        const { editSession, geometry } = createEditHarness()
        const layoutService = new DiagramComparisonLayoutService()
        const { unmount } = render(
            <DiagramView editSession={editSession} geometry={geometry} layoutService={layoutService} service={service} />,
        )

        expect(screen.getByRole('group', { name: 'Diagram comparison layout' })).toBeInTheDocument()
        expect(screen.getByRole('region', { name: 'Current' })).toBeInTheDocument()
        expect(screen.getByRole('region', { name: 'New' })).toBeInTheDocument()

        unmount()
        editSession.discard()
        render(<DiagramView editSession={editSession} geometry={geometry} layoutService={layoutService} service={service} />)

        expect(screen.queryByRole('group', { name: 'Diagram comparison layout' })).not.toBeInTheDocument()
        expect(screen.queryByRole('region', { name: 'Current' })).not.toBeInTheDocument()
        expect(screen.queryByRole('region', { name: 'New' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Customer' })).toBeInTheDocument()
    })

    it('changes comparison mode without replacing edit-session state', async () => {
        const service = createService()
        const { editSession, geometry } = createEditHarness()
        const layoutService = new DiagramComparisonLayoutService()
        const user = userEvent.setup()
        const originalDiagram = editSession.getOriginalDiagramSnapshot()
        const editableDiagram = editSession.getEditableDiagram()
        const sessionSnapshot = editSession.getSessionSnapshot()
        editSession.setNodeField('customer', 'label', 'Edited customer')
        editSession.setActiveToolboxSection('nodes')
        render(
            <DiagramView editSession={editSession} geometry={geometry} layoutService={layoutService} service={service} />,
        )

        await user.click(screen.getByRole('button', { name: 'Horizontal' }))
        await user.click(screen.getByRole('button', { name: 'Tabbed' }))

        expect(editSession.getOriginalDiagramSnapshot()).toBe(originalDiagram)
        expect(editSession.getEditableDiagram()).toBe(editableDiagram)
        expect(editSession.getSessionSnapshot()).toBe(sessionSnapshot)
        expect(editSession.getDirtySnapshot()).toBe(true)
        expect(editSession.getNodeFieldSnapshot('customer', 'label')).toBe('Edited customer')
        expect(editSession.getActiveToolboxSectionSnapshot()).toBe('nodes')
    })

    it('keeps selected comparison mode while navigating inside the edit session', async () => {
        const service = createService()
        const { editSession, geometry } = createEditHarness()
        const layoutService = new DiagramComparisonLayoutService()
        const user = userEvent.setup()
        layoutService.setComparisonMode('tabbed')
        render(
            <DiagramView editSession={editSession} geometry={geometry} layoutService={layoutService} service={service} />,
        )

        await user.click(screen.getByRole('button', { name: 'Back' }))
        await user.click(screen.getByRole('button', { name: 'Overview' }))

        expect(service.navigateBack).toHaveBeenCalledTimes(1)
        expect(service.navigateToCrumb).toHaveBeenCalledWith(0)
        expect(layoutService.getComparisonModeSnapshot()).toBe('tabbed')
        expect(screen.getByRole('button', { name: 'Tabbed' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('opens only matching root actions, passes draggable, then closes on second plain click', async () => {
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)

        const button = screen.getByRole('button', { name: 'Diagram action' })
        await user.click(button)

        const popup = screen.getByRole('dialog')
        expect(popup).toHaveTextContent('Overview')
        expect(popup).not.toHaveTextContent('Detail')
        expect(popup).toHaveAttribute('data-context', '{"kind":"diagram","type":"root"}')
        expect(popup).toHaveAttribute('data-draggable', 'true')

        await user.click(button)

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(service.openRootPopup).toHaveBeenCalledTimes(2)
    })

    it('moves launcher without opening popup, then opens it on following plain click', async () => {
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)
        const button = screen.getByRole('button', { name: 'Diagram action' })

        fireEvent.pointerDown(button, { clientX: 1140, clientY: 740, pointerId: 1 })
        fireEvent.pointerMove(button, { clientX: 900, clientY: 500, pointerId: 1 })
        fireEvent.pointerUp(button, { pointerId: 1 })
        fireEvent.click(button)

        expect(screen.getByTestId('movable-fab-position')).toHaveStyle({ left: '888px', top: '488px' })
        expect(service.closePopup).toHaveBeenCalledTimes(1)
        expect(service.openRootPopup).not.toHaveBeenCalled()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

        await user.click(button)
        expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('keeps launcher disabled with explanation when no root actions exist', async () => {
        actions.splice(1, 1, { appliesTo: { kind: 'project' }, builtin: false, id: 'generic', label: 'Generic' } as ActionDefinition)
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)
        const button = screen.getByRole('button', { name: 'Diagram action' })

        expect(button).toBeDisabled()
        await user.hover(screen.getByTestId('movable-fab-position'))

        expect(await screen.findByText('No root diagram actions configured')).toBeInTheDocument()
        expect(service.openRootPopup).not.toHaveBeenCalled()
    })
})
