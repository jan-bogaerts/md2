import { describe, expect, it } from 'vitest'
import type { DiagramData } from './diagram_data'
import { DiagramEditSessionService } from './diagram_edit_session_service'
import { DiagramGeometryService } from './diagram_geometry_service'
import type { DiagramRecord } from './diagram_index'
import {
    DiagramResizeService,
    MINIMUM_DIAGRAM_GROUP_HEIGHT,
    MINIMUM_DIAGRAM_GROUP_WIDTH,
} from './diagram_resize_service'
import { DiagramSelectionService, type DiagramSelectionIdentity } from './diagram_selection_service'
import type { DiagramViewSourceSnapshot } from './diagram_view_service'

const diagram: DiagramData = {
    edges: [{
        from: 'orders',
        id: 'orders-store',
        kind: 'connection',
        sourceAttachment: { nodeId: 'orders', offset: 0.5, side: 'right' },
        targetAttachment: { nodeId: 'store', offset: 0.5, side: 'left' },
        to: 'store',
    }],
    groups: [{ height: 120, id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'], width: 240, x: 20, y: 20 }],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { id: 'orders', label: 'Orders', role: 'focal', x: 40, y: 40 },
        { height: 56, id: 'store', label: 'Store', role: 'store', width: 120, x: 240, y: 40 },
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
    const selection = new DiagramSelectionService(session, geometry)
    const resize = new DiagramResizeService(session, geometry, selection)
    session.bindProject(project)
    session.start()

    return { geometry, resize, selection, session }
}

describe('DiagramResizeService', () => {
    it('snaps node size to grid, writes explicit dimensions, and reroutes an attached endpoint', () => {
        const { geometry, resize, selection, session } = createHarness()
        selection.replace([orders])
        const startingWidth = geometry.getNodeGeometryFieldSnapshot('orders', 'width') as number

        expect(resize.beginResize(orders, 'east', { x: 200, y: 100 })).toBe(true)
        expect(session.getTransientGestureSnapshot()).toBe('resize')
        expect(resize.updateResize({ x: 205, y: 177 })).toBe(true)

        expect(session.getNodeFieldSnapshot('orders', 'width')).toBe(startingWidth + 4)
        expect(session.getNodeFieldSnapshot('orders', 'height')).toBe(72)
        expect(session.getNodeFieldSnapshot('orders', 'x')).toBe(40)
        expect(session.getNodeFieldSnapshot('orders', 'y')).toBe(40)
        expect(geometry.getEdgeRouteSnapshot('orders-store')[0]).toEqual({ x: 40 + startingWidth + 4, y: 76 })
        expect(resize.completeResize()).toBe(true)
        expect(session.getTransientGestureSnapshot()).toBeNull()
    })

    it('clamps north-west group resize to named minima while preserving opposite edges and membership', () => {
        const { resize, selection, session } = createHarness()
        selection.replace([group])
        const membership = session.getGroupNodeIdsSnapshot('backend')

        resize.beginResize(group, 'north-west', { x: 20, y: 20 })
        resize.updateResize({ x: 500, y: 500 })

        expect(session.getGroupSnapshot('backend')).toMatchObject({
            height: MINIMUM_DIAGRAM_GROUP_HEIGHT,
            width: MINIMUM_DIAGRAM_GROUP_WIDTH,
            x: 20 + 240 - MINIMUM_DIAGRAM_GROUP_WIDTH,
            y: 20 + 120 - MINIMUM_DIAGRAM_GROUP_HEIGHT,
        })
        expect(session.getGroupNodeIdsSnapshot('backend')).toBe(membership)
    })

    it('allows only one selected node or group while Select is active', () => {
        const { resize, selection, session } = createHarness()

        selection.replace([edge])
        expect(resize.beginResize(edge, 'east', { x: 0, y: 0 })).toBe(false)
        selection.replace([orders, store])
        expect(resize.beginResize(orders, 'east', { x: 0, y: 0 })).toBe(false)
        selection.replace([orders])
        session.setActiveTool('group')
        expect(resize.beginResize(orders, 'east', { x: 0, y: 0 })).toBe(false)
        expect(session.getTransientGestureSnapshot()).toBeNull()
    })

    it('restores omitted geometry and removes changes when cancelled', () => {
        const automaticDiagram = structuredClone(diagram)
        delete automaticDiagram.nodes[0].height
        delete automaticDiagram.nodes[0].width
        delete automaticDiagram.nodes[0].x
        delete automaticDiagram.nodes[0].y
        const { geometry, resize, selection, session } = createHarness(automaticDiagram)
        selection.replace([orders])
        const startingBox = {
            height: geometry.getNodeGeometryFieldSnapshot('orders', 'height'),
            width: geometry.getNodeGeometryFieldSnapshot('orders', 'width'),
            x: geometry.getNodeGeometryFieldSnapshot('orders', 'x'),
            y: geometry.getNodeGeometryFieldSnapshot('orders', 'y'),
        }
        resize.beginResize(orders, 'north-west', { x: 0, y: 0 })
        resize.updateResize({ x: -12, y: -8 })

        expect(resize.cancelResize()).toBe(true)

        expect(session.getNodeFieldSnapshot('orders', 'height')).toBeUndefined()
        expect(session.getNodeFieldSnapshot('orders', 'width')).toBeUndefined()
        expect(session.getNodeFieldSnapshot('orders', 'x')).toBeUndefined()
        expect(session.getNodeFieldSnapshot('orders', 'y')).toBeUndefined()
        expect({
            height: geometry.getNodeGeometryFieldSnapshot('orders', 'height'),
            width: geometry.getNodeGeometryFieldSnapshot('orders', 'width'),
            x: geometry.getNodeGeometryFieldSnapshot('orders', 'x'),
            y: geometry.getNodeGeometryFieldSnapshot('orders', 'y'),
        }).toEqual(startingBox)
        expect(session.getChangeIdsSnapshot()).toEqual([])
        expect(session.getTransientGestureSnapshot()).toBeNull()
    })

    it('rolls back when Escape cancellation or another gesture replaces resize', () => {
        const { resize, selection, session } = createHarness()
        selection.replace([orders])
        resize.beginResize(orders, 'south-east', { x: 0, y: 0 })
        resize.updateResize({ x: 12, y: 8 })

        expect(session.cancelActiveInteraction()).toBe(true)
        expect(session.getNodeFieldSnapshot('orders', 'width')).toBeUndefined()
        expect(resize.getResizeActiveSnapshot()).toBe(false)

        resize.beginResize(orders, 'south-east', { x: 0, y: 0 })
        resize.updateResize({ x: 8, y: 4 })
        session.beginTransientGesture('move')
        expect(session.getNodeFieldSnapshot('orders', 'width')).toBeUndefined()
        expect(resize.getResizeActiveSnapshot()).toBe(false)
    })

    it('rejects invalid points and overlapping resizes', () => {
        const { resize, selection } = createHarness()
        selection.replace([orders])
        expect(() => resize.beginResize(orders, 'east', { x: Number.NaN, y: 0 })).toThrow('Diagram resize point must be finite')

        resize.beginResize(orders, 'east', { x: 0, y: 0 })
        expect(() => resize.beginResize(orders, 'east', { x: 0, y: 0 })).toThrow('another resize is active')
        expect(() => resize.updateResize({ x: Number.POSITIVE_INFINITY, y: 0 })).toThrow('Diagram resize point must be finite')
    })
})
