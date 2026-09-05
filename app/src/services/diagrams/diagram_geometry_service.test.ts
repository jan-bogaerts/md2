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

function editableDependencyDiagram(): DiagramData {
    return {
        edges: [
            {
                from: 'app', id: 'app-core', kind: 'dependency',
                sourceAttachment: { nodeId: 'app', offset: 0.5, side: 'right' },
                targetAttachment: { nodeId: 'core', offset: 0.5, side: 'left' }, to: 'core',
            },
            {
                from: 'core', id: 'core-app', kind: 'cycle',
                sourceAttachment: { nodeId: 'core', offset: 0.5, side: 'bottom' },
                targetAttachment: { nodeId: 'app', offset: 0.5, side: 'bottom' }, to: 'app',
            },
            {
                from: 'auxiliary', id: 'auxiliary-sink', kind: 'dependency',
                sourceAttachment: { nodeId: 'auxiliary', offset: 0.5, side: 'right' },
                targetAttachment: { nodeId: 'sink', offset: 0.5, side: 'left' }, to: 'sink',
            },
        ],
        groups: [],
        meta: { description: 'Editable dependencies', title: 'Dependencies', type: 'dependency', version: 1 },
        nodes: [
            { height: 64, id: 'app', label: 'App', role: 'focal', width: 120, x: 0, y: 0 },
            { height: 64, id: 'core', label: 'Core', role: 'backend', width: 120, x: 240, y: 0 },
            { height: 64, id: 'auxiliary', label: 'Auxiliary', role: 'external', width: 120, x: 0, y: 200 },
            { height: 64, id: 'sink', label: 'Sink', role: 'store', width: 120, x: 240, y: 200 },
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

function createHarness(diagram: DiagramData = architectureDiagram(), createId?: () => string) {
    const session = new DiagramEditSessionService(new DiagramSourceStub(diagram), createId)
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

    it('reconnects one edge route and refreshes only old and new endpoint fan-in', () => {
        const { geometry, session } = createHarness()
        const routeBefore = geometry.getEdgeRouteSnapshot('orders-store')
        const unrelatedRoute = geometry.getEdgeRouteSnapshot('orders-mail')
        const dispatched = recordGeometryEvents(geometry)

        expect(session.reconnectEdgeEndpoint('orders-store', 'targetAttachment', 'mail')).toBe(true)

        expect(geometry.getEdgeRouteSnapshot('orders-store')).not.toBe(routeBefore)
        expect(geometry.getEdgeRouteSnapshot('orders-mail')).toBe(unrelatedRoute)
        expect(geometry.getNodeGeometryFieldSnapshot('store', 'fanIn')).toBe(0)
        expect(geometry.getNodeGeometryFieldSnapshot('mail', 'fanIn')).toBe(2)
        expect(dispatched).toContain('geometry:edge:orders-store:points')
        expect(dispatched).toContain('geometry:node:store:fanIn')
        expect(dispatched).toContain('geometry:node:mail:fanIn')
        expect(dispatched.some((type) => type.startsWith('geometry:edge:orders-mail'))).toBe(false)
    })

    it.each([
        ['app-core', 'core', 'core-app', 1],
        ['core-app', 'app', 'app-core', 0],
    ] as const)('reconnects dependency edge %s without rerouting other edges', (edgeId, oldTargetId, otherEdgeId, fanInChange) => {
        const { geometry, session } = createHarness(editableDependencyDiagram())
        const edge = session.getEdgeSnapshot(edgeId)
        const targetAttachment = session.getConnectionPointSnapshot(edgeId, 'targetAttachment')
        const otherRoute = geometry.getEdgeRouteSnapshot(otherEdgeId)
        const unrelatedRoute = geometry.getEdgeRouteSnapshot('auxiliary-sink')
        const oldTargetFanIn = geometry.getNodeGeometryFieldSnapshot(oldTargetId, 'fanIn') as number
        const sinkFanIn = geometry.getNodeGeometryFieldSnapshot('sink', 'fanIn') as number
        const dispatched = recordGeometryEvents(geometry)

        expect(session.reconnectEdgeEndpoint(edgeId, 'targetAttachment', 'sink')).toBe(true)

        expect(session.getEdgeSnapshot(edgeId)).toBe(edge)
        expect(session.getConnectionPointSnapshot(edgeId, 'targetAttachment')).toBe(targetAttachment)
        expect(geometry.getNodeGeometryFieldSnapshot(oldTargetId, 'fanIn')).toBe(oldTargetFanIn - fanInChange)
        expect(geometry.getNodeGeometryFieldSnapshot('sink', 'fanIn')).toBe(sinkFanIn + fanInChange)
        expect(geometry.getEdgeRouteSnapshot(otherEdgeId)).toBe(otherRoute)
        expect(geometry.getEdgeRouteSnapshot('auxiliary-sink')).toBe(unrelatedRoute)
        expect(dispatched.filter((type) => type.endsWith(':fanIn'))).toEqual(fanInChange === 1 ? [
            `geometry:node:${oldTargetId}:fanIn`,
            'geometry:node:sink:fanIn',
        ] : [])
        expect(dispatched.some((type) => type.startsWith(`geometry:edge:${otherEdgeId}:`))).toBe(false)
        expect(dispatched.some((type) => type.startsWith('geometry:edge:auxiliary-sink:'))).toBe(false)
    })

    it.each([
        ['app-core', 'core', 'core-app', 1],
        ['core-app', 'app', 'app-core', 0],
    ] as const)('deletes dependency edge %s without rerouting remaining edges', (edgeId, targetId, otherEdgeId, fanInChange) => {
        const { geometry, session } = createHarness(editableDependencyDiagram())
        const otherRoute = geometry.getEdgeRouteSnapshot(otherEdgeId)
        const unrelatedRoute = geometry.getEdgeRouteSnapshot('auxiliary-sink')
        const targetFanIn = geometry.getNodeGeometryFieldSnapshot(targetId, 'fanIn') as number
        const dispatched = recordGeometryEvents(geometry)

        expect(session.removeEdge(edgeId)).toBe(true)

        expect(geometry.getEdgeRouteSnapshot(edgeId)).toHaveLength(0)
        expect(geometry.getNodeGeometryFieldSnapshot(targetId, 'fanIn')).toBe(targetFanIn - fanInChange)
        expect(geometry.getEdgeRouteSnapshot(otherEdgeId)).toBe(otherRoute)
        expect(geometry.getEdgeRouteSnapshot('auxiliary-sink')).toBe(unrelatedRoute)
        expect(dispatched.filter((type) => type.endsWith(':fanIn'))).toEqual(fanInChange === 1
            ? [`geometry:node:${targetId}:fanIn`]
            : [])
        expect(dispatched.some((type) => type.startsWith('geometry:edge:'))).toBe(false)
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

    it('grows implicit entity height for field membership and preserves explicit resized height', () => {
        const source = entityDiagram()
        source.nodes[1].height = 120
        const { geometry, session } = createHarness(source)
        const implicitHeight = geometry.getNodeGeometryFieldSnapshot('order', 'height') as number
        const explicitHeight = geometry.getNodeGeometryFieldSnapshot('line', 'height')

        session.addEntityField('order', { name: 'customerId', type: 'uuid' })
        session.addEntityField('line', { name: 'sku' })

        expect(geometry.getNodeGeometryFieldSnapshot('order', 'height')).toBeGreaterThan(implicitHeight)
        expect(geometry.getNodeGeometryFieldSnapshot('line', 'height')).toBe(explicitHeight)
        expect(session.getNodeFieldSnapshot('order', 'height')).toBeUndefined()
        expect(session.getNodeFieldSnapshot('line', 'height')).toBe(120)
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

    it('adds an explicitly positioned participant without updating existing sequence geometry', () => {
        const source = sequenceDiagram()
        source.nodes = source.nodes.map((node, index) => ({...node, height: 72, width: 160, x: 40 + index * 216, y: 40}))
        const { geometry, session } = createHarness(source)
        const participantBoxes = new Map(source.nodes.map(({ id }) => [id, nodeBox(geometry, id)]))
        const messageRoutes = new Map(source.edges.map(({ id }) => [id, geometry.getEdgeRouteSnapshot(id)]))
        const activationIds = geometry.getActivationIdsSnapshot()
        const activationBoxes = new Map(activationIds.map((id) => [id, {
            height: geometry.getActivationFieldSnapshot(id, 'height'),
            width: geometry.getActivationFieldSnapshot(id, 'width'),
            x: geometry.getActivationFieldSnapshot(id, 'x'),
            y: geometry.getActivationFieldSnapshot(id, 'y'),
        }]))
        const fragmentBox = {
            height: geometry.getFragmentGeometryFieldSnapshot('transaction', 'height'),
            width: geometry.getFragmentGeometryFieldSnapshot('transaction', 'width'),
            x: geometry.getFragmentGeometryFieldSnapshot('transaction', 'x'),
            y: geometry.getFragmentGeometryFieldSnapshot('transaction', 'y'),
        }
        const fragmentGuards = geometry.getFragmentGuardPositionsSnapshot('transaction')

        const participantId = session.createNode({height: 72, kind: 'participant', label: 'Audit', role: 'focal', width: 160, x: 720, y: 40})
        if (!participantId) throw new Error('Expected participant creation to succeed')

        expect(nodeBox(geometry, participantId)).toEqual({ height: 72, width: 160, x: 720, y: 40 })
        expect(geometry.getNodeGeometryFieldSnapshot(participantId, 'fanIn')).toBe(0)
        for (const [nodeId, box] of participantBoxes) expect(nodeBox(geometry, nodeId)).toEqual(box)
        for (const [edgeId, route] of messageRoutes) expect(geometry.getEdgeRouteSnapshot(edgeId)).toBe(route)
        expect(geometry.getActivationIdsSnapshot()).toBe(activationIds)
        for (const [activationId, box] of activationBoxes) {
            expect({
                height: geometry.getActivationFieldSnapshot(activationId, 'height'),
                width: geometry.getActivationFieldSnapshot(activationId, 'width'),
                x: geometry.getActivationFieldSnapshot(activationId, 'x'),
                y: geometry.getActivationFieldSnapshot(activationId, 'y'),
            }).toEqual(box)
        }
        expect({
            height: geometry.getFragmentGeometryFieldSnapshot('transaction', 'height'),
            width: geometry.getFragmentGeometryFieldSnapshot('transaction', 'width'),
            x: geometry.getFragmentGeometryFieldSnapshot('transaction', 'x'),
            y: geometry.getFragmentGeometryFieldSnapshot('transaction', 'y'),
        }).toEqual(fragmentBox)
        expect(geometry.getFragmentGuardPositionsSnapshot('transaction')).toBe(fragmentGuards)
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

    it('updates only inserted and later sequence rows plus changed fragment geometry', () => {
        const { geometry, session } = createHarness(sequenceDiagram())
        const firstRoute = geometry.getEdgeRouteSnapshot('user-orders')
        const laterRoutes = ['orders-store', 'store-orders', 'orders-user']
            .map((edgeId) => geometry.getEdgeRouteSnapshot(edgeId))
        const fragmentTop = geometry.getFragmentGeometryFieldSnapshot('transaction', 'y')
        const dispatched = recordGeometryEvents(geometry)

        const edgeId = session.createSequenceEdge({ from: 'user', kind: 'async', to: 'store' }, 1)
        if (!edgeId) throw new Error('Expected sequence message creation to succeed')

        expect(geometry.getEdgeRouteSnapshot('user-orders')).toBe(firstRoute)
        expect(geometry.getEdgeRouteSnapshot(edgeId)[0].y).toBe(laterRoutes[0][0].y)
        laterRoutes.forEach((route, index) => {
            expect(geometry.getEdgeRouteSnapshot(['orders-store', 'store-orders', 'orders-user'][index])).not.toBe(route)
        })
        expect(geometry.getFragmentGeometryFieldSnapshot('transaction', 'y')).not.toBe(fragmentTop)
        expect(dispatched.some((event) => event.startsWith('geometry:edge:user-orders:'))).toBe(false)
    })

    it('reflows shifted sequence rows after message movement and deletion', () => {
        const { geometry, session } = createHarness(sequenceDiagram())
        const firstRoute = geometry.getEdgeRouteSnapshot('user-orders')
        const insertedId = session.createSequenceEdge({ from: 'user', kind: 'async', to: 'store' }, 1)
        if (!insertedId) throw new Error('Expected sequence message creation to succeed')
        const insertedRoute = geometry.getEdgeRouteSnapshot(insertedId)
        const orderBeforeMove = session.getEdgeIdsSnapshot()

        expect(session.moveSequenceEdge('orders-user', 1)).toBe(true)
        expect(session.getEdgeIdsSnapshot()).toEqual(['user-orders', 'orders-user', insertedId, 'orders-store', 'store-orders'])
        expect(session.getEdgeIdsSnapshot()).not.toBe(orderBeforeMove)
        expect(geometry.getEdgeRouteSnapshot('user-orders')).toBe(firstRoute)
        expect(geometry.getEdgeRouteSnapshot(insertedId)).not.toBe(insertedRoute)

        const routeBeforeDelete = geometry.getEdgeRouteSnapshot('orders-store')
        expect(session.removeEdge(insertedId)).toBe(true)
        expect(geometry.getEdgeRouteSnapshot(insertedId)).toHaveLength(0)
        expect(geometry.getEdgeRouteSnapshot('orders-store')).not.toBe(routeBeforeDelete)
        expect(session.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).toEqual(['orders-store'])
    })

    it('derives an activation bar from a newly matched call and success pair', () => {
        const createId = vi.fn()
            .mockReturnValueOnce('audit-call')
            .mockReturnValueOnce('audit-success')
        const { geometry, session } = createHarness(sequenceDiagram(), createId)
        const activationIdsChanged = vi.fn()
        geometry.subscribeActivationIds(activationIdsChanged)

        expect(session.createSequenceEdge({ from: 'user', kind: 'call', to: 'store' }, 1)).toBe('audit-call')
        expect(session.createSequenceEdge({ from: 'store', kind: 'success', to: 'user' }, 2)).toBe('audit-success')

        expect(geometry.getActivationIdsSnapshot()).toContain('store:audit-call')
        expect(geometry.getActivationFieldSnapshot('store:audit-call', 'height')).toBe(48)
        expect(activationIdsChanged).toHaveBeenCalled()
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
