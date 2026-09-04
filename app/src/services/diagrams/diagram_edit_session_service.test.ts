import { describe, expect, it, vi } from 'vitest'
import type { DiagramData } from './diagram_data'
import type { DiagramRecord } from './diagram_index'
import { DiagramEditSessionService } from './diagram_edit_session_service'
import type { DiagramViewSourceSnapshot } from './diagram_view_service'

const diagram: DiagramData = {
    edges: [{
        from: 'orders',
        id: 'orders-store',
        kind: 'connection',
        sourceAttachment: { nodeId: 'orders', offset: 0.5, side: 'right' },
        to: 'store',
        targetAttachment: { nodeId: 'store', offset: 0.5, side: 'left' },
    }],
    groups: [{ id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'] }],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { id: 'orders', label: 'Orders', role: 'focal' },
        { id: 'store', label: 'Store', role: 'store' },
    ],
}
const sequenceDiagram: DiagramData = {
    edges: [
        { from: 'user', id: 'user-orders', kind: 'call', to: 'orders' },
        { from: 'orders', id: 'orders-user', kind: 'return', to: 'user' },
    ],
    fragments: [{ id: 'transaction', operator: 'opt', regions: [{ edgeIds: ['user-orders', 'orders-user'], guard: 'requested' }] }],
    groups: [{ id: 'backend', label: 'Backend', nodeIds: ['orders'] }],
    meta: { description: 'Order call flow', title: 'Calls', type: 'sequence', version: 1 },
    nodes: [
        { id: 'user', kind: 'participant', label: 'User', role: 'external' },
        { id: 'orders', kind: 'participant', label: 'Orders', role: 'focal' },
    ],
}
const entityDiagram: DiagramData = {
    edges: [{ from: 'order', fromCardinality: '1', id: 'order-item', kind: 'relationship', to: 'item', toCardinality: 'N' }],
    groups: [],
    meta: { description: 'Order entities', title: 'Entities', type: 'entity', version: 1 },
    nodes: [
        { fields: [{ key: 'primary', name: 'id', type: 'uuid' }], id: 'order', kind: 'entity', label: 'Order', role: 'focal' },
        { fields: [{ name: 'orderId', type: 'uuid' }], id: 'item', kind: 'entity', label: 'Item', role: 'store' },
    ],
}
const flowchartDiagram: DiagramData = {
    edges: [{ from: 'check', id: 'check-done', kind: 'flow', label: 'yes', to: 'done' }],
    groups: [],
    meta: { description: 'Decision flow', preset: 'flowchart', title: 'Flow', type: 'flow', version: 1 },
    nodes: [
        { id: 'check', kind: 'decision', label: 'Check', role: 'focal' },
        { id: 'done', kind: 'end', label: 'Done', role: 'backend' },
    ],
}
const stateDiagram: DiagramData = {
    edges: [{ from: 'idle', id: 'start-work', kind: 'transition', label: 'start', to: 'working' }],
    groups: [],
    meta: { description: 'Work states', preset: 'state', title: 'States', type: 'flow', version: 1 },
    nodes: [
        { id: 'idle', kind: 'state', label: 'Idle', role: 'focal' },
        { id: 'working', kind: 'state', label: 'Working', role: 'backend' },
    ],
}
const firstRecord: DiagramRecord = { actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'design/diagrams/overview.json' }
const project = { branch: 'main', id: 'project', rootPath: 'C:/repo' }

class DiagramSourceStub extends EventTarget {
    private source: DiagramViewSourceSnapshot | null = null

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }

    setSource(source: DiagramViewSourceSnapshot | null) {
        this.source = source
        this.dispatchEvent(new Event('sourceChanged'))
    }
}

function createHarness(options: {
    createId?: () => string
    reportValidationError?: (message: string) => void
    source?: DiagramData
} = {}) {
    const sourceService = new DiagramSourceStub()
    const service = new DiagramEditSessionService(sourceService, options.createId, options.reportValidationError)
    sourceService.setSource({ diagram: options.source ?? diagram, record: firstRecord })
    service.bindProject(project)

    return { service, sourceService }
}

function sequenceHarness(createId?: () => string, reportValidationError?: (message: string) => void) {
    const { service } = createHarness({ createId, reportValidationError, source: sequenceDiagram })
    service.start()

    return service
}

function membershipDetail(listener: ReturnType<typeof vi.fn>, callIndex = 0) {
    return (listener.mock.calls[callIndex][0] as CustomEvent).detail
}

describe('DiagramEditSessionService', () => {
    it('publishes active toolbox section independently and resets it with the session', () => {
        const { service } = createHarness()
        const sectionChanged = vi.fn()
        const sessionChanged = vi.fn()
        service.subscribeActiveToolboxSection(sectionChanged)
        service.subscribeSession(sessionChanged)
        service.start()
        const session = service.getSessionSnapshot()
        const editable = service.getEditableDiagram()

        service.setActiveToolboxSection('nodes')

        expect(service.getActiveToolboxSectionSnapshot()).toBe('nodes')
        expect(sectionChanged).toHaveBeenCalledOnce()
        expect(sessionChanged).toHaveBeenCalledOnce()
        expect(service.getSessionSnapshot()).toBe(session)
        expect(service.getEditableDiagram()).toBe(editable)

        service.discard()

        expect(service.getActiveToolboxSectionSnapshot()).toBe('edit')
        expect(sectionChanged).toHaveBeenCalledTimes(2)
        expect(sessionChanged).toHaveBeenCalledTimes(2)
    })

    it('rejects toolbox section changes without an active edit session', () => {
        const { service } = createHarness()

        expect(() => service.setActiveToolboxSection('others')).toThrow(
            'Cannot select a diagram toolbox section without an active edit session',
        )
    })

    it('starts with immutable source references and one deep editable copy', () => {
        const { service } = createHarness()

        service.start()
        const original = service.getOriginalDiagramSnapshot()
        const editable = service.getEditableDiagram()

        expect(original).toEqual({ diagram, record: firstRecord })
        expect(original?.diagram).toBe(diagram)
        expect(original?.record).toBe(firstRecord)
        expect(editable).toEqual(diagram)
        expect(editable).not.toBe(diagram)
        expect(editable?.nodes).not.toBe(diagram.nodes)

        service.setNodeField('orders', 'label', 'Edited orders')
        expect(diagram.nodes[0].label).toBe('Orders')
        expect(original?.diagram.nodes[0].label).toBe('Orders')
        expect(service.getDirtySnapshot()).toBe(true)
    })

    it('exposes stable snapshots and notifies only changed values', () => {
        const { service } = createHarness()
        const dirtyListener = vi.fn()
        const originalListener = vi.fn()
        const sessionListener = vi.fn()
        service.subscribeDirty(dirtyListener)
        service.subscribeOriginalDiagram(originalListener)
        service.subscribeSession(sessionListener)

        service.start()
        const editable = service.getEditableDiagram()
        const original = service.getOriginalDiagramSnapshot()
        const session = service.getSessionSnapshot()
        expect(service.getEditableDiagram()).toBe(editable)
        expect(service.getOriginalDiagramSnapshot()).toBe(original)
        expect(service.getSessionSnapshot()).toBe(session)
        expect(dirtyListener).not.toHaveBeenCalled()
        expect(originalListener).toHaveBeenCalledOnce()
        expect(sessionListener).toHaveBeenCalledOnce()

        service.discard()
        service.discard()
        expect(dirtyListener).not.toHaveBeenCalled()
        expect(originalListener).toHaveBeenCalledTimes(2)
        expect(sessionListener).toHaveBeenCalledTimes(2)
    })

    it('fails fast before project binding or without an active source diagram', () => {
        const sourceService = new DiagramSourceStub()
        const service = new DiagramEditSessionService(sourceService)

        expect(() => service.start()).toThrow('not bound to a project')
        service.bindProject(project)
        expect(() => service.start()).toThrow('without an active diagram')
    })

    it('keeps session for same source identity and discards it for another source', () => {
        const { service, sourceService } = createHarness()
        service.start()
        const session = service.getSessionSnapshot()

        sourceService.setSource({ diagram: structuredClone(diagram), record: { ...firstRecord } })
        expect(service.getSessionSnapshot()).toBe(session)

        const nextRecord = { ...firstRecord, id: 'diagram-2', path: 'design/diagrams/detail.json' }
        sourceService.setSource({ diagram: structuredClone(diagram), record: nextRecord })
        expect(service.getSessionSnapshot()).toBeNull()
        expect(service.getOriginalDiagramSnapshot()).toBeNull()
        expect(service.getEditableDiagram()).toBeNull()
    })

    it('starts every session fresh and resets only when project identity changes', () => {
        const { service } = createHarness()
        service.start()
        const firstSession = service.getSessionSnapshot()
        service.setNodeField('orders', 'label', 'Draft label')

        service.start()
        expect(service.getSessionSnapshot()).not.toBe(firstSession)
        expect(service.getEditableDiagram()?.nodes[0].label).toBe('Orders')

        const secondSession = service.getSessionSnapshot()
        service.bindProject({ ...project })
        expect(service.getSessionSnapshot()).toBe(secondSession)

        service.bindProject({ ...project, branch: 'feature' })
        expect(service.getSessionSnapshot()).toBeNull()
    })

    it('unsubscribes from source navigation when cleared', () => {
        const { service, sourceService } = createHarness()
        service.start()
        service.clear()

        sourceService.setSource(null)
        expect(service.getSessionSnapshot()).toBeNull()
        expect(() => service.start()).toThrow('not bound to a project')
    })

    it('assigns one node field and emits only its scoped field event plus dirty transition', () => {
        const { service } = createHarness()
        service.start()
        const editable = service.getEditableDiagram()
        const nodes = editable?.nodes
        const edges = editable?.edges
        const groups = editable?.groups
        const orders = service.getNodeSnapshot('orders')
        const store = service.getNodeSnapshot('store')
        const nodeIds = service.getNodeIdsSnapshot()
        const nodeLabelChanged = vi.fn()
        const storeLabelChanged = vi.fn()
        const nodeMembershipChanged = vi.fn()
        const edgeChanged = vi.fn()
        const groupChanged = vi.fn()
        const sessionChanged = vi.fn()
        const dirtyChanged = vi.fn()
        service.subscribeNodeField('orders', 'label', nodeLabelChanged)
        service.subscribeNodeField('store', 'label', storeLabelChanged)
        service.subscribeCollectionMembership('node', nodeMembershipChanged)
        service.subscribeEdgeField('orders-store', 'kind', edgeChanged)
        service.subscribeGroupField('backend', 'label', groupChanged)
        service.subscribeSession(sessionChanged)
        service.subscribeDirty(dirtyChanged)

        service.setNodeField('orders', 'label', 'Order API')

        expect(service.getEditableDiagram()).toBe(editable)
        expect(service.getEditableDiagram()?.nodes).toBe(nodes)
        expect(service.getEditableDiagram()?.edges).toBe(edges)
        expect(service.getEditableDiagram()?.groups).toBe(groups)
        expect(service.getNodeSnapshot('orders')).toBe(orders)
        expect(service.getNodeSnapshot('store')).toBe(store)
        expect(service.getNodeIdsSnapshot()).toBe(nodeIds)
        expect(service.getNodeFieldSnapshot('orders', 'label')).toBe('Order API')
        expect(nodeLabelChanged).toHaveBeenCalledOnce()
        expect((nodeLabelChanged.mock.calls[0][0] as CustomEvent).detail).toEqual({
            field: 'label',
            objectId: 'orders',
            objectKind: 'node',
            previousValue: 'Orders',
            value: 'Order API',
        })
        expect(dirtyChanged).toHaveBeenCalledOnce()
        expect(storeLabelChanged).not.toHaveBeenCalled()
        expect(nodeMembershipChanged).not.toHaveBeenCalled()
        expect(edgeChanged).not.toHaveBeenCalled()
        expect(groupChanged).not.toHaveBeenCalled()
        expect(sessionChanged).not.toHaveBeenCalled()
    })

    it('tracks dirty from affected scalar fields and clears it when each field is reverted', () => {
        const { service } = createHarness()
        service.start()
        const dirtyChanged = vi.fn()
        service.subscribeDirty(dirtyChanged)

        service.setNodeField('orders', 'label', 'Order API')
        service.setMetadataField('title', 'System')
        service.setNodeField('orders', 'label', 'Orders')
        expect(service.getDirtySnapshot()).toBe(true)

        service.setMetadataField('title', 'Overview')
        expect(service.getDirtySnapshot()).toBe(false)
        expect(dirtyChanged).toHaveBeenCalledTimes(2)
    })

    it('exposes stable IDs and granular accessors for architecture objects', () => {
        const { service } = createHarness()
        service.start()

        expect(service.getNodeIdsSnapshot()).toEqual(['orders', 'store'])
        expect(service.getEdgeIdsSnapshot()).toEqual(['orders-store'])
        expect(service.getGroupIdsSnapshot()).toEqual(['backend'])
        expect(service.getFragmentIdsSnapshot()).toEqual([])
        expect(service.getMetadataFieldSnapshot('description')).toBe('Orders architecture')
        expect(service.getEdgeFieldSnapshot('orders-store', 'kind')).toBe('connection')
        expect(service.getGroupFieldSnapshot('backend', 'label')).toBe('Backend')
        expect(service.getConnectionPointFieldSnapshot('orders-store', 'sourceAttachment', 'side')).toBe('right')

        service.setEdgeField('orders-store', 'label', 'writes')
        service.setGroupField('backend', 'label', 'Core')
        service.setConnectionPointField('orders-store', 'sourceAttachment', 'offset', 0.75)

        expect(service.getEdgeFieldSnapshot('orders-store', 'label')).toBe('writes')
        expect(service.getGroupFieldSnapshot('backend', 'label')).toBe('Core')
        expect(service.getConnectionPointFieldSnapshot('orders-store', 'sourceAttachment', 'offset')).toBe(0.75)
    })

    it('exposes and changes sequence fragments and entity fields in their valid diagram types', () => {
        const sequenceService = sequenceHarness()
        const { service: entityService } = createHarness({ source: entityDiagram })
        entityService.start()

        expect(sequenceService.getFragmentFieldSnapshot('transaction', 'operator')).toBe('opt')
        expect(sequenceService.setFragmentField('transaction', 'operator', 'loop')).toBe(true)
        expect(entityService.getEntityFieldValueSnapshot('order', 0, 'type')).toBe('uuid')
        expect(entityService.setEntityField('order', 0, 'type', 'string')).toBe(true)

        expect(sequenceService.getFragmentFieldSnapshot('transaction', 'operator')).toBe('loop')
        expect(entityService.getEntityFieldValueSnapshot('order', 0, 'type')).toBe('string')
    })


    it('creates a node with a generated collision-free id and notifies only the node collection', () => {
        const createId = vi.fn().mockReturnValueOnce('orders').mockReturnValueOnce('orders-store').mockReturnValueOnce('node-1')
        const { service } = createHarness({ createId })
        service.start()
        const editable = service.getEditableDiagram()
        const nodes = editable?.nodes
        const orders = service.getNodeSnapshot('orders')
        const edgeIds = service.getEdgeIdsSnapshot()
        const nodeMembershipChanged = vi.fn()
        const edgeMembershipChanged = vi.fn()
        const ordersLabelChanged = vi.fn()
        const groupMembershipChanged = vi.fn()
        const sessionChanged = vi.fn()
        const dirtyChanged = vi.fn()
        service.subscribeCollectionMembership('node', nodeMembershipChanged)
        service.subscribeCollectionMembership('edge', edgeMembershipChanged)
        service.subscribeNodeField('orders', 'label', ordersLabelChanged)
        service.subscribeGroupMembership('backend', groupMembershipChanged)
        service.subscribeSession(sessionChanged)
        service.subscribeDirty(dirtyChanged)

        const createdId = service.createNode({ label: 'Billing', role: 'backend' })

        expect(createdId).toBe('node-1')
        expect(createId).toHaveBeenCalledTimes(3)
        expect(service.getEditableDiagram()).toBe(editable)
        expect(service.getEditableDiagram()?.nodes).toBe(nodes)
        expect(service.getNodeSnapshot('orders')).toBe(orders)
        expect(service.getNodeIdsSnapshot()).toEqual(['orders', 'store', 'node-1'])
        expect(service.getEdgeIdsSnapshot()).toBe(edgeIds)
        expect(service.getNodeFieldSnapshot('node-1', 'label')).toBe('Billing')
        expect(nodeMembershipChanged).toHaveBeenCalledOnce()
        expect(membershipDetail(nodeMembershipChanged)).toEqual({
            addedIds: ['node-1'],
            memberKind: 'node',
            ownerId: null,
            regionIndex: null,
            removedIds: [],
        })
        expect(dirtyChanged).toHaveBeenCalledOnce()
        expect(service.getDirtySnapshot()).toBe(true)
        expect(edgeMembershipChanged).not.toHaveBeenCalled()
        expect(ordersLabelChanged).not.toHaveBeenCalled()
        expect(groupMembershipChanged).not.toHaveBeenCalled()
        expect(sessionChanged).not.toHaveBeenCalled()
    })

    it('removes a node with its incident edges and group membership in one transaction', () => {
        const { service } = createHarness()
        service.start()
        const editable = service.getEditableDiagram()
        const nodes = editable?.nodes
        const edges = editable?.edges
        const groups = editable?.groups
        const store = service.getNodeSnapshot('store')
        const backend = service.getGroupSnapshot('backend')
        const nodeMembershipChanged = vi.fn()
        const edgeMembershipChanged = vi.fn()
        const groupMembershipChanged = vi.fn()
        const groupLabelChanged = vi.fn()
        const storeLabelChanged = vi.fn()
        service.subscribeCollectionMembership('node', nodeMembershipChanged)
        service.subscribeCollectionMembership('edge', edgeMembershipChanged)
        service.subscribeGroupMembership('backend', groupMembershipChanged)
        service.subscribeGroupField('backend', 'label', groupLabelChanged)
        service.subscribeNodeField('store', 'label', storeLabelChanged)

        expect(service.removeNode('orders')).toBe(true)

        expect(service.getEditableDiagram()).toBe(editable)
        expect(service.getEditableDiagram()?.nodes).toBe(nodes)
        expect(service.getEditableDiagram()?.edges).toBe(edges)
        expect(service.getEditableDiagram()?.groups).toBe(groups)
        expect(service.getNodeSnapshot('store')).toBe(store)
        expect(service.getGroupSnapshot('backend')).toBe(backend)
        expect(service.getNodeIdsSnapshot()).toEqual(['store'])
        expect(service.getEdgeIdsSnapshot()).toEqual([])
        expect(service.getGroupNodeIdsSnapshot('backend')).toEqual(['store'])
        expect(service.getNodeSnapshot('orders')).toBeNull()
        expect(nodeMembershipChanged).toHaveBeenCalledOnce()
        expect(membershipDetail(nodeMembershipChanged).removedIds).toEqual(['orders'])
        expect(edgeMembershipChanged).toHaveBeenCalledOnce()
        expect(membershipDetail(edgeMembershipChanged).removedIds).toEqual(['orders-store'])
        expect(groupMembershipChanged).toHaveBeenCalledOnce()
        expect(membershipDetail(groupMembershipChanged)).toEqual({
            addedIds: [],
            memberKind: 'node',
            ownerId: 'backend',
            regionIndex: null,
            removedIds: ['orders'],
        })
        expect(groupLabelChanged).not.toHaveBeenCalled()
        expect(storeLabelChanged).not.toHaveBeenCalled()
        expect(service.removeNode('orders')).toBe(false)
    })

    it('creates an edge between existing nodes and drops fragment references when it is removed', () => {
        const service = sequenceHarness(vi.fn().mockReturnValue('edge-1'))
        const nodes = service.getEditableDiagram()?.nodes
        const nodeMembershipChanged = vi.fn()
        const edgeMembershipChanged = vi.fn()
        const regionMembershipChanged = vi.fn()
        service.subscribeCollectionMembership('node', nodeMembershipChanged)
        service.subscribeCollectionMembership('edge', edgeMembershipChanged)
        service.subscribeFragmentRegionMembership('transaction', 0, regionMembershipChanged)

        const createdId = service.createEdge({ from: 'orders', kind: 'async', to: 'user' })

        expect(createdId).toBe('edge-1')
        expect(service.getEdgeIdsSnapshot()).toEqual(['user-orders', 'orders-user', 'edge-1'])
        expect(service.getEditableDiagram()?.nodes).toBe(nodes)
        expect(edgeMembershipChanged).toHaveBeenCalledOnce()
        expect(nodeMembershipChanged).not.toHaveBeenCalled()
        expect(regionMembershipChanged).not.toHaveBeenCalled()

        expect(service.removeEdge('user-orders')).toBe(true)
        expect(service.getEdgeIdsSnapshot()).toEqual(['orders-user', 'edge-1'])
        expect(service.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).toEqual(['orders-user'])
        expect(regionMembershipChanged).toHaveBeenCalledOnce()
        expect(service.getNodeIdsSnapshot()).toEqual(['user', 'orders'])
        expect(service.removeEdge('user-orders')).toBe(false)
    })

    it('creates and removes groups without touching their member nodes', () => {
        const { service } = createHarness({ createId: vi.fn().mockReturnValue('group-1') })
        service.start()
        const store = service.getNodeSnapshot('store')
        const groupMembershipChanged = vi.fn()
        const nodeMembershipChanged = vi.fn()
        service.subscribeCollectionMembership('group', groupMembershipChanged)
        service.subscribeCollectionMembership('node', nodeMembershipChanged)

        const createdId = service.createGroup({ label: 'Storage', nodeIds: ['store'] })

        expect(createdId).toBe('group-1')
        expect(service.getGroupIdsSnapshot()).toEqual(['backend', 'group-1'])
        expect(service.getGroupNodeIdsSnapshot('group-1')).toEqual(['store'])
        expect(groupMembershipChanged).toHaveBeenCalledOnce()

        expect(service.removeGroup('group-1')).toBe(true)
        expect(service.getGroupIdsSnapshot()).toEqual(['backend'])
        expect(service.getGroupNodeIdsSnapshot('group-1')).toBeNull()
        expect(service.getNodeSnapshot('store')).toBe(store)
        expect(service.getNodeIdsSnapshot()).toEqual(['orders', 'store'])
        expect(nodeMembershipChanged).not.toHaveBeenCalled()
        expect(service.removeGroup('group-1')).toBe(false)
    })

    it('adds and removes one group member without republishing other collections', () => {
        const reportValidationError = vi.fn()
        const { service } = createHarness({ reportValidationError })
        service.start()
        service.removeGroupMember('backend', 'store')
        const backend = service.getGroupSnapshot('backend')
        const nodeIds = service.getNodeIdsSnapshot()
        const groupMembershipChanged = vi.fn()
        const nodeMembershipChanged = vi.fn()
        service.subscribeGroupMembership('backend', groupMembershipChanged)
        service.subscribeCollectionMembership('node', nodeMembershipChanged)

        expect(service.addGroupMember('backend', 'store')).toBe(true)
        expect(service.addGroupMember('backend', 'store')).toBe(false)

        expect(service.getGroupNodeIdsSnapshot('backend')).toEqual(['orders', 'store'])
        expect(service.getGroupSnapshot('backend')).toBe(backend)
        expect(service.getNodeIdsSnapshot()).toBe(nodeIds)
        expect(groupMembershipChanged).toHaveBeenCalledOnce()
        expect(nodeMembershipChanged).not.toHaveBeenCalled()
        expect(service.getDirtySnapshot()).toBe(false)
        expect(service.addGroupMember('backend', 'missing')).toBe(false)
        expect(reportValidationError).toHaveBeenCalledWith(
            'Add group member rejected: groups.backend.nodeIds has unknown node missing',
        )
        expect(() => service.removeGroupMember('missing', 'store')).toThrow('group missing does not exist')
        expect(service.removeGroupMember('backend', 'missing')).toBe(false)
    })

    it('creates fragments only on sequence diagrams and keeps region edges after removal', () => {
        const service = sequenceHarness(vi.fn().mockReturnValue('fragment-1'))
        const fragmentMembershipChanged = vi.fn()
        service.subscribeCollectionMembership('fragment', fragmentMembershipChanged)

        const createdId = service.createFragment({
            operator: 'alt',
            regions: [{ edgeIds: ['user-orders'], guard: 'ok' }, { edgeIds: ['orders-user'], guard: 'failed' }],
        })

        expect(createdId).toBe('fragment-1')
        expect(service.getFragmentIdsSnapshot()).toEqual(['transaction', 'fragment-1'])
        expect(service.getFragmentRegionEdgeIdsSnapshot('fragment-1', 1)).toEqual(['orders-user'])
        expect(fragmentMembershipChanged).toHaveBeenCalledOnce()

        expect(service.removeFragment('fragment-1')).toBe(true)
        expect(service.getFragmentIdsSnapshot()).toEqual(['transaction'])
        expect(service.getFragmentRegionEdgeIdsSnapshot('fragment-1', 0)).toBeNull()
        expect(service.getEdgeIdsSnapshot()).toEqual(['user-orders', 'orders-user'])
        expect(service.removeFragment('fragment-1')).toBe(false)
    })

    it('adds and removes fragment region edges and rejects duplicate references', () => {
        const reportValidationError = vi.fn()
        const service = sequenceHarness(undefined, reportValidationError)
        const regionChanged = vi.fn()
        const edgeMembershipChanged = vi.fn()
        service.subscribeFragmentRegionMembership('transaction', 0, regionChanged)
        service.subscribeCollectionMembership('edge', edgeMembershipChanged)

        expect(service.removeFragmentRegionEdge('transaction', 0, 'orders-user')).toBe(true)
        regionChanged.mockClear()
        expect(service.addFragmentRegionEdge('transaction', 0, 'orders-user')).toBe(true)
        expect(service.addFragmentRegionEdge('transaction', 0, 'orders-user')).toBe(false)
        expect(service.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).toEqual(['user-orders', 'orders-user'])
        expect(regionChanged).toHaveBeenCalledOnce()
        expect(edgeMembershipChanged).not.toHaveBeenCalled()

        expect(service.removeFragmentRegionEdge('transaction', 0, 'orders-user')).toBe(true)
        expect(service.removeFragmentRegionEdge('transaction', 0, 'orders-user')).toBe(false)
        expect(service.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).toEqual(['user-orders'])
        expect(service.getDirtySnapshot()).toBe(true)
        expect(service.addFragmentRegionEdge('transaction', 0, 'orders-user')).toBe(true)
        expect(service.getDirtySnapshot()).toBe(false)
        expect(() => service.addFragmentRegionEdge('transaction', 5, 'orders-user')).toThrow('region transaction[5] does not exist')
        expect(service.addFragmentRegionEdge('transaction', 0, 'missing')).toBe(false)
        expect(reportValidationError).toHaveBeenCalledWith(
            'Add fragment region edge rejected: fragments.transaction.regions[0].edgeIds has unknown edge missing',
        )
    })

    it('leaves the session untouched when a create operation is rejected', () => {
        const reportValidationError = vi.fn()
        const service = sequenceHarness(undefined, reportValidationError)
        const editable = service.getEditableDiagram()
        const edgeIds = service.getEdgeIdsSnapshot()
        const fragmentIds = service.getFragmentIdsSnapshot()
        const nodeIds = service.getNodeIdsSnapshot()
        const listener = vi.fn()
        service.subscribeCollectionMembership('edge', listener)
        service.subscribeCollectionMembership('fragment', listener)
        service.subscribeCollectionMembership('group', listener)
        service.subscribeCollectionMembership('node', listener)
        service.subscribeDirty(listener)

        expect(service.createEdge({ from: 'missing', kind: 'call', to: 'user' })).toBeNull()
        expect(service.createNode({ label: '  ', role: 'focal' })).toBeNull()
        expect(service.createGroup({ label: 'Twice', nodeIds: ['user', 'user'] })).toBeNull()
        expect(service.createFragment({ operator: 'alt', regions: [{ edgeIds: [], guard: 'only' }] })).toBeNull()
        expect(service.createFragment({
            operator: 'alt',
            regions: [{ edgeIds: ['user-orders'], guard: 'ok' }, { edgeIds: ['user-orders'], guard: 'again' }],
        })).toBeNull()

        expect(service.getEditableDiagram()).toBe(editable)
        expect(service.getEdgeIdsSnapshot()).toBe(edgeIds)
        expect(service.getFragmentIdsSnapshot()).toBe(fragmentIds)
        expect(service.getNodeIdsSnapshot()).toBe(nodeIds)
        expect(service.getGroupIdsSnapshot()).toEqual(['backend'])
        expect(service.getDirtySnapshot()).toBe(false)
        expect(listener).not.toHaveBeenCalled()
        expect(reportValidationError).toHaveBeenCalledTimes(5)
        expect(reportValidationError.mock.calls.map(([message]) => message)).toContain(
            'Create edge rejected: edges.new.from has unknown node missing',
        )

        const architectureReporter = vi.fn()
        const { service: architecture } = createHarness({ reportValidationError: architectureReporter })
        architecture.start()
        expect(architecture.createFragment({ operator: 'opt', regions: [{ edgeIds: [], guard: 'maybe' }] })).toBeNull()
        expect(architectureReporter).toHaveBeenCalledWith(
            'Create fragment rejected: fragments has value only allowed for sequence diagrams',
        )
    })

    it('rejects invalid runtime types and geometry without mutation, changes, or diagram events', () => {
        const reportValidationError = vi.fn()
        const { service } = createHarness({ reportValidationError })
        service.start()
        const editable = service.getEditableDiagram()
        const changeIds = service.getChangeIdsSnapshot()
        const listener = vi.fn()
        service.subscribeDirty(listener)
        service.subscribeChangeIds(listener)
        service.subscribeNodeField('orders', 'x', listener)
        service.subscribeCollectionMembership('edge', listener)

        expect(service.setNodeField('orders', 'role', 'invalid' as never)).toBe(false)
        expect(service.setNodeField('orders', 'x', 3)).toBe(false)
        expect(service.setGroupField('backend', 'width', 0)).toBe(false)
        expect(service.setConnectionPointField('orders-store', 'sourceAttachment', 'offset', 1.5)).toBe(false)
        expect(service.createEdge({
            from: 'orders',
            kind: 'connection',
            to: 'store',
            waypoints: [{ x: 0, y: 0 }, { x: 4, y: 4 }],
        })).toBeNull()

        expect(service.getEditableDiagram()).toBe(editable)
        expect(service.getNodeFieldSnapshot('orders', 'role')).toBe('focal')
        expect(service.getNodeFieldSnapshot('orders', 'x')).toBeUndefined()
        expect(service.getGroupFieldSnapshot('backend', 'width')).toBeUndefined()
        expect(service.getConnectionPointFieldSnapshot('orders-store', 'sourceAttachment', 'offset')).toBe(0.5)
        expect(service.getChangeIdsSnapshot()).toBe(changeIds)
        expect(service.getDirtySnapshot()).toBe(false)
        expect(listener).not.toHaveBeenCalled()
        expect(reportValidationError.mock.calls.map(([message]) => message)).toEqual(expect.arrayContaining([
            'Set node field rejected: nodes.orders.role has unsupported value invalid',
            'Set node field rejected: nodes.orders.x has number outside the 4px grid',
            'Set group field rejected: groups.backend.width has invalid number',
            'Set connection point field rejected: edges.orders-store.sourceAttachment.offset has number outside the 0..1 range',
            'Create edge rejected: edges.new.waypoints[1] has diagonal segment',
        ]))
    })

    it('enforces diagram-type rules, references, cardinalities, and required semantic labels', () => {
        const architectureReporter = vi.fn()
        const { service: architecture } = createHarness({ reportValidationError: architectureReporter })
        architecture.start()
        expect(architecture.setEdgeField('orders-store', 'from', 'missing')).toBe(false)
        expect(architecture.setEdgeField('orders-store', 'kind', 'relationship')).toBe(false)
        expect(architecture.setEdgeField('orders-store', 'fromCardinality', '1')).toBe(false)
        expect(architecture.setConnectionPointField('orders-store', 'sourceAttachment', 'nodeId', 'store')).toBe(false)
        expect(architecture.createNode({ fields: [{ name: 'id' }], label: 'Wrong', role: 'focal' })).toBeNull()

        const flowchartReporter = vi.fn()
        const { service: flowchart } = createHarness({ reportValidationError: flowchartReporter, source: flowchartDiagram })
        flowchart.start()
        expect(flowchart.setEdgeField('check-done', 'label', undefined)).toBe(false)
        expect(flowchart.createEdge({ from: 'check', kind: 'flow', to: 'done' })).toBeNull()

        const stateReporter = vi.fn()
        const { service: state } = createHarness({ reportValidationError: stateReporter, source: stateDiagram })
        state.start()
        expect(state.setEdgeField('start-work', 'label', undefined)).toBe(false)
        expect(state.createNode({ kind: 'decision', label: 'Wrong', role: 'focal' })).toBeNull()

        const sequenceReporter = vi.fn()
        const sequence = sequenceHarness(undefined, sequenceReporter)
        expect(sequence.createFragment({ operator: 'opt', regions: [{ edgeIds: ['user-orders'], guard: ' ' }] })).toBeNull()
        expect(sequence.setFragmentField('transaction', 'operator', 'alt')).toBe(false)

        const entityReporter = vi.fn()
        const { service: entity } = createHarness({ reportValidationError: entityReporter, source: entityDiagram })
        entity.start()
        expect(entity.setEntityField('order', 0, 'key', 'invalid' as never)).toBe(false)

        expect(architectureReporter.mock.calls.map(([message]) => message)).toEqual(expect.arrayContaining([
            'Set edge field rejected: edges.orders-store.from has unknown node missing',
            'Set edge field rejected: edges.orders-store.kind has unsupported value relationship for architecture',
            'Set edge field rejected: edges.orders-store.fromCardinality has value only allowed for entity diagrams',
            'Set connection point field rejected: edges.orders-store.sourceAttachment.nodeId has node store does not match endpoint orders',
            'Create node rejected: nodes.new.fields has value only allowed for entity diagrams',
        ]))
        expect(flowchartReporter).toHaveBeenCalledTimes(2)
        expect(stateReporter).toHaveBeenCalledTimes(2)
        expect(sequenceReporter).toHaveBeenCalledTimes(2)
        expect(entityReporter).toHaveBeenCalledWith(
            'Set entity field rejected: nodes.order.fields[0].key has unsupported value invalid',
        )
    })

    it('rejects removals that would empty required group or fragment regions', () => {
        const groupReporter = vi.fn()
        const { service: architecture } = createHarness({ reportValidationError: groupReporter })
        architecture.start()
        expect(architecture.removeGroupMember('backend', 'store')).toBe(true)
        const groupNodeIds = architecture.getGroupNodeIdsSnapshot('backend')
        expect(architecture.removeGroupMember('backend', 'orders')).toBe(false)
        expect(architecture.getGroupNodeIdsSnapshot('backend')).toBe(groupNodeIds)

        const fragmentReporter = vi.fn()
        const sequence = sequenceHarness(undefined, fragmentReporter)
        expect(sequence.removeFragmentRegionEdge('transaction', 0, 'user-orders')).toBe(true)
        const regionEdgeIds = sequence.getFragmentRegionEdgeIdsSnapshot('transaction', 0)
        expect(sequence.removeEdge('orders-user')).toBe(false)
        expect(sequence.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).toBe(regionEdgeIds)
        expect(sequence.getEdgeSnapshot('orders-user')).not.toBeNull()

        expect(groupReporter).toHaveBeenCalledWith(
            'Remove group member rejected: groups.backend.nodeIds has empty array after removing member',
        )
        expect(fragmentReporter).toHaveBeenCalledWith(
            'Remove edge rejected: fragments.transaction.regions[0].edgeIds has empty array after removing edge',
        )
    })

    it('clears dirty when a created object and its field edits are removed again', () => {
        const { service } = createHarness({ createId: vi.fn().mockReturnValue('node-1') })
        service.start()

        const createdId = service.createNode({ label: 'Billing', role: 'backend' })
        if (!createdId) throw new Error('Expected node creation to succeed')
        service.setNodeField(createdId, 'label', 'Billing API')
        expect(service.getDirtySnapshot()).toBe(true)

        expect(service.removeNode(createdId)).toBe(true)
        expect(service.getDirtySnapshot()).toBe(false)
        expect(service.getChangeIdsSnapshot()).toEqual([])

        service.removeNode('store')
        expect(service.getDirtySnapshot()).toBe(true)
    })

    it('stores one original value and updates one existing field change in place', () => {
        const { service } = createHarness()
        service.start()
        const changeIdsChanged = vi.fn()
        service.subscribeChangeIds(changeIdsChanged)

        service.setNodeField('orders', 'x', 4)
        const changeIds = service.getChangeIdsSnapshot()
        const [changeId] = changeIds
        const valueChanged = vi.fn()
        service.subscribeChangeField(changeId, 'value', valueChanged)

        expect(service.getChange(changeId)).toMatchObject({
            category: 'field',
            field: 'x',
            objectId: 'orders',
            objectKind: 'node',
            originalValue: undefined,
            value: 4,
        })

        service.setNodeField('orders', 'x', 8)

        expect(service.getChangeIdsSnapshot()).toBe(changeIds)
        expect(changeIdsChanged).toHaveBeenCalledOnce()
        expect(valueChanged).toHaveBeenCalledOnce()
        expect(service.getChangeFieldSnapshot(changeId, 'originalValue')).toBeUndefined()
        expect(service.getChangeFieldSnapshot(changeId, 'value')).toBe(8)
    })

    it('removes a reverted field change and changes dirty only at empty boundaries', () => {
        const { service } = createHarness()
        service.start()
        const dirtyChanged = vi.fn()
        const changeIdsChanged = vi.fn()
        service.subscribeDirty(dirtyChanged)
        service.subscribeChangeIds(changeIdsChanged)

        service.setNodeField('orders', 'label', 'Order API')
        service.setMetadataField('title', 'System')
        const orderedChangeIds = service.getChangeIdsSnapshot()
        service.setNodeField('orders', 'label', 'Order API v2')

        expect(service.getChangeIdsSnapshot()).toBe(orderedChangeIds)
        expect(dirtyChanged).toHaveBeenCalledOnce()

        service.setNodeField('orders', 'label', 'Orders')
        expect(service.getDirtySnapshot()).toBe(true)
        expect(service.getChangeIdsSnapshot()).toHaveLength(1)
        expect(dirtyChanged).toHaveBeenCalledOnce()

        service.setMetadataField('title', 'Overview')
        expect(service.getDirtySnapshot()).toBe(false)
        expect(service.getChangeIdsSnapshot()).toEqual([])
        expect(dirtyChanged).toHaveBeenCalledTimes(2)
        expect(changeIdsChanged).toHaveBeenCalledTimes(4)
    })

    it('tracks collection and nested membership as net semantic changes', () => {
        const { service } = createHarness({ createId: vi.fn().mockReturnValue('node-1') })
        service.start()

        const createdId = service.createNode({ label: 'Billing', role: 'backend' })
        if (!createdId) throw new Error('Expected node creation to succeed')
        const [additionId] = service.getChangeIdsSnapshot()
        expect(service.getChange(additionId)).toMatchObject({
            category: 'collection',
            objectId: createdId,
            objectKind: 'node',
            originalValue: null,
        })
        expect(service.getChangeFieldSnapshot(additionId, 'value')).toBe(service.getNodeSnapshot(createdId))

        service.removeNode(createdId)
        expect(service.getChangeIdsSnapshot()).toEqual([])

        service.removeGroupMember('backend', 'store')
        const [membershipId] = service.getChangeIdsSnapshot()
        expect(service.getChange(membershipId)).toMatchObject({
            category: 'membership',
            field: 'nodeIds',
            objectId: 'store',
            objectKind: 'node',
            originalValue: true,
            ownerId: 'backend',
            value: false,
        })

        service.addGroupMember('backend', 'store')
        expect(service.getChangeIdsSnapshot()).toEqual([])
        expect(service.getDirtySnapshot()).toBe(false)
    })

    it('replaces field entries with one original-object removal entry', () => {
        const { service } = createHarness()
        service.start()
        const originalGroup = diagram.groups[0]
        service.setGroupField('backend', 'label', 'Core')

        service.removeGroup('backend')

        const [removalId] = service.getChangeIdsSnapshot()
        expect(service.getChangeIdsSnapshot()).toHaveLength(1)
        expect(service.getChange(removalId)).toMatchObject({
            category: 'collection',
            objectId: 'backend',
            objectKind: 'group',
            originalValue: originalGroup,
            value: null,
        })
    })

    it('publishes empty change IDs when a dirty session restarts', () => {
        const { service } = createHarness()
        service.start()
        service.setNodeField('orders', 'label', 'Order API')
        const changeIdsChanged = vi.fn()
        service.subscribeChangeIds(changeIdsChanged)

        service.start()

        expect(service.getChangeIdsSnapshot()).toEqual([])
        expect(service.getDirtySnapshot()).toBe(false)
        expect(changeIdsChanged).toHaveBeenCalledOnce()
    })

    it('fails fast when field assignment has no active session or owner', () => {
        const { service } = createHarness()

        expect(() => service.setNodeField('orders', 'label', 'Order API')).toThrow('session is not active')
        service.start()
        expect(() => service.setNodeField('missing', 'label', 'Missing')).toThrow('node missing does not exist')
        expect(() => service.setEntityField('store', 0, 'name', 'id')).toThrow('entity field store[0] does not exist')
        expect(() => service.setConnectionPointField('orders-store', 'targetAttachment', 'offset', 0.25)).not.toThrow()
    })
})
