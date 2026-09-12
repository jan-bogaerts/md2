import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../data/action_types'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type {
    DiagramItemMenuRequest, DiagramItemSubmenuKind, DiagramLegendPosition, DiagramViewSnapshot, DiagramViewService,
    DiagramViewSourceSnapshot,
} from '../../services/diagrams/diagram_view_service'
import { layout } from '../../services/diagrams/diagram_layout'
import { DEFAULT_DIAGRAM_ZOOM } from '../../services/diagrams/diagram_zoom'
import { DiagramComparisonLayoutService } from './diagram_comparison_layout_service'
import { DiagramView } from './diagram_view'
import { DiagramEmphasisService } from '../../services/diagrams/diagram_emphasis_service'
import { DiagramSelectionService } from '../../services/diagrams/diagram_selection_service'

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
        { id: 'audit', label: 'Audit', role: 'optional' },
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

function createEditHarness(start = true) {
    const editSession = new DiagramEditSessionService(new DiagramSourceStub())
    editSession.bindProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' })
    if (start) editSession.start()

    const geometry = new DiagramGeometryService(editSession)

    return { editSession, geometry, selection: new DiagramSelectionService(editSession, geometry) }
}

function createService() {
    let currentSelection: { objectId: string, objectKind: 'edge' | 'node' } | null = null
    let snapshot = initialSnapshot()
    let viewportScale = DEFAULT_DIAGRAM_ZOOM
    const snapshotEvents = new EventTarget()
    const viewportScaleEvents = new EventTarget()
    const publish = (next: DiagramViewSnapshot) => {
        const previous = snapshot
        snapshot = next
        if (next.currentDiagram !== previous.currentDiagram) snapshotEvents.dispatchEvent(new Event('currentDiagram'))
        if (next.currentDiagramError !== previous.currentDiagramError) snapshotEvents.dispatchEvent(new Event('currentDiagramError'))
        if (next.error !== previous.error) snapshotEvents.dispatchEvent(new Event('error'))
        if (next.index !== previous.index) snapshotEvents.dispatchEvent(new Event('index'))
        if (next.legend.collapsed !== previous.legend.collapsed) snapshotEvents.dispatchEvent(new Event('legendCollapsed'))
        if (next.legend.position !== previous.legend.position) snapshotEvents.dispatchEvent(new Event('legendPosition'))
        if (next.menu !== previous.menu) snapshotEvents.dispatchEvent(new Event('menu'))
        if (next.popup !== previous.popup) snapshotEvents.dispatchEvent(new Event('popup'))
        if (next.status !== previous.status) snapshotEvents.dispatchEvent(new Event('status'))
    }
    const service = {
        collapseLegend: vi.fn(() => publish({ ...snapshot, legend: { ...snapshot.legend, collapsed: true } })),
        closeItemMenu: vi.fn(() => publish({ ...snapshot, menu: null })),
        closeItemSubmenu: vi.fn(() => {
            if (!snapshot.menu?.submenu) return
            publish({ ...snapshot, menu: { ...snapshot.menu, submenu: null } })
        }),
        closePopup: vi.fn(() => publish({ ...snapshot, popup: null })),
        expandLegend: vi.fn(() => publish({ ...snapshot, legend: { ...snapshot.legend, collapsed: false } })),
        getCurrentDiagramErrorSnapshot: () => snapshot.currentDiagramError,
        getCurrentDiagramSnapshot: () => snapshot.currentDiagram,
        getCurrentSelectionSnapshot: (objectKind: 'edge' | 'node', objectId: string) => (
            currentSelection?.objectKind === objectKind && currentSelection.objectId === objectId
        ),
        getErrorSnapshot: () => snapshot.error,
        getIndexSnapshot: () => snapshot.index,
        getLegendCollapsedSnapshot: () => snapshot.legend.collapsed,
        getLegendPositionSnapshot: () => snapshot.legend.position,
        getMenuSnapshot: () => snapshot.menu,
        getPopupSnapshot: () => snapshot.popup,
        getSavedChildren: vi.fn(() => [{ actionId: 'saved-action', id: 'saved-1', label: 'Saved Orders', path: 'design/diagrams/saved.json' }]),
        getSnapshot: () => snapshot,
        getStatusSnapshot: () => snapshot.status,
        getViewportScaleSnapshot: () => viewportScale,
        navigateBack: vi.fn(async () => undefined),
        navigateToCrumb: vi.fn(async () => undefined),
        navigateToSavedDiagram: vi.fn(async () => publish({ ...snapshot, menu: null })),
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
        openItemMenu: vi.fn((menu: DiagramItemMenuRequest) => publish({ ...snapshot, menu: { ...menu, submenu: null } })),
        openItemSubmenu: vi.fn((kind: DiagramItemSubmenuKind, anchorElement: HTMLElement) => {
            if (!snapshot.menu) return
            publish({ ...snapshot, menu: { ...snapshot.menu, submenu: { anchorElement, kind } } })
        }),
        openRootPopup: vi.fn((anchorElement: HTMLElement) => publish({
            ...snapshot,
            popup: snapshot.popup?.context.type === 'root'
                ? null
                : { anchorElement, context: { kind: 'diagram', type: 'root' } },
        })),
        setViewportScale: vi.fn((scale: number) => {
            if (scale === viewportScale) return false
            viewportScale = scale
            viewportScaleEvents.dispatchEvent(new Event('changed'))

            return true
        }),
        selectCurrentObject: vi.fn((selection: { objectId: string, objectKind: 'edge' | 'node' }) => {
            const previous = currentSelection
            currentSelection = selection
            if (previous) snapshotEvents.dispatchEvent(new Event(`selection:${previous.objectKind}:${previous.objectId}`))
            snapshotEvents.dispatchEvent(new Event(`selection:${selection.objectKind}:${selection.objectId}`))
        }),
        subscribeCurrentDiagram: (listener: () => void) => {
            snapshotEvents.addEventListener('currentDiagram', listener)

            return () => snapshotEvents.removeEventListener('currentDiagram', listener)
        },
        subscribeCurrentDiagramError: (listener: () => void) => {
            snapshotEvents.addEventListener('currentDiagramError', listener)

            return () => snapshotEvents.removeEventListener('currentDiagramError', listener)
        },
        subscribeCurrentSelection: (objectKind: 'edge' | 'node', objectId: string, listener: () => void) => {
            const eventType = `selection:${objectKind}:${objectId}`
            snapshotEvents.addEventListener(eventType, listener)

            return () => snapshotEvents.removeEventListener(eventType, listener)
        },
        subscribeError: (listener: () => void) => {
            snapshotEvents.addEventListener('error', listener)

            return () => snapshotEvents.removeEventListener('error', listener)
        },
        subscribeIndex: (listener: () => void) => {
            snapshotEvents.addEventListener('index', listener)

            return () => snapshotEvents.removeEventListener('index', listener)
        },
        subscribeLegendCollapsed: (listener: () => void) => {
            snapshotEvents.addEventListener('legendCollapsed', listener)

            return () => snapshotEvents.removeEventListener('legendCollapsed', listener)
        },
        subscribeLegendPosition: (listener: () => void) => {
            snapshotEvents.addEventListener('legendPosition', listener)

            return () => snapshotEvents.removeEventListener('legendPosition', listener)
        },
        subscribeMenu: (listener: () => void) => {
            snapshotEvents.addEventListener('menu', listener)

            return () => snapshotEvents.removeEventListener('menu', listener)
        },
        subscribePopup: (listener: () => void) => {
            snapshotEvents.addEventListener('popup', listener)

            return () => snapshotEvents.removeEventListener('popup', listener)
        },
        subscribeStatus: (listener: () => void) => {
            snapshotEvents.addEventListener('status', listener)

            return () => snapshotEvents.removeEventListener('status', listener)
        },
        subscribeViewportScale: (listener: () => void) => {
            viewportScaleEvents.addEventListener('changed', listener)

            return () => viewportScaleEvents.removeEventListener('changed', listener)
        },
    }

    return service as unknown as DiagramViewService & {
        navigateBack: ReturnType<typeof vi.fn>
        navigateToCrumb: ReturnType<typeof vi.fn>
        navigateToSavedDiagram: ReturnType<typeof vi.fn>
        closePopup: ReturnType<typeof vi.fn>
        closeItemSubmenu: ReturnType<typeof vi.fn>
        openItemMenu: ReturnType<typeof vi.fn>
        openItemSubmenu: ReturnType<typeof vi.fn>
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
        const getCurrentDiagramSnapshot = vi.spyOn(service, 'getCurrentDiagramSnapshot')
        const user = userEvent.setup()
        render(<DiagramView service={service} />)
        const currentDiagramReadsAfterRender = getCurrentDiagramSnapshot.mock.calls.length
        const viewport = screen.getByLabelText('Active diagram')
        const scroller = screen.getByLabelText('Current diagram scroller')
        const legend = screen.getByLabelText('Diagram legend')

        expect(viewport).toContainElement(legend)
        expect(scroller).not.toContainElement(legend)
        expect(legend).toHaveTextContent('focalbackendoptionalconnection')
        expect(legend).toHaveStyle({ position: 'absolute', right: '12px', top: '12px' })
        expect(screen.getByRole('slider', { name: 'Current diagram zoom' })).toHaveAttribute('aria-valuetext', '100%')
        expect(screen.queryByRole('slider', { name: 'New diagram zoom' })).not.toBeInTheDocument()

        scroller.scrollLeft = 200
        scroller.scrollTop = 100
        fireEvent.scroll(scroller)
        expect(legend).toHaveStyle({ right: '12px', top: '12px' })

        await user.click(screen.getByRole('button', { name: 'Collapse legend' }))
        expect(service.collapseLegend).toHaveBeenCalledTimes(1)
        expect(screen.queryByText('focal')).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Expand legend' }))
        expect(screen.getByText('focal')).toBeInTheDocument()
        expect(getCurrentDiagramSnapshot).toHaveBeenCalledTimes(currentDiagramReadsAfterRender)
    })

    it('opens item menu by pointer with only submenu parents, then opens each submenu', async () => {
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)

        fireEvent.contextMenu(screen.getByRole('button', { name: 'Customer' }), { clientX: 10, clientY: 20 })

        expect(service.openItemMenu).toHaveBeenCalledWith(expect.objectContaining({diagramId: 'child-1', itemId: 'customer', itemLabel: 'Customer', objectKind: 'node', surface: 'current'}))
        expect(screen.getByRole('menuitem', { name: 'Emphasize' })).toBeInTheDocument()
        const actionsItem = screen.getByRole('menuitem', { name: 'Actions' })
        const savedDiagramsItem = screen.getByRole('menuitem', { name: 'Saved diagrams' })
        expect(actionsItem).toHaveAttribute('aria-haspopup', 'menu')
        expect(savedDiagramsItem).toHaveAttribute('aria-haspopup', 'menu')
        expect(screen.queryByRole('menuitem', { name: 'Detail' })).not.toBeInTheDocument()
        expect(screen.queryByRole('menuitem', { name: 'Saved Orders' })).not.toBeInTheDocument()

        await user.click(actionsItem)
        expect(screen.getByRole('menu', { name: 'Actions' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Detail' })).toBeInTheDocument()

        await user.keyboard('{ArrowLeft}')
        await user.click(savedDiagramsItem)
        expect(screen.getByRole('menu', { name: 'Saved diagrams' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Saved Orders' })).toBeInTheDocument()
    })

    it('selects Current objects by click, Enter, and Space without opening item menu', async () => {
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)
        const customer = screen.getByRole('button', { name: 'Customer' })

        await user.click(customer)
        customer.focus()
        await user.keyboard('{Enter}')
        await user.keyboard(' ')

        expect(service.selectCurrentObject).toHaveBeenCalledTimes(3)
        expect(service.selectCurrentObject).toHaveBeenLastCalledWith({ objectId: 'customer', objectKind: 'node' })
        expect(customer).toHaveAttribute('aria-pressed', 'true')
        expect(service.openItemMenu).not.toHaveBeenCalled()
    })

    it('emphasizes one-hop Current relations, moves target on selection, and exits by button or Escape', async () => {
        const service = createService()
        const { editSession } = createEditHarness(false)
        const emphasis = new DiagramEmphasisService(new DiagramSourceStub(), editSession)
        const user = userEvent.setup()
        render(<DiagramView editSession={editSession} emphasis={emphasis} service={service} />)

        fireEvent.contextMenu(screen.getByRole('button', { name: 'Customer' }))
        await user.click(screen.getByRole('menuitem', { name: 'Emphasize' }))
        const currentSurface = screen.getByLabelText('Orders diagram')

        expect(within(currentSurface).getByRole('button', { name: 'Customer' })).toHaveStyle({ opacity: '1' })
        expect(within(currentSurface).getByRole('button', { name: 'Orders' })).toHaveStyle({ opacity: '1' })
        expect(within(currentSurface).getByRole('button', { name: 'places' })).toHaveStyle({ opacity: '1' })
        expect(within(currentSurface).getByRole('button', { name: 'Audit' })).toHaveStyle({ opacity: '0.08' })
        expect(within(currentSurface).getByRole('group', { name: 'Domain' })).toHaveStyle({ opacity: '0.08' })
        const exitButton = screen.getByRole('button', { name: 'Exit emphasis' })
        expect(exitButton).toBeInTheDocument()
        expect(screen.getByLabelText('Current diagram scroller')).not.toContainElement(exitButton)

        fireEvent.contextMenu(within(currentSurface).getByRole('button', { name: 'Audit' }))
        await user.keyboard('{Escape}')
        expect(screen.queryByRole('menu', { name: 'Diagram item' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Exit emphasis' })).toBeInTheDocument()

        await user.click(within(currentSurface).getByRole('button', { name: 'Audit' }))
        expect(within(currentSurface).getByRole('button', { name: 'Customer' })).toHaveStyle({ opacity: '0.08' })
        expect(within(currentSurface).getByRole('button', { name: 'Audit' })).toHaveStyle({ opacity: '1' })
        expect(within(currentSurface).getByRole('button', { name: 'places' })).toHaveStyle({ opacity: '0.08' })

        await user.click(screen.getByRole('button', { name: 'Exit emphasis' }))
        expect(within(currentSurface).getByRole('button', { name: 'Customer' })).toHaveStyle({ opacity: '1' })
        expect(screen.queryByRole('button', { name: 'Exit emphasis' })).not.toBeInTheDocument()

        fireEvent.contextMenu(screen.getByRole('button', { name: 'Customer' }))
        await user.click(screen.getByRole('menuitem', { name: 'Emphasize' }))
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(screen.queryByRole('button', { name: 'Exit emphasis' })).not.toBeInTheDocument()
    })

    it('opens New context menu with Emphasize only and suppresses browser menu', async () => {
        const service = createService()
        const { editSession, geometry, selection } = createEditHarness()
        const emphasis = new DiagramEmphasisService(new DiagramSourceStub(), editSession)
        const editableDiagram = editSession.getEditableDiagram()
        const layoutService = new DiagramComparisonLayoutService()
        const user = userEvent.setup()
        render(
            <DiagramView
                editSession={editSession}
                emphasis={emphasis}
                geometry={geometry}
                layoutService={layoutService}
                selection={selection}
                service={service}
            />,
        )
        const newRegion = screen.getByRole('region', { name: 'New' })
        const customer = within(newRegion).getByRole('button', { name: 'Customer' })

        expect(fireEvent.contextMenu(customer)).toBe(false)
        expect(screen.getByRole('menuitem', { name: 'Emphasize' })).toBeInTheDocument()
        expect(screen.queryByRole('menuitem', { name: 'Actions' })).not.toBeInTheDocument()
        expect(screen.queryByRole('menuitem', { name: 'Saved diagrams' })).not.toBeInTheDocument()

        await user.click(screen.getByRole('menuitem', { name: 'Emphasize' }))
        expect(within(newRegion).getByRole('button', { name: 'Audit' })).toHaveStyle({ opacity: '0.08' })
        const exitButton = within(newRegion).getByRole('button', { name: 'Exit emphasis' })
        expect(within(newRegion).getByLabelText('New diagram scroller')).not.toContainElement(exitButton)
        expect(editSession.getEditableDiagram()).toBe(editableDiagram)
        expect(editSession.getDirtySnapshot()).toBe(false)
        expect(layoutService.getComparisonModeSnapshot()).toBe('vertical')

        fireEvent.click(within(newRegion).getByRole('button', { name: 'Audit' }))
        expect(within(newRegion).getByRole('button', { name: 'Customer' })).toHaveStyle({ opacity: '0.08' })
        expect(within(newRegion).getByRole('button', { name: 'Audit' })).toHaveStyle({ opacity: '1' })

        fireEvent.keyDown(window, { key: 'Escape' })
        expect(within(newRegion).queryByRole('button', { name: 'Exit emphasis' })).not.toBeInTheDocument()
        expect(within(newRegion).getByRole('button', { name: 'Customer' })).toHaveStyle({ opacity: '1' })
    })

    it('opens and closes submenu by keyboard, returns focus, and escapes each menu level', async () => {
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)

        const item = screen.getByRole('button', { name: 'Customer' })
        fireEvent.contextMenu(item)
        const actionsItem = screen.getByRole('menuitem', { name: 'Actions' })
        actionsItem.focus()

        await user.keyboard('{ArrowRight}')
        expect(screen.getByRole('menu', { name: 'Actions' })).toBeInTheDocument()

        await user.keyboard('{ArrowLeft}')
        expect(screen.queryByRole('menu', { name: 'Actions' })).not.toBeInTheDocument()
        expect(actionsItem).toHaveFocus()

        await user.keyboard('{ArrowRight}')
        await user.keyboard('{Escape}')
        expect(screen.queryByRole('menu', { name: 'Actions' })).not.toBeInTheDocument()
        expect(actionsItem).toHaveFocus()

        await user.keyboard('{Escape}')
        expect(screen.queryByRole('menu', { name: 'Diagram item' })).not.toBeInTheDocument()
    })

    it('opens preselected child action with selected-item context and clears menus', async () => {
        const service = createService()
        const getCurrentDiagramSnapshot = vi.spyOn(service, 'getCurrentDiagramSnapshot')
        const user = userEvent.setup()
        render(<DiagramView service={service} />)
        const currentDiagramReadsAfterRender = getCurrentDiagramSnapshot.mock.calls.length

        const item = screen.getByRole('button', { name: 'Customer' })
        fireEvent.contextMenu(item)
        await user.click(screen.getByRole('menuitem', { name: 'Actions' }))
        await user.click(screen.getByRole('menuitem', { name: 'Detail' }))

        const popup = screen.getByRole('dialog')
        expect(popup).toHaveAttribute('data-action-id', 'detail')
        expect(popup.getAttribute('data-context')).toContain('"parentNode":"Customer"')
        expect(screen.queryByRole('menu', { name: 'Diagram item' })).not.toBeInTheDocument()
        expect(screen.queryByRole('menu', { name: 'Actions' })).not.toBeInTheDocument()
        expect(getCurrentDiagramSnapshot).toHaveBeenCalledTimes(currentDiagramReadsAfterRender)
    })

    it('shows disabled empty rows inside corresponding submenus', async () => {
        actions.splice(0, 1)
        const service = createService()
        vi.mocked(service.getSavedChildren).mockReturnValue([])
        const user = userEvent.setup()
        render(<DiagramView service={service} />)

        fireEvent.contextMenu(screen.getByRole('button', { name: 'Customer' }))
        await user.click(screen.getByRole('menuitem', { name: 'Actions' }))
        expect(screen.getByRole('menuitem', { name: 'No child actions' })).toHaveAttribute('aria-disabled', 'true')

        await user.keyboard('{ArrowLeft}')
        await user.click(screen.getByRole('menuitem', { name: 'Saved diagrams' }))
        expect(screen.getByRole('menuitem', { name: 'No saved diagrams' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('opens item menu from a selectable edge with its accessible label', async () => {
        const service = createService()
        render(<DiagramView service={service} />)

        fireEvent.contextMenu(screen.getByRole('button', { name: 'places' }))

        expect(service.openItemMenu).toHaveBeenCalledWith(expect.objectContaining({diagramId: 'child-1', itemId: 'customer-orders', itemLabel: 'places', objectKind: 'edge', surface: 'current'}))
    })

    it('navigates Back, breadcrumbs, and saved diagrams without opening action popup', async () => {
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)

        await user.click(screen.getByRole('button', { name: 'Back' }))
        await user.click(screen.getByRole('button', { name: 'Overview' }))
        fireEvent.contextMenu(screen.getByRole('button', { name: 'Customer' }))
        await user.click(screen.getByRole('menuitem', { name: 'Saved diagrams' }))
        await user.click(screen.getByRole('menuitem', { name: 'Saved Orders' }))

        expect(service.navigateBack).toHaveBeenCalledTimes(1)
        expect(service.navigateToCrumb).toHaveBeenCalledWith(0)
        expect(service.navigateToSavedDiagram).toHaveBeenCalledWith('saved-1')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.queryByRole('menu', { name: 'Diagram item' })).not.toBeInTheDocument()
    })

    it('shows Current and New regions only while an edit session is active', () => {
        const service = createService()
        const { editSession, geometry } = createEditHarness()
        const layoutService = new DiagramComparisonLayoutService()
        const { unmount } = render(
            <DiagramView editSession={editSession} geometry={geometry} layoutService={layoutService} service={service} />,
        )

        expect(screen.queryByRole('group', { name: 'Diagram comparison layout' })).not.toBeInTheDocument()
        expect(screen.getByRole('region', { name: 'Current' })).toBeInTheDocument()
        expect(screen.getByRole('region', { name: 'New' })).toBeInTheDocument()

        unmount()
        editSession.discard()
        render(<DiagramView editSession={editSession} geometry={geometry} layoutService={layoutService} service={service} />)

        expect(screen.queryByRole('group', { name: 'Diagram comparison layout' })).not.toBeInTheDocument()
        expect(screen.queryByRole('region', { name: 'Current' })).not.toBeInTheDocument()
        expect(screen.queryByRole('region', { name: 'New' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Customer' })).toBeInTheDocument()
        expect(screen.getByRole('slider', { name: 'Current diagram zoom' })).toBeInTheDocument()
    })

    it('does not render Edit diagram over diagram content', () => {
        const service = createService()
        const { editSession, geometry } = createEditHarness(false)
        render(<DiagramView editSession={editSession} geometry={geometry} service={service} />)

        expect(screen.queryByRole('button', { name: 'Edit diagram' })).not.toBeInTheDocument()
        expect(editSession.getSessionSnapshot()).toBeNull()
    })

    it('changes comparison mode without replacing edit-session state', async () => {
        const service = createService()
        const { editSession, geometry } = createEditHarness()
        const layoutService = new DiagramComparisonLayoutService()
        const originalDiagram = editSession.getOriginalDiagramSnapshot()
        const editableDiagram = editSession.getEditableDiagram()
        const sessionSnapshot = editSession.getSessionSnapshot()
        editSession.setNodeField('customer', 'label', 'Edited customer')
        editSession.setActiveTool('node:component')
        editSession.setViewportScale(1.5)
        service.setViewportScale(0.5)
        render(
            <DiagramView editSession={editSession} geometry={geometry} layoutService={layoutService} service={service} />,
        )

        layoutService.setComparisonMode('horizontal')
        layoutService.setComparisonMode('tabbed')

        expect(editSession.getOriginalDiagramSnapshot()).toBe(originalDiagram)
        expect(editSession.getEditableDiagram()).toBe(editableDiagram)
        expect(editSession.getSessionSnapshot()).toBe(sessionSnapshot)
        expect(editSession.getDirtySnapshot()).toBe(true)
        expect(editSession.getNodeFieldSnapshot('customer', 'label')).toBe('Edited customer')
        expect(editSession.getLastSelectedCreationToolSnapshot()).toBe('node:component')
        expect(editSession.getViewportScaleSnapshot()).toBe(1.5)
        expect(service.getViewportScaleSnapshot()).toBe(0.5)
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
        expect(screen.getAllByRole('tab', { name: 'Current' }).length).toBeGreaterThan(0)
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
