import { describe, expect, it, vi } from 'vitest'
import type { DiagramData, DiagramType } from './diagram_data'
import { DiagramEditSessionService } from './diagram_edit_session_service'
import { DiagramGeometryService } from './diagram_geometry_service'
import type { DiagramRecord } from './diagram_index'
import type { DiagramViewSourceSnapshot } from './diagram_view_service'

const record: DiagramRecord = { actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'design/diagrams/overview.json' }
const project = { branch: 'main', id: 'project', rootPath: 'C:/repo' }

function architectureDiagram(): DiagramData {
    return {
        edges: [
            { from: 'orders', id: 'orders-store', kind: 'connection', to: 'store' },
            { from: 'orders', id: 'orders-mail', kind: 'connection', to: 'mail' },
        ],
        groups: [{ id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'] }],
        meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
        nodes: [
            { id: 'orders', label: 'Orders', role: 'focal' },
            { height: 64, id: 'store', label: 'Store', role: 'store', width: 120, x: 240, y: 320 },
            { id: 'mail', label: 'Mail', role: 'external' },
        ],
    }
}

function sequenceDiagram(): DiagramData {
    return {
        edges: [
            { from: 'user', id: 'user-orders', kind: 'call', to: 'orders' },
            { from: 'orders', id: 'orders-store', kind: 'call', to: 'store' },
            { from: 'store', id: 'store-orders', kind: 'return', to: 'orders' },
            { from: 'orders', id: 'orders-user', kind: 'return', to: 'user' },
        ],
        fragments: [{ id: 'transaction', operator: 'opt', regions: [{ edgeIds: ['orders-store'], guard: 'requested' }] }],
        groups: [],
        meta: { description: 'Order call flow', title: 'Calls', type: 'sequence', version: 1 },
        nodes: [
            { id: 'user', kind: 'participant', label: 'User', role: 'external' },
            { id: 'orders', kind: 'participant', label: 'Orders', role: 'focal' },
            { id: 'store', kind: 'participant', label: 'Store', role: 'store' },
        ],
    }
}

function dependencyDiagram(): DiagramData {
    return {
        edges: [
            { from: 'app', id: 'app-core', kind: 'dependency', to: 'core' },
            { from: 'core', id: 'core-app', kind: 'cycle', to: 'app' },
        ],
        groups: [],
        meta: { description: 'Module dependencies', title: 'Modules', type: 'dependency', version: 1 },
        nodes: [
            { id: 'app', label: 'App', role: 'focal' },
            { id: 'core', label: 'Core', role: 'backend' },
        ],
    }
}

function flowDiagram(): DiagramData {
    return {
        edges: [
            { from: 'begin', id: 'begin-check', kind: 'flow', to: 'check' },
            { from: 'check', id: 'check-done', kind: 'flow', label: 'yes', to: 'done' },
        ],
        groups: [],
        meta: { description: 'Order flow', preset: 'flowchart', title: 'Flow', type: 'flow', version: 1 },
        nodes: [
            { id: 'begin', kind: 'start', label: 'Begin', role: 'input' },
            { id: 'check', kind: 'decision', label: 'Valid?', role: 'focal' },
            { id: 'done', kind: 'end', label: 'Done', role: 'backend' },
        ],
    }
}

function entityDiagram(): DiagramData {
    return {
        edges: [{ from: 'order', fromCardinality: '1', id: 'order-line', kind: 'relationship', to: 'line', toCardinality: '1..*' }],
        groups: [],
        meta: { description: 'Order model', title: 'Orders', type: 'entity', version: 1 },
        nodes: [
            { fields: [{ key: 'primary', name: 'id', type: 'uuid' }], id: 'order', label: 'Order', role: 'focal' },
            { fields: [{ key: 'foreign', name: 'orderId' }], id: 'line', label: 'Line', role: 'backend' },
        ],
    }
}

class DiagramSourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot

    constructor(diagram: DiagramData) {
        super()
        this.source = { diagram, record }
    }

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

function createHarness(diagram: DiagramData = architectureDiagram()) {
    const session = new DiagramEditSessionService(new DiagramSourceStub(diagram))
    session.bindProject(project)
    session.start()
    const geometry = new DiagramGeometryService(session)

    return { geometry, session }
}

/** Records every geometry event the service dispatches, so a test can assert the exact notification set of one edit. */
function recordGeometryEvents(geometry: DiagramGeometryService) {
    const dispatched: string[] = []
    const originalDispatch = geometry.dispatchEvent.bind(geometry)
    geometry.dispatchEvent = (event: Event) => {
        dispatched.push(event.type)

        return originalDispatch(event)
    }

    return dispatched
}

function nodeBox(geometry: DiagramGeometryService, nodeId: string) {
    return {
        height: geometry.getNodeGeometryFieldSnapshot(nodeId, 'height'),
        width: geometry.getNodeGeometryFieldSnapshot(nodeId, 'width'),
        x: geometry.getNodeGeometryFieldSnapshot(nodeId, 'x'),
        y: geometry.getNodeGeometryFieldSnapshot(nodeId, 'y'),
    }
}

function groupBoxSnapshot(geometry: DiagramGeometryService, groupId: string) {
    return {
        height: geometry.getGroupGeometryFieldSnapshot(groupId, 'height'),
        width: geometry.getGroupGeometryFieldSnapshot(groupId, 'width'),
        x: geometry.getGroupGeometryFieldSnapshot(groupId, 'x'),
        y: geometry.getGroupGeometryFieldSnapshot(groupId, 'y'),
    }
}

describe('DiagramGeometryService', () => {
    it('builds the initial positioned view from the started session', () => {
        const { geometry } = createHarness()

        expect(nodeBox(geometry, 'store')).toEqual({ height: 64, width: 120, x: 240, y: 320 })
        expect(geometry.getEdgeRouteSnapshot('orders-store').length).toBeGreaterThan(1)
        expect(geometry.getSurfaceFieldSnapshot('width')).toBeGreaterThan(0)
    })

    it('moves one node and reroutes only its incident edges', () => {
        const { geometry, session } = createHarness()
        const unrelatedBefore = nodeBox(geometry, 'mail')
        const incidentBefore = geometry.getEdgeRouteSnapshot('orders-store')
        const otherIncidentBefore = geometry.getEdgeRouteSnapshot('orders-mail')

        session.setNodeField('store', 'x', 600)

        expect(nodeBox(geometry, 'store').x).toBe(600)
        expect(nodeBox(geometry, 'mail')).toEqual(unrelatedBefore)
        expect(geometry.getEdgeRouteSnapshot('orders-store')).not.toBe(incidentBefore)
        expect(geometry.getEdgeRouteSnapshot('orders-mail')).toBe(otherIncidentBefore)
    })

    it('dispatches events only for the moved node, its incident edges, and a changed surface bound', () => {
        const { geometry, session } = createHarness()
        const dispatched = recordGeometryEvents(geometry)

        session.setNodeField('store', 'x', 600)

        expect(dispatched).toContain('geometry:node:store:x')
        expect(dispatched).toContain('geometry:edge:orders-store:points')
        expect(dispatched).toContain('geometry:surface:surface:width')
        expect(dispatched.filter((type) => type.startsWith('geometry:node:')))
            .toEqual(['geometry:node:store:x'])
        expect(dispatched.some((type) => type.startsWith('geometry:edge:orders-mail'))).toBe(false)
        expect(dispatched.some((type) => type.startsWith('geometry:group:'))).toBe(false)
    })

    it('dispatches no surface event when a move stays inside the current bounds', () => {
        const { geometry, session } = createHarness()
        session.setNodeField('store', 'x', 1200)
        const width = geometry.getSurfaceFieldSnapshot('width')
        const dispatched = recordGeometryEvents(geometry)

        session.setNodeField('mail', 'x', 120)

        expect(geometry.getSurfaceFieldSnapshot('width')).toBe(width)
        expect(dispatched).not.toContain('geometry:surface:surface:width')
        expect(dispatched).toContain('geometry:node:mail:x')
    })

    it('shrinks a surface bound back when the object that widened it moves back', () => {
        const { geometry, session } = createHarness()
        const originalWidth = geometry.getSurfaceFieldSnapshot('width')

        session.setNodeField('store', 'x', 1200)
        const widened = geometry.getSurfaceFieldSnapshot('width')
        session.setNodeField('store', 'x', 240)

        expect(widened).toBeGreaterThan(originalWidth)
        expect(geometry.getSurfaceFieldSnapshot('width')).toBe(originalWidth)
    })

    it('runs no geometry update for a non-geometric field change', () => {
        const { geometry, session } = createHarness()
        const routeBefore = geometry.getEdgeRouteSnapshot('orders-store')
        const dispatched = recordGeometryEvents(geometry)

        session.setNodeField('orders', 'label', 'Order service')
        session.setNodeField('orders', 'role', 'backend')
        session.setNodeField('orders', 'sublabel', 'service')
        session.setNodeField('orders', 'tag', 'core')
        session.setMetadataField('title', 'Renamed')

        expect(dispatched).toEqual([])
        expect(geometry.getEdgeRouteSnapshot('orders-store')).toBe(routeBefore)
    })

    it('runs no geometry update for an entity field change', () => {
        const { geometry, session } = createHarness(entityDiagram())
        const routeBefore = geometry.getEdgeRouteSnapshot('order-line')
        const dispatched = recordGeometryEvents(geometry)

        session.setEntityField('order', 0, 'name', 'identifier')

        expect(dispatched).toEqual([])
        expect(geometry.getEdgeRouteSnapshot('order-line')).toBe(routeBefore)
    })

    it('cascades nothing when a model edit leaves the derived value unchanged', () => {
        const { geometry, session } = createHarness()
        const derivedX = geometry.getNodeGeometryFieldSnapshot('mail', 'x')
        const routeBefore = geometry.getEdgeRouteSnapshot('orders-mail')
        const dispatched = recordGeometryEvents(geometry)

        session.setNodeField('mail', 'x', derivedX as number)

        expect(dispatched).toEqual([])
        expect(geometry.getEdgeRouteSnapshot('orders-mail')).toBe(routeBefore)
    })

    it('keeps explicit user geometry when an unrelated node moves', () => {
        const { geometry, session } = createHarness()
        const explicit = nodeBox(geometry, 'store')

        session.setNodeField('mail', 'x', 800)
        session.setNodeField('mail', 'y', 800)

        expect(nodeBox(geometry, 'store')).toEqual(explicit)
    })

    it('keeps a group box independent of its member nodes', () => {
        const { geometry, session } = createHarness()
        const before = groupBoxSnapshot(geometry, 'backend')

        session.setNodeField('store', 'x', 900)

        expect(groupBoxSnapshot(geometry, 'backend')).toEqual(before)

        session.setGroupField('backend', 'x', 40)

        expect(geometry.getGroupGeometryFieldSnapshot('backend', 'x')).toBe(40)
    })

    it('updates only the edited edge route and endpoint fan-in when an endpoint changes', () => {
        const { geometry, session } = createHarness()
        const unrelatedRoute = geometry.getEdgeRouteSnapshot('orders-mail')

        expect(geometry.getNodeGeometryFieldSnapshot('store', 'fanIn')).toBe(1)

        session.setEdgeField('orders-store', 'to', 'mail')

        expect(geometry.getNodeGeometryFieldSnapshot('store', 'fanIn')).toBe(0)
        expect(geometry.getNodeGeometryFieldSnapshot('mail', 'fanIn')).toBe(2)
        expect(geometry.getEdgeRouteSnapshot('orders-mail')).toBe(unrelatedRoute)
    })

    it('computes geometry for an added node without moving existing nodes', () => {
        const { geometry, session } = createHarness()
        const before = nodeBox(geometry, 'store')

        const nodeId = session.createNode({ label: 'Audit', role: 'backend', x: 40, y: 40 })
        if (!nodeId) throw new Error('Expected node creation to succeed')

        expect(nodeBox(geometry, nodeId)).toMatchObject({ x: 40, y: 40 })
        expect(nodeBox(geometry, 'store')).toEqual(before)
    })

    it('drops the view entries of a removed node and its incident edges only', () => {
        const { geometry, session } = createHarness()

        session.removeNode('store')

        expect(geometry.getNodeGeometryFieldSnapshot('store', 'x')).toBeNull()
        expect(geometry.getEdgeRouteSnapshot('orders-store')).toHaveLength(0)
        expect(geometry.getEdgeRouteSnapshot('orders-mail').length).toBeGreaterThan(1)
        expect(geometry.getNodeGeometryFieldSnapshot('orders', 'x')).not.toBeNull()
    })

    it('keeps sequence activations and fragments aligned with their message rows', () => {
        const { geometry, session } = createHarness(sequenceDiagram())
        const activationIds = geometry.getActivationIdsSnapshot()
        const fragmentTop = geometry.getFragmentGeometryFieldSnapshot('transaction', 'y')

        expect(activationIds.length).toBeGreaterThan(0)
        expect(fragmentTop).not.toBeNull()

        session.setNodeField('store', 'x', 700)

        expect(geometry.getFragmentGeometryFieldSnapshot('transaction', 'width')).toBeGreaterThan(0)
        expect(geometry.getActivationIdsSnapshot()).toEqual(activationIds)
    })

    it('moves only later sequence rows when a message is added', () => {
        const { geometry, session } = createHarness(sequenceDiagram())
        const firstRow = geometry.getEdgeRouteSnapshot('user-orders')[0].y
        const lastRowBefore = geometry.getEdgeRouteSnapshot('orders-user')[0].y

        session.createEdge({ from: 'user', kind: 'call', to: 'store' })

        expect(geometry.getEdgeRouteSnapshot('user-orders')[0].y).toBe(firstRow)
        expect(geometry.getEdgeRouteSnapshot('orders-user')[0].y).toBe(lastRowBefore)
    })

    it('keeps every diagram type renderable after a supported mutation', () => {
        const diagrams: Record<DiagramType, DiagramData> = {
            architecture: architectureDiagram(),
            dependency: dependencyDiagram(),
            entity: entityDiagram(),
            flow: flowDiagram(),
            sequence: sequenceDiagram(),
        }
        for (const diagram of Object.values(diagrams)) {
            const { geometry, session } = createHarness(diagram)
            const movedNodeId = diagram.nodes[0].id
            session.setNodeField(movedNodeId, 'x', 320)
            session.setNodeField(movedNodeId, 'y', 160)
            const boxes = diagram.nodes.map(({ id }) => nodeBox(geometry, id))
            const routes = diagram.edges.map(({ id }) => geometry.getEdgeRouteSnapshot(id))

            expect(boxes.every(({ height, width, x, y }) => [height, width, x, y].every((value) => Number.isFinite(value)))).toBe(true)
            expect(routes.every((route) => route.length > 1)).toBe(true)
            expect(geometry.getSurfaceFieldSnapshot('height')).toBeGreaterThan(0)
        }
    })

    it('clears the positioned view when the session is discarded', () => {
        const { geometry, session } = createHarness()
        const listener = vi.fn()
        geometry.subscribeGeometrySession(listener)

        session.discard()

        expect(listener).toHaveBeenCalledTimes(1)
        expect(geometry.getNodeGeometryFieldSnapshot('orders', 'x')).toBeNull()
        expect(geometry.getSurfaceFieldSnapshot('width')).toBe(0)
    })
})
