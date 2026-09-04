import { describe, expect, it, vi } from 'vitest'
import type { DiagramData } from './diagram_data'
import { DiagramEditSessionService } from './diagram_edit_session_service'
import { DiagramGeometryService } from './diagram_geometry_service'
import type { DiagramRecord } from './diagram_index'
import { DiagramMoveService } from './diagram_move_service'
import { DiagramSelectionService, type DiagramSelectionIdentity } from './diagram_selection_service'
import type { DiagramViewSourceSnapshot } from './diagram_view_service'

const diagram: DiagramData = {
    edges: [{ from: 'orders', id: 'orders-store', kind: 'connection', to: 'store' }],
    groups: [{ height: 120, id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'], width: 240, x: 20, y: 20 }],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { height: 56, id: 'orders', label: 'Orders', role: 'focal', width: 120, x: 40, y: 40 },
        { height: 56, id: 'store', label: 'Store', role: 'store', width: 120, x: 200, y: 40 },
        { height: 56, id: 'external', label: 'External', role: 'external', width: 120, x: 360, y: 40 },
    ],
}
const record: DiagramRecord = { actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'design/diagrams/overview.json' }
const project = { branch: 'main', id: 'project', rootPath: 'C:/repo' }
const orders: DiagramSelectionIdentity = { objectId: 'orders', objectKind: 'node' }
const store: DiagramSelectionIdentity = { objectId: 'store', objectKind: 'node' }
const edge: DiagramSelectionIdentity = { objectId: 'orders-store', objectKind: 'edge' }
const group: DiagramSelectionIdentity = { objectId: 'backend', objectKind: 'group' }

class DiagramSourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot

    constructor(sourceDiagram: DiagramData) {
        super()
        this.source = { diagram: sourceDiagram, record }
    }

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

function createHarness(sourceDiagram: DiagramData = diagram) {
    const session = new DiagramEditSessionService(new DiagramSourceStub(sourceDiagram))
    const geometry = new DiagramGeometryService(session)
    const selection = new DiagramSelectionService(session)
    const movement = new DiagramMoveService(session, geometry, selection)
    session.bindProject(project)
    session.start()

    return { geometry, movement, selection, session }
}

describe('DiagramMoveService', () => {
    it('snaps one shared delta and moves only selected nodes and independent groups', () => {
        const { movement, selection, session } = createHarness()
        selection.replace([orders, store, edge, group])
        const membership = session.getGroupNodeIdsSnapshot('backend')
        const externalXChanged = vi.fn()
        session.subscribeNodeField('external', 'x', externalXChanged)

        expect(movement.beginMove(orders, { x: 101, y: 102 })).toBe(true)
        expect(session.getTransientGestureSnapshot()).toBe('move')
        expect(movement.updateMove({ x: 106, y: 111 })).toBe(true)

        expect(session.getNodeFieldSnapshot('orders', 'x')).toBe(44)
        expect(session.getNodeFieldSnapshot('orders', 'y')).toBe(48)
        expect(session.getNodeFieldSnapshot('store', 'x')).toBe(204)
        expect(session.getNodeFieldSnapshot('store', 'y')).toBe(48)
        expect(session.getGroupFieldSnapshot('backend', 'x')).toBe(24)
        expect(session.getGroupFieldSnapshot('backend', 'y')).toBe(28)
        expect(session.getGroupNodeIdsSnapshot('backend')).toBe(membership)
        expect(externalXChanged).not.toHaveBeenCalled()
        expect(movement.completeMove()).toBe(true)
        expect(session.getTransientGestureSnapshot()).toBeNull()
    })

    it('coalesces repeated pointer updates into the same final field changes', () => {
        const { movement, selection, session } = createHarness()
        selection.replace([orders, store])
        movement.beginMove(orders, { x: 0, y: 0 })
        movement.updateMove({ x: 5, y: 5 })
        const changeIds = session.getChangeIdsSnapshot()

        movement.updateMove({ x: 13, y: 17 })

        expect(session.getChangeIdsSnapshot()).toBe(changeIds)
        expect(changeIds).toHaveLength(4)
        expect(changeIds.map((changeId) => session.getChange(changeId)?.value)).toEqual([52, 56, 212, 56])
        movement.completeMove()
    })

    it('replaces selection for a newly selected target and leaves edge-only selections stationary', () => {
        const { movement, selection, session } = createHarness()
        selection.replace([orders, store])

        expect(movement.beginMove(group, { x: 0, y: 0 })).toBe(true)
        expect(selection.getSelectionSnapshot()).toEqual([group])
        movement.updateMove({ x: 8, y: 4 })
        movement.completeMove()
        expect(session.getGroupFieldSnapshot('backend', 'x')).toBe(28)
        expect(session.getNodeFieldSnapshot('orders', 'x')).toBe(40)

        expect(movement.beginMove(edge, { x: 0, y: 0 })).toBe(false)
        expect(selection.getSelectionSnapshot()).toEqual([edge])
        expect(session.getTransientGestureSnapshot()).toBeNull()
    })

    it('cancel restores starting model and visible geometry, including omitted coordinates', () => {
        const automaticDiagram: DiagramData = structuredClone(diagram)
        delete automaticDiagram.nodes[0].x
        delete automaticDiagram.nodes[0].y
        const { geometry, movement, selection, session } = createHarness(automaticDiagram)
        selection.replace([orders])
        const startX = geometry.getNodeGeometryFieldSnapshot('orders', 'x')
        const startY = geometry.getNodeGeometryFieldSnapshot('orders', 'y')
        movement.beginMove(orders, { x: 0, y: 0 })
        movement.updateMove({ x: 12, y: 8 })

        expect(movement.cancelMove()).toBe(true)

        expect(session.getNodeFieldSnapshot('orders', 'x')).toBeUndefined()
        expect(session.getNodeFieldSnapshot('orders', 'y')).toBeUndefined()
        expect(geometry.getNodeGeometryFieldSnapshot('orders', 'x')).toBe(startX)
        expect(geometry.getNodeGeometryFieldSnapshot('orders', 'y')).toBe(startY)
        expect(session.getChangeIdsSnapshot()).toEqual([])
        expect(session.getTransientGestureSnapshot()).toBeNull()
    })

    it('restores geometry when Escape cancellation or a tool switch ends the transient gesture', () => {
        const { movement, selection, session } = createHarness()
        selection.replace([orders])
        movement.beginMove(orders, { x: 0, y: 0 })
        movement.updateMove({ x: 12, y: 8 })

        expect(session.cancelActiveInteraction()).toBe(true)
        expect(session.getNodeFieldSnapshot('orders', 'x')).toBe(40)
        expect(session.getNodeFieldSnapshot('orders', 'y')).toBe(40)
        expect(movement.getMoveActiveSnapshot()).toBe(false)

        movement.beginMove(orders, { x: 0, y: 0 })
        movement.updateMove({ x: 8, y: 4 })
        session.setActiveTool('group')
        expect(session.getNodeFieldSnapshot('orders', 'x')).toBe(40)
        expect(session.getNodeFieldSnapshot('orders', 'y')).toBe(40)
        expect(movement.getMoveActiveSnapshot()).toBe(false)
    })

    it('rejects invalid points, overlapping moves, and movement outside Select', () => {
        const { movement, selection, session } = createHarness()
        selection.replace([orders])
        expect(() => movement.beginMove(orders, { x: Number.NaN, y: 0 })).toThrow('Diagram move point must be finite')

        movement.beginMove(orders, { x: 0, y: 0 })
        expect(() => movement.beginMove(orders, { x: 0, y: 0 })).toThrow('another move is active')
        expect(() => movement.updateMove({ x: Number.POSITIVE_INFINITY, y: 0 })).toThrow('Diagram move point must be finite')
        movement.cancelMove()

        session.setActiveTool('group')
        expect(movement.beginMove(store, { x: 0, y: 0 })).toBe(false)
        expect(selection.getSelectionSnapshot()).toEqual([orders])
    })
})
