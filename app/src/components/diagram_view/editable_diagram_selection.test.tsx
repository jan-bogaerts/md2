import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import { DiagramSelectionService } from '../../services/diagrams/diagram_selection_service'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { EditableDiagram } from './editable_diagram'

const diagram: DiagramData = {
    edges: [{ from: 'orders', id: 'orders-store', kind: 'connection', label: 'writes', to: 'store' }],
    groups: [{ id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'] }],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { drilldown: false, id: 'orders', label: 'Orders', role: 'focal' },
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

function renderHarness() {
    const session = new DiagramEditSessionService(new DiagramSourceStub())
    session.bindProject(project)
    session.start()
    const geometry = new DiagramGeometryService(session)
    const selection = new DiagramSelectionService(session)
    render(<EditableDiagram geometry={geometry} selection={selection} session={session} />)

    return { geometry, selection, session }
}

afterEach(cleanup)

describe('EditableDiagram direct selection', () => {
    it('replaces selection when a New node, edge, or group is clicked', async () => {
        const { selection } = renderHarness()
        const user = userEvent.setup()

        await user.click(screen.getByRole('button', { name: 'Orders' }))
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'orders', objectKind: 'node' }])
        expect(screen.getByRole('button', { name: 'Orders' })).toHaveAttribute('aria-pressed', 'true')

        await user.click(screen.getByRole('button', { name: 'writes' }))
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'orders-store', objectKind: 'edge' }])
        expect(screen.getByRole('button', { name: 'Orders' })).toHaveAttribute('aria-pressed', 'false')
        expect(screen.getByRole('button', { name: 'writes' })).toHaveAttribute('aria-pressed', 'true')

        await user.click(screen.getByRole('button', { name: 'Backend' }))
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'backend', objectKind: 'group' }])
        expect(screen.getByRole('button', { name: 'Backend' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('adds and removes mixed object kinds with Ctrl-click', async () => {
        const { selection } = renderHarness()
        const user = userEvent.setup()
        const orders = screen.getByRole('button', { name: 'Orders' })
        const edge = screen.getByRole('button', { name: 'writes' })
        const group = screen.getByRole('button', { name: 'Backend' })

        await user.click(orders)
        await user.keyboard('{Control>}')
        await user.click(edge)
        await user.click(group)
        await user.click(edge)
        await user.keyboard('{/Control}')

        expect(selection.getSelectionSnapshot()).toEqual([
            { objectId: 'orders', objectKind: 'node' },
            { objectId: 'backend', objectKind: 'group' },
        ])
        expect(orders).toHaveAttribute('aria-pressed', 'true')
        expect(edge).toHaveAttribute('aria-pressed', 'false')
        expect(group).toHaveAttribute('aria-pressed', 'true')
    })

    it('replaces an additive selection on a plain click', async () => {
        const { selection } = renderHarness()
        const user = userEvent.setup()

        await user.keyboard('{Control>}')
        await user.click(screen.getByRole('button', { name: 'Orders' }))
        await user.click(screen.getByRole('button', { name: 'Backend' }))
        await user.keyboard('{/Control}')
        await user.click(screen.getByRole('button', { name: 'Store' }))

        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'store', objectKind: 'node' }])
    })

    it('changes only selection membership during Ctrl-click', async () => {
        const { geometry, selection, session } = renderHarness()
        const user = userEvent.setup()
        const editableDiagram = session.getEditableDiagram()
        const ordersNode = session.getNodeSnapshot('orders')
        const edgeRoute = geometry.getEdgeRouteSnapshot('orders-store')
        const transientGesture = session.getTransientGestureSnapshot()
        const viewportScale = session.getViewportScaleSnapshot()

        await user.keyboard('{Control>}')
        await user.click(screen.getByRole('button', { name: 'Orders' }))
        await user.click(screen.getByRole('button', { name: 'writes' }))
        await user.keyboard('{/Control}')

        expect(selection.getSelectionSnapshot()).toEqual([
            { objectId: 'orders', objectKind: 'node' },
            { objectId: 'orders-store', objectKind: 'edge' },
        ])
        expect(session.getEditableDiagram()).toBe(editableDiagram)
        expect(session.getNodeSnapshot('orders')).toBe(ordersNode)
        expect(geometry.getEdgeRouteSnapshot('orders-store')).toBe(edgeRoute)
        expect(session.getTransientGestureSnapshot()).toBe(transientGesture)
        expect(session.getViewportScaleSnapshot()).toBe(viewportScale)
        expect(session.getChangeIdsSnapshot()).toEqual([])
        expect(session.getDirtySnapshot()).toBe(false)
    })

    it('clears selection when empty New surface is clicked', () => {
        const { selection } = renderHarness()
        act(() => { selection.replace([{ objectId: 'orders', objectKind: 'node' }]) })

        fireEvent.click(screen.getByLabelText('New diagram'))

        expect(selection.getSelectionSnapshot()).toEqual([])
    })

    it.each([
        ['non-drilldown node', 'Orders', 'orders', 'node'],
        ['edge', 'writes', 'orders-store', 'edge'],
        ['group', 'Backend', 'backend', 'group'],
    ] as const)('selects a focused New %s from keyboard activation', async (_description, label, objectId, objectKind) => {
        const { selection } = renderHarness()
        const user = userEvent.setup()
        const object = screen.getByRole('button', { name: label })

        object.focus()
        await user.keyboard('{Enter}')

        expect(selection.getSelectionSnapshot()).toEqual([{ objectId, objectKind }])
    })

    it('leaves selection unchanged when another persistent tool is active', async () => {
        const { selection, session } = renderHarness()
        const user = userEvent.setup()
        act(() => {
            selection.replace([{ objectId: 'backend', objectKind: 'group' }])
            session.setActiveTool('node:component')
        })

        await user.keyboard('{Control>}')
        await user.click(screen.getByRole('button', { name: 'Orders' }))
        await user.keyboard('{/Control}')
        fireEvent.click(screen.getByLabelText('New diagram'))

        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'backend', objectKind: 'group' }])
    })
})
