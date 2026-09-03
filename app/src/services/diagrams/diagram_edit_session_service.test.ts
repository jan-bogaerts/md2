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
    fragments: [{ id: 'transaction', operator: 'opt', regions: [{ edgeIds: ['orders-store'], guard: 'requested' }] }],
    groups: [{ id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'] }],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { fields: [{ key: 'primary', name: 'id', type: 'uuid' }], id: 'orders', label: 'Orders', role: 'focal' },
        { id: 'store', label: 'Store', role: 'store' },
    ],
}
const sequenceDiagram: DiagramData = {
    edges: [
        { from: 'user', id: 'user-orders', kind: 'call', to: 'orders' },
        { from: 'orders', id: 'orders-user', kind: 'return', to: 'user' },
    ],
    fragments: [{ id: 'transaction', operator: 'opt', regions: [{ edgeIds: ['user-orders'], guard: 'requested' }] }],
    groups: [{ id: 'backend', label: 'Backend', nodeIds: ['orders'] }],
    meta: { description: 'Order call flow', title: 'Calls', type: 'sequence', version: 1 },
    nodes: [
        { id: 'user', kind: 'participant', label: 'User', role: 'external' },
        { id: 'orders', kind: 'participant', label: 'Orders', role: 'focal' },
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

function createHarness(options: { createId?: () => string; source?: DiagramData } = {}) {
    const sourceService = new DiagramSourceStub()
    const service = new DiagramEditSessionService(sourceService, options.createId)
    sourceService.setSource({ diagram: options.source ?? diagram, record: firstRecord })
    service.bindProject(project)

    return { service, sourceService }
}

function sequenceHarness(createId?: () => string) {
    const { service } = createHarness({ createId, source: sequenceDiagram })
    service.start()

    return service
}

function membershipDetail(listener: ReturnType<typeof vi.fn>, callIndex = 0) {
    return (listener.mock.calls[callIndex][0] as CustomEvent).detail
}

describe('DiagramEditSessionService', () => {
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

    it('exposes stable IDs and granular accessors for every editable object kind', () => {
        const { service } = createHarness()
        service.start()

        expect(service.getNodeIdsSnapshot()).toEqual(['orders', 'store'])
        expect(service.getEdgeIdsSnapshot()).toEqual(['orders-store'])
        expect(service.getGroupIdsSnapshot()).toEqual(['backend'])
        expect(service.getFragmentIdsSnapshot()).toEqual(['transaction'])
        expect(service.getMetadataFieldSnapshot('description')).toBe('Orders architecture')
        expect(service.getEdgeFieldSnapshot('orders-store', 'kind')).toBe('connection')
        expect(service.getGroupFieldSnapshot('backend', 'label')).toBe('Backend')
        expect(service.getFragmentFieldSnapshot('transaction', 'operator')).toBe('opt')
        expect(service.getEntityFieldValueSnapshot('orders', 0, 'name')).toBe('id')
        expect(service.getConnectionPointFieldSnapshot('orders-store', 'sourceAttachment', 'side')).toBe('right')

        service.setEdgeField('orders-store', 'label', 'writes')
        service.setGroupField('backend', 'label', 'Core')
        service.setFragmentField('transaction', 'operator', 'loop')
        service.setEntityField('orders', 0, 'type', 'string')
        service.setConnectionPointField('orders-store', 'sourceAttachment', 'offset', 0.75)

        expect(service.getEdgeFieldSnapshot('orders-store', 'label')).toBe('writes')
        expect(service.getGroupFieldSnapshot('backend', 'label')).toBe('Core')
        expect(service.getFragmentFieldSnapshot('transaction', 'operator')).toBe('loop')
        expect(service.getEntityFieldValueSnapshot('orders', 0, 'type')).toBe('string')
        expect(service.getConnectionPointFieldSnapshot('orders-store', 'sourceAttachment', 'offset')).toBe(0.75)
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

    it('removes a node with its incident edges, group membership, and fragment references in one transaction', () => {
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
        const regionMembershipChanged = vi.fn()
        const groupLabelChanged = vi.fn()
        const storeLabelChanged = vi.fn()
        service.subscribeCollectionMembership('node', nodeMembershipChanged)
        service.subscribeCollectionMembership('edge', edgeMembershipChanged)
        service.subscribeGroupMembership('backend', groupMembershipChanged)
        service.subscribeFragmentRegionMembership('transaction', 0, regionMembershipChanged)
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
        expect(service.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).toEqual([])
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
        expect(regionMembershipChanged).toHaveBeenCalledOnce()
        expect(membershipDetail(regionMembershipChanged).removedIds).toEqual(['orders-store'])
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
        expect(service.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).toEqual([])
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
        const { service } = createHarness()
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
        expect(() => service.addGroupMember('backend', 'missing')).toThrow('node missing does not exist')
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
        const service = sequenceHarness()
        const regionChanged = vi.fn()
        const edgeMembershipChanged = vi.fn()
        service.subscribeFragmentRegionMembership('transaction', 0, regionChanged)
        service.subscribeCollectionMembership('edge', edgeMembershipChanged)

        expect(service.addFragmentRegionEdge('transaction', 0, 'orders-user')).toBe(true)
        expect(service.addFragmentRegionEdge('transaction', 0, 'orders-user')).toBe(false)
        expect(service.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).toEqual(['user-orders', 'orders-user'])
        expect(regionChanged).toHaveBeenCalledOnce()
        expect(edgeMembershipChanged).not.toHaveBeenCalled()

        expect(service.removeFragmentRegionEdge('transaction', 0, 'orders-user')).toBe(true)
        expect(service.removeFragmentRegionEdge('transaction', 0, 'orders-user')).toBe(false)
        expect(service.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).toEqual(['user-orders'])
        expect(service.getDirtySnapshot()).toBe(false)
        expect(() => service.addFragmentRegionEdge('transaction', 5, 'orders-user')).toThrow('region transaction[5] does not exist')
        expect(() => service.addFragmentRegionEdge('transaction', 0, 'missing')).toThrow('edge missing does not exist')
    })

    it('leaves the session untouched when a create operation is rejected', () => {
        const service = sequenceHarness()
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

        expect(() => service.createEdge({ from: 'missing', kind: 'call', to: 'user' })).toThrow('node missing does not exist')
        expect(() => service.createNode({ label: '  ', role: 'focal' })).toThrow('node label must be a non-empty string')
        expect(() => service.createGroup({ label: 'Twice', nodeIds: ['user', 'user'] })).toThrow('member user is duplicated')
        expect(() => service.createFragment({ operator: 'alt', regions: [{ edgeIds: [], guard: 'only' }] }))
            .toThrow('operator alt requires 2 regions')
        expect(() => service.createFragment({
            operator: 'alt',
            regions: [{ edgeIds: ['user-orders'], guard: 'ok' }, { edgeIds: ['user-orders'], guard: 'again' }],
        })).toThrow('region edge user-orders is duplicated')

        expect(service.getEditableDiagram()).toBe(editable)
        expect(service.getEdgeIdsSnapshot()).toBe(edgeIds)
        expect(service.getFragmentIdsSnapshot()).toBe(fragmentIds)
        expect(service.getNodeIdsSnapshot()).toBe(nodeIds)
        expect(service.getGroupIdsSnapshot()).toEqual(['backend'])
        expect(service.getDirtySnapshot()).toBe(false)
        expect(listener).not.toHaveBeenCalled()

        const { service: architecture } = createHarness()
        architecture.start()
        expect(() => architecture.createFragment({ operator: 'opt', regions: [{ edgeIds: [], guard: 'maybe' }] }))
            .toThrow('only allowed on sequence diagrams')
    })

    it('clears dirty when a created object and its field edits are removed again', () => {
        const { service } = createHarness({ createId: vi.fn().mockReturnValue('node-1') })
        service.start()

        const createdId = service.createNode({ label: 'Billing', role: 'backend' })
        service.setNodeField(createdId, 'label', 'Billing API')
        expect(service.getDirtySnapshot()).toBe(true)

        expect(service.removeNode(createdId)).toBe(true)
        expect(service.getDirtySnapshot()).toBe(false)

        service.removeNode('store')
        expect(service.getDirtySnapshot()).toBe(true)
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
