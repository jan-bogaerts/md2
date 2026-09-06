import { describe, expect, it, vi } from 'vitest'
import { parseDiagramData, serializeDiagramData, type DiagramData } from './diagram_data'
import type { DiagramRecord } from './diagram_index'
import {
    DEFAULT_DIAGRAM_ZOOM,
    DIAGRAM_ZOOM_STEP,
    DiagramEditSessionService,
    MAXIMUM_DIAGRAM_ZOOM,
    MINIMUM_DIAGRAM_ZOOM,
} from './diagram_edit_session_service'
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
const legendDiagram: DiagramData = {
    ...diagram,
    meta: {
        ...diagram.meta,
        legend: [{ label: 'Service', role: 'focal' }, { label: 'Database', role: 'store' }, { kind: 'connection', label: 'Calls' }],
    },
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

function legendHarness(reportValidationError?: (message: string) => void) {
    const { service } = createHarness({ reportValidationError, source: legendDiagram })
    service.start()

    return service
}

function membershipDetail(listener: ReturnType<typeof vi.fn>, callIndex = 0) {
    return (listener.mock.calls[callIndex][0] as CustomEvent).detail
}

describe('DiagramEditSessionService', () => {
    it('zooms only viewport scale by defined steps up to named maximum', () => {
        const { service } = createHarness()
        const viewportScaleChanged = vi.fn()
        const dirtyChanged = vi.fn()
        const changeIdsChanged = vi.fn()
        const sessionChanged = vi.fn()
        service.subscribeViewportScale(viewportScaleChanged)
        service.subscribeDirty(dirtyChanged)
        service.subscribeChangeIds(changeIdsChanged)
        service.subscribeSession(sessionChanged)
        service.start()
        sessionChanged.mockClear()
        const editableDiagram = service.getEditableDiagram()
        const changeIds = service.getChangeIdsSnapshot()

        expect(service.zoomIn()).toBe(true)
        expect(service.getViewportScaleSnapshot()).toBe(DEFAULT_DIAGRAM_ZOOM + DIAGRAM_ZOOM_STEP)
        expect(service.getEditableDiagram()).toBe(editableDiagram)
        expect(service.getChangeIdsSnapshot()).toBe(changeIds)
        expect(service.getDirtySnapshot()).toBe(false)
        expect(viewportScaleChanged).toHaveBeenCalledOnce()
        expect(dirtyChanged).not.toHaveBeenCalled()
        expect(changeIdsChanged).not.toHaveBeenCalled()
        expect(sessionChanged).not.toHaveBeenCalled()

        const remainingSteps = (MAXIMUM_DIAGRAM_ZOOM - service.getViewportScaleSnapshot()) / DIAGRAM_ZOOM_STEP
        Array.from({ length: remainingSteps }).forEach(() => service.zoomIn())
        expect(service.getViewportScaleSnapshot()).toBe(MAXIMUM_DIAGRAM_ZOOM)
        expect(service.zoomIn()).toBe(false)
        expect(viewportScaleChanged).toHaveBeenCalledTimes(remainingSteps + 1)
    })

    it('zooms out only viewport scale by defined steps down to named minimum', () => {
        const { service } = createHarness()
        const viewportScaleChanged = vi.fn()
        const dirtyChanged = vi.fn()
        const changeIdsChanged = vi.fn()
        const sessionChanged = vi.fn()
        service.subscribeViewportScale(viewportScaleChanged)
        service.subscribeDirty(dirtyChanged)
        service.subscribeChangeIds(changeIdsChanged)
        service.subscribeSession(sessionChanged)
        service.start()
        sessionChanged.mockClear()
        const editableDiagram = service.getEditableDiagram()
        const changeIds = service.getChangeIdsSnapshot()

        expect(service.zoomOut()).toBe(true)
        expect(service.getViewportScaleSnapshot()).toBe(DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP)
        expect(service.getEditableDiagram()).toBe(editableDiagram)
        expect(service.getChangeIdsSnapshot()).toBe(changeIds)
        expect(service.getDirtySnapshot()).toBe(false)
        expect(viewportScaleChanged).toHaveBeenCalledOnce()
        expect(dirtyChanged).not.toHaveBeenCalled()
        expect(changeIdsChanged).not.toHaveBeenCalled()
        expect(sessionChanged).not.toHaveBeenCalled()

        const remainingSteps = (service.getViewportScaleSnapshot() - MINIMUM_DIAGRAM_ZOOM) / DIAGRAM_ZOOM_STEP
        Array.from({ length: remainingSteps }).forEach(() => service.zoomOut())
        expect(service.getViewportScaleSnapshot()).toBe(MINIMUM_DIAGRAM_ZOOM)
        expect(service.zoomOut()).toBe(false)
        expect(viewportScaleChanged).toHaveBeenCalledTimes(remainingSteps + 1)
    })

    it('resets viewport scale on fresh session and discard', () => {
        const { service } = createHarness()
        const viewportScaleChanged = vi.fn()
        service.subscribeViewportScale(viewportScaleChanged)
        service.start()
        service.zoomIn()

        service.start()
        expect(service.getViewportScaleSnapshot()).toBe(DEFAULT_DIAGRAM_ZOOM)
        expect(viewportScaleChanged).toHaveBeenCalledTimes(2)

        service.zoomIn()
        service.discard()
        expect(service.getViewportScaleSnapshot()).toBe(DEFAULT_DIAGRAM_ZOOM)
        expect(viewportScaleChanged).toHaveBeenCalledTimes(4)
    })

    it('rejects zoom without an active edit session', () => {
        const { service } = createHarness()

        expect(() => service.zoomIn()).toThrow('Cannot zoom diagram without an active edit session')
        expect(() => service.zoomOut()).toThrow('Cannot zoom diagram without an active edit session')
    })

    it('publishes active tool and transient gesture independently', () => {
        const { service } = createHarness()
        const toolChanged = vi.fn()
        const gestureChanged = vi.fn()
        const sectionChanged = vi.fn()
        const sessionChanged = vi.fn()
        service.subscribeActiveTool(toolChanged)
        service.subscribeTransientGesture(gestureChanged)
        service.subscribeActiveToolboxSection(sectionChanged)
        service.subscribeSession(sessionChanged)
        service.start()
        sessionChanged.mockClear()

        service.setActiveTool('node:component')
        expect(service.getActiveToolSnapshot()).toBe('node:component')
        expect(service.getTransientGestureSnapshot()).toBeNull()
        expect(toolChanged).toHaveBeenCalledOnce()
        expect(gestureChanged).not.toHaveBeenCalled()

        service.beginTransientGesture('placement')
        expect(service.getTransientGestureSnapshot()).toBe('placement')
        expect(gestureChanged).toHaveBeenCalledOnce()
        expect(toolChanged).toHaveBeenCalledOnce()
        expect(sectionChanged).not.toHaveBeenCalled()
        expect(sessionChanged).not.toHaveBeenCalled()
    })

    it('keeps exactly one persistent tool and cancels an old tool gesture on replacement', () => {
        const { service } = createHarness()
        const toolChanged = vi.fn()
        const gestureChanged = vi.fn()
        service.subscribeActiveTool(toolChanged)
        service.subscribeTransientGesture(gestureChanged)
        service.start()
        service.setActiveTool('node:component')
        service.beginTransientGesture('placement')

        service.setActiveTool('edge:connection')

        expect(service.getActiveToolSnapshot()).toBe('edge:connection')
        expect(service.getTransientGestureSnapshot()).toBeNull()
        expect(toolChanged).toHaveBeenCalledTimes(2)
        expect(gestureChanged).toHaveBeenCalledTimes(2)
        service.setActiveTool('edge:connection')
        expect(toolChanged).toHaveBeenCalledTimes(2)
    })

    it('cancels active interaction and returns to Select', () => {
        const { service } = createHarness()
        service.start()
        service.setActiveTool('edge:connection')
        service.beginTransientGesture('edge')

        expect(service.cancelActiveInteraction()).toBe(true)
        expect(service.getActiveToolSnapshot()).toBe('select')
        expect(service.getTransientGestureSnapshot()).toBeNull()
        expect(service.cancelActiveInteraction()).toBe(false)
    })

    it('resets active interaction on fresh session, discard, source change, and project change', () => {
        const { service, sourceService } = createHarness()
        service.start()
        service.setActiveTool('node:component')
        service.beginTransientGesture('placement')
        service.start()
        expect(service.getActiveToolSnapshot()).toBe('select')
        expect(service.getTransientGestureSnapshot()).toBeNull()

        service.setActiveTool('group')
        service.beginTransientGesture('placement')
        service.discard()
        expect(service.getActiveToolSnapshot()).toBe('select')
        expect(service.getTransientGestureSnapshot()).toBeNull()

        service.start()
        service.setActiveTool('edge:connection')
        service.beginTransientGesture('edge')
        const nextRecord = { ...firstRecord, id: 'diagram-2', path: 'design/diagrams/detail.json' }
        sourceService.setSource({ diagram: structuredClone(diagram), record: nextRecord })
        expect(service.getActiveToolSnapshot()).toBe('select')
        expect(service.getTransientGestureSnapshot()).toBeNull()

        service.start()
        service.setActiveTool('node:component')
        service.beginTransientGesture('placement')
        service.bindProject({ ...project, branch: 'feature' })
        expect(service.getActiveToolSnapshot()).toBe('select')
        expect(service.getTransientGestureSnapshot()).toBeNull()
    })

    it('rejects tool and gesture changes without an active edit session', () => {
        const { service } = createHarness()

        expect(() => service.setActiveTool('group')).toThrow(
            'Cannot select a diagram tool without an active edit session',
        )
        expect(() => service.beginTransientGesture('placement')).toThrow(
            'Cannot begin a diagram gesture without an active edit session',
        )
        expect(service.cancelActiveInteraction()).toBe(false)
    })

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

    it('trims metadata fields and publishes only each changed field with its semantic change', () => {
        const { service } = createHarness()
        service.start()
        const editable = service.getEditableDiagram()
        const nodes = editable?.nodes
        const edges = editable?.edges
        const groups = editable?.groups
        const metadata = editable?.meta
        const titleChanged = vi.fn()
        const descriptionChanged = vi.fn()
        const nodeChanged = vi.fn()
        const nodeMembershipChanged = vi.fn()
        const sessionChanged = vi.fn()
        service.subscribeMetadataField('title', titleChanged)
        service.subscribeMetadataField('description', descriptionChanged)
        service.subscribeNodeField('orders', 'label', nodeChanged)
        service.subscribeCollectionMembership('node', nodeMembershipChanged)
        service.subscribeSession(sessionChanged)

        expect(service.setMetadataField('title', '  System overview  ')).toBe(true)

        expect(service.getEditableDiagram()).toBe(editable)
        expect(service.getEditableDiagram()?.nodes).toBe(nodes)
        expect(service.getEditableDiagram()?.edges).toBe(edges)
        expect(service.getEditableDiagram()?.groups).toBe(groups)
        expect(service.getEditableDiagram()?.meta).toBe(metadata)
        expect(service.getMetadataFieldSnapshot('title')).toBe('System overview')
        expect(service.getMetadataFieldSnapshot('description')).toBe('Orders architecture')
        expect(titleChanged).toHaveBeenCalledOnce()
        expect((titleChanged.mock.calls[0][0] as CustomEvent).detail).toEqual({
            field: 'title',
            objectId: 'diagram',
            objectKind: 'meta',
            previousValue: 'Overview',
            value: 'System overview',
        })
        expect(descriptionChanged).not.toHaveBeenCalled()
        expect(nodeChanged).not.toHaveBeenCalled()
        expect(nodeMembershipChanged).not.toHaveBeenCalled()
        expect(sessionChanged).not.toHaveBeenCalled()

        const [titleChangeId] = service.getChangeIdsSnapshot()
        expect(service.getChange(titleChangeId)).toMatchObject({
            category: 'field',
            field: 'title',
            objectId: 'diagram',
            objectKind: 'meta',
            originalValue: 'Overview',
            value: 'System overview',
        })

        expect(service.setMetadataField('description', '  Updated architecture  ')).toBe(true)
        expect(service.getMetadataFieldSnapshot('description')).toBe('Updated architecture')
        expect(titleChanged).toHaveBeenCalledOnce()
        expect(descriptionChanged).toHaveBeenCalledOnce()
        const descriptionChangeId = service.getChangeIdsSnapshot().find((changeId) => (
            service.getChangeFieldSnapshot(changeId, 'field') === 'description'
        ))
        if (!descriptionChangeId) throw new Error('Expected description semantic change')
        expect(service.getChangeFieldSnapshot(descriptionChangeId, 'value')).toBe('Updated architecture')
    })

    it('rejects blank metadata and treats surrounding whitespace on the current value as unchanged', () => {
        const reportValidationError = vi.fn()
        const { service } = createHarness({ reportValidationError })
        service.start()
        const titleChanged = vi.fn()
        const descriptionChanged = vi.fn()
        service.subscribeMetadataField('title', titleChanged)
        service.subscribeMetadataField('description', descriptionChanged)

        expect(service.setMetadataField('title', '  Overview  ')).toBe(false)
        expect(service.setMetadataField('description', ' \n ')).toBe(false)

        expect(service.getMetadataFieldSnapshot('title')).toBe('Overview')
        expect(service.getMetadataFieldSnapshot('description')).toBe('Orders architecture')
        expect(service.getChangeIdsSnapshot()).toEqual([])
        expect(service.getDirtySnapshot()).toBe(false)
        expect(titleChanged).not.toHaveBeenCalled()
        expect(descriptionChanged).not.toHaveBeenCalled()
        expect(reportValidationError).toHaveBeenCalledExactlyOnceWith(
            'Set diagram metadata field rejected: meta.description has invalid string',
        )
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

    it('reconnects each endpoint atomically while preserving stable edge and attachment objects', () => {
        const { service } = createHarness()
        service.start()
        const edge = service.getEdgeSnapshot('orders-store')
        const sourceAttachment = service.getConnectionPointSnapshot('orders-store', 'sourceAttachment')
        const targetAttachment = service.getConnectionPointSnapshot('orders-store', 'targetAttachment')
        const fromChanged = vi.fn()
        const toChanged = vi.fn()
        const sourceNodeChanged = vi.fn()
        const targetNodeChanged = vi.fn()
        const edgeMembershipChanged = vi.fn()
        service.subscribeEdgeField('orders-store', 'from', fromChanged)
        service.subscribeEdgeField('orders-store', 'to', toChanged)
        service.subscribeConnectionPointField('orders-store', 'sourceAttachment', 'nodeId', sourceNodeChanged)
        service.subscribeConnectionPointField('orders-store', 'targetAttachment', 'nodeId', targetNodeChanged)
        service.subscribeCollectionMembership('edge', edgeMembershipChanged)

        expect(service.reconnectEdgeEndpoint('orders-store', 'sourceAttachment', 'store')).toBe(true)
        expect(service.reconnectEdgeEndpoint('orders-store', 'targetAttachment', 'orders')).toBe(true)

        expect(service.getEdgeSnapshot('orders-store')).toBe(edge)
        expect(service.getConnectionPointSnapshot('orders-store', 'sourceAttachment')).toBe(sourceAttachment)
        expect(service.getConnectionPointSnapshot('orders-store', 'targetAttachment')).toBe(targetAttachment)
        expect(service.getEdgeFieldSnapshot('orders-store', 'from')).toBe('store')
        expect(service.getEdgeFieldSnapshot('orders-store', 'to')).toBe('orders')
        expect(service.getConnectionPointFieldSnapshot('orders-store', 'sourceAttachment', 'nodeId')).toBe('store')
        expect(service.getConnectionPointFieldSnapshot('orders-store', 'targetAttachment', 'nodeId')).toBe('orders')
        expect(service.getConnectionPointFieldSnapshot('orders-store', 'sourceAttachment', 'offset')).toBe(0.5)
        expect(service.getConnectionPointFieldSnapshot('orders-store', 'targetAttachment', 'side')).toBe('left')
        expect(fromChanged).toHaveBeenCalledOnce()
        expect(toChanged).toHaveBeenCalledOnce()
        expect(sourceNodeChanged).toHaveBeenCalledOnce()
        expect(targetNodeChanged).toHaveBeenCalledOnce()
        expect(edgeMembershipChanged).not.toHaveBeenCalled()
    })

    it('rejects endpoint reconnection before mutating either endpoint field', () => {
        const reportValidationError = vi.fn()
        const { service } = createHarness({ reportValidationError })
        service.start()
        const edge = service.getEdgeSnapshot('orders-store')
        const sourceAttachment = service.getConnectionPointSnapshot('orders-store', 'sourceAttachment')

        expect(service.reconnectEdgeEndpoint('orders-store', 'sourceAttachment', 'missing')).toBe(false)

        expect(service.getEdgeSnapshot('orders-store')).toBe(edge)
        expect(service.getConnectionPointSnapshot('orders-store', 'sourceAttachment')).toBe(sourceAttachment)
        expect(service.getEdgeFieldSnapshot('orders-store', 'from')).toBe('orders')
        expect(service.getConnectionPointFieldSnapshot('orders-store', 'sourceAttachment', 'nodeId')).toBe('orders')
        expect(service.getDirtySnapshot()).toBe(false)
        expect(reportValidationError).toHaveBeenCalledWith(
            'Reconnect edge endpoint rejected: edges.orders-store.from has unknown node missing',
        )
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

    it('adds, reorders, and removes entity fields through one scoped membership event per operation', () => {
        const { service } = createHarness({ source: entityDiagram })
        service.start()
        const membershipChanged = vi.fn()
        const nodeFieldsChanged = vi.fn()
        const originalIndexes = service.getEntityFieldIndexesSnapshot('order')
        const originalNode = service.getNodeSnapshot('order')
        service.subscribeEntityFieldMembership('order', membershipChanged)
        service.subscribeNodeField('order', 'fields', nodeFieldsChanged)

        expect(service.addEntityField('order', { key: 'foreign', name: 'customerId', type: 'uuid' })).toBe(true)
        expect(service.getEntityFieldIndexesSnapshot('order')).toEqual([0, 1])
        expect(service.getEntityFieldIndexesSnapshot('order')).not.toBe(originalIndexes)
        expect(service.getNodeSnapshot('order')).toBe(originalNode)
        expect(service.moveEntityField('order', 1, 0)).toBe(true)
        expect(service.getEntityFieldValueSnapshot('order', 0, 'name')).toBe('customerId')
        expect(service.removeEntityField('order', 1)).toBe(true)

        expect(service.getEntityFieldIndexesSnapshot('order')).toEqual([0])
        expect(service.getEntityFieldValueSnapshot('order', 0, 'name')).toBe('customerId')
        expect(membershipChanged).toHaveBeenCalledTimes(3)
        expect(membershipDetail(membershipChanged, 0)).toEqual({ addedIndexes: [1], nodeId: 'order', removedIndexes: [] })
        expect(membershipDetail(membershipChanged, 1)).toEqual({ addedIndexes: [0], nodeId: 'order', removedIndexes: [1] })
        expect(membershipDetail(membershipChanged, 2)).toEqual({ addedIndexes: [], nodeId: 'order', removedIndexes: [1] })
        expect(nodeFieldsChanged).not.toHaveBeenCalled()
        expect(service.getDirtySnapshot()).toBe(true)
    })

    it('validates entity fields before insertion and leaves membership unchanged when rejected', () => {
        const reportValidationError = vi.fn()
        const { service } = createHarness({ reportValidationError, source: entityDiagram })
        service.start()
        const fields = service.getNodeFieldSnapshot('order', 'fields')
        const indexes = service.getEntityFieldIndexesSnapshot('order')

        expect(service.addEntityField('order', { name: '' })).toBe(false)
        expect(service.addEntityField('order', { name: 'createdAt' }, 3)).toBe(false)

        expect(service.getNodeFieldSnapshot('order', 'fields')).toBe(fields)
        expect(service.getEntityFieldIndexesSnapshot('order')).toBe(indexes)
        expect(service.getDirtySnapshot()).toBe(false)
        expect(reportValidationError).toHaveBeenCalledTimes(2)
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

    it('pastes remapped objects with grid offset through one exact collection transaction', () => {
        const createId = vi.fn()
            .mockReturnValueOnce('user')
            .mockReturnValueOnce('pasted-user')
            .mockReturnValueOnce('pasted-orders')
            .mockReturnValueOnce('pasted-call')
            .mockReturnValueOnce('pasted-group')
            .mockReturnValueOnce('pasted-fragment')
        const service = sequenceHarness(createId)
        const editable = service.getEditableDiagram()
        const nodes = editable?.nodes
        const edges = editable?.edges
        const groups = editable?.groups
        const fragments = editable?.fragments
        const existingNode = service.getNodeSnapshot('user')
        const existingEdge = service.getEdgeSnapshot('user-orders')
        const nodeMembershipChanged = vi.fn()
        const edgeMembershipChanged = vi.fn()
        const groupMembershipChanged = vi.fn()
        const fragmentMembershipChanged = vi.fn()
        const existingNodeChanged = vi.fn()
        const existingGroupMembershipChanged = vi.fn()
        const existingFragmentMembershipChanged = vi.fn()
        service.subscribeCollectionMembership('node', nodeMembershipChanged)
        service.subscribeCollectionMembership('edge', edgeMembershipChanged)
        service.subscribeCollectionMembership('group', groupMembershipChanged)
        service.subscribeCollectionMembership('fragment', fragmentMembershipChanged)
        service.subscribeNodeField('user', 'label', existingNodeChanged)
        service.subscribeGroupMembership('backend', existingGroupMembershipChanged)
        service.subscribeFragmentRegionMembership('transaction', 0, existingFragmentMembershipChanged)

        const result = service.pasteFragment({
            edges: [{
                from: 'source-user',
                id: 'source-call',
                kind: 'call',
                sourceAttachment: { nodeId: 'source-user', offset: 0.5, side: 'right' },
                targetAttachment: { nodeId: 'source-orders', offset: 0.5, side: 'left' },
                to: 'source-orders',
                waypoints: [{ x: 20, y: 12 }, { x: 40, y: 12 }],
            }],
            fragments: [{
                id: 'source-fragment',
                operator: 'opt',
                regions: [{ edgeIds: ['source-call'], guard: 'requested' }],
            }],
            groups: [{ id: 'source-group', label: 'Pair', nodeIds: ['source-user', 'source-orders'], x: 4, y: 8 }],
            nodes: [
                { id: 'source-user', kind: 'participant', label: 'User copy', role: 'external', x: 8, y: 12 },
                { id: 'source-orders', kind: 'participant', label: 'Orders copy', role: 'focal', x: 32, y: 12 },
            ],
        }, 4)

        expect(result).toEqual({
            identities: [
                { objectId: 'pasted-user', objectKind: 'node' },
                { objectId: 'pasted-orders', objectKind: 'node' },
                { objectId: 'pasted-call', objectKind: 'edge' },
                { objectId: 'pasted-group', objectKind: 'group' },
            ],
        })
        expect(createId).toHaveBeenCalledTimes(6)
        expect(service.getEditableDiagram()).toBe(editable)
        expect(service.getEditableDiagram()?.nodes).toBe(nodes)
        expect(service.getEditableDiagram()?.edges).toBe(edges)
        expect(service.getEditableDiagram()?.groups).toBe(groups)
        expect(service.getEditableDiagram()?.fragments).toBe(fragments)
        expect(service.getNodeSnapshot('user')).toBe(existingNode)
        expect(service.getEdgeSnapshot('user-orders')).toBe(existingEdge)
        expect(service.getNodeSnapshot('pasted-user')).toMatchObject({ x: 12, y: 16 })
        expect(service.getEdgeSnapshot('pasted-call')).toMatchObject({
            from: 'pasted-user',
            sourceAttachment: { nodeId: 'pasted-user' },
            targetAttachment: { nodeId: 'pasted-orders' },
            to: 'pasted-orders',
            waypoints: [{ x: 24, y: 16 }, { x: 44, y: 16 }],
        })
        expect(service.getGroupSnapshot('pasted-group')).toMatchObject({ nodeIds: ['pasted-user', 'pasted-orders'], x: 8, y: 12 })
        expect(service.getFragmentSnapshot('pasted-fragment')).toMatchObject({regions: [{ edgeIds: ['pasted-call'], guard: 'requested' }]})
        expect(nodeMembershipChanged).toHaveBeenCalledOnce()
        expect(membershipDetail(nodeMembershipChanged).addedIds).toEqual(['pasted-user', 'pasted-orders'])
        expect(edgeMembershipChanged).toHaveBeenCalledOnce()
        expect(membershipDetail(edgeMembershipChanged).addedIds).toEqual(['pasted-call'])
        expect(groupMembershipChanged).toHaveBeenCalledOnce()
        expect(membershipDetail(groupMembershipChanged).addedIds).toEqual(['pasted-group'])
        expect(fragmentMembershipChanged).toHaveBeenCalledOnce()
        expect(membershipDetail(fragmentMembershipChanged).addedIds).toEqual(['pasted-fragment'])
        expect(existingNodeChanged).not.toHaveBeenCalled()
        expect(existingGroupMembershipChanged).not.toHaveBeenCalled()
        expect(existingFragmentMembershipChanged).not.toHaveBeenCalled()
        expect(service.getChangeIdsSnapshot()).toHaveLength(5)
    })

    it('rejects pasted object kinds unsupported by target type before mutation', () => {
        const reportValidationError = vi.fn()
        const { service } = createHarness({ reportValidationError })
        service.start()
        const editable = service.getEditableDiagram()
        const nodeIds = service.getNodeIdsSnapshot()
        const changeIds = service.getChangeIdsSnapshot()
        const nodeMembershipChanged = vi.fn()
        service.subscribeCollectionMembership('node', nodeMembershipChanged)

        const result = service.pasteFragment({
            edges: [],
            fragments: [],
            groups: [],
            nodes: [{ id: 'participant', kind: 'participant', label: 'Participant', role: 'external', x: 4, y: 4 }],
        }, 4)

        expect(result).toBeNull()
        expect(service.getEditableDiagram()).toBe(editable)
        expect(service.getNodeIdsSnapshot()).toBe(nodeIds)
        expect(service.getChangeIdsSnapshot()).toBe(changeIds)
        expect(service.getDirtySnapshot()).toBe(false)
        expect(nodeMembershipChanged).not.toHaveBeenCalled()
        expect(reportValidationError).toHaveBeenCalledWith(expect.stringContaining('Paste diagram fragment rejected'))
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

    it('deletes one selection, preserves emptied hosts, and reports the invalid fragment region after publication', () => {
        const source = structuredClone(sequenceDiagram)
        source.groups.push({ id: 'actors', label: 'Actors', nodeIds: ['user'] })
        const sourceBeforeDelete = structuredClone(source)
        const reportValidationError = vi.fn()
        const { service } = createHarness({ reportValidationError, source })
        service.start()
        const editable = service.getEditableDiagram()
        const nodes = editable?.nodes
        const edges = editable?.edges
        const groups = editable?.groups
        const fragments = editable?.fragments
        const user = service.getNodeSnapshot('user')
        const transaction = service.getFragmentSnapshot('transaction')
        const actors = service.getGroupSnapshot('actors')
        const actorsNodeIds = service.getGroupNodeIdsSnapshot('actors')
        const nodeMembershipChanged = vi.fn()
        const edgeMembershipChanged = vi.fn()
        const groupMembershipChanged = vi.fn()
        const backendMembershipChanged = vi.fn()
        const fragmentMembershipChanged = vi.fn()
        const dirtyChanged = vi.fn()
        const changeIdsChanged = vi.fn()
        service.subscribeCollectionMembership('node', nodeMembershipChanged)
        service.subscribeCollectionMembership('edge', edgeMembershipChanged)
        service.subscribeCollectionMembership('group', groupMembershipChanged)
        service.subscribeGroupMembership('backend', backendMembershipChanged)
        service.subscribeCollectionMembership('fragment', fragmentMembershipChanged)
        service.subscribeDirty(dirtyChanged)
        service.subscribeChangeIds(changeIdsChanged)

        expect(service.removeObjects([
            { objectId: 'orders', objectKind: 'node' },
            { objectId: 'orders-user', objectKind: 'edge' },
        ])).toBe(true)

        expect(service.getEditableDiagram()).toBe(editable)
        expect(service.getEditableDiagram()?.nodes).toBe(nodes)
        expect(service.getEditableDiagram()?.edges).toBe(edges)
        expect(service.getEditableDiagram()?.groups).toBe(groups)
        expect(service.getEditableDiagram()?.fragments).toBe(fragments)
        expect(service.getNodeSnapshot('user')).toBe(user)
        expect(service.getGroupSnapshot('actors')).toBe(actors)
        expect(service.getGroupNodeIdsSnapshot('actors')).toBe(actorsNodeIds)
        expect(service.getNodeIdsSnapshot()).toEqual(['user'])
        expect(service.getEdgeIdsSnapshot()).toEqual([])
        expect(service.getGroupIdsSnapshot()).toEqual(['backend', 'actors'])
        expect(service.getGroupNodeIdsSnapshot('backend')).toEqual([])
        expect(service.getFragmentIdsSnapshot()).toEqual(['transaction'])
        expect(service.getFragmentSnapshot('transaction')).toBe(transaction)
        expect(service.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).toEqual([])
        expect(membershipDetail(nodeMembershipChanged).removedIds).toEqual(['orders'])
        expect(membershipDetail(edgeMembershipChanged).removedIds).toEqual(['user-orders', 'orders-user'])
        expect(nodeMembershipChanged).toHaveBeenCalledOnce()
        expect(edgeMembershipChanged).toHaveBeenCalledOnce()
        expect(groupMembershipChanged).not.toHaveBeenCalled()
        expect(backendMembershipChanged).toHaveBeenCalledOnce()
        expect(fragmentMembershipChanged).not.toHaveBeenCalled()
        expect(dirtyChanged).toHaveBeenCalledOnce()
        expect(changeIdsChanged).toHaveBeenCalledOnce()
        expect(service.getChangeIdsSnapshot()).toHaveLength(7)
        expect(service.getChangeIdsSnapshot().map((changeId) => service.getChange(changeId))).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ category: 'collection', objectId: 'orders', objectKind: 'node', value: null }),
                expect.objectContaining({ category: 'collection', objectId: 'user-orders', objectKind: 'edge', value: null }),
                expect.objectContaining({ category: 'collection', objectId: 'orders-user', objectKind: 'edge', value: null }),
                expect.objectContaining({ category: 'membership', objectId: 'orders', objectKind: 'node', ownerId: 'backend', value: false }),
                expect.objectContaining({ category: 'membership', objectId: 'user-orders', ownerId: 'transaction', value: false }),
                expect.objectContaining({ category: 'membership', objectId: 'orders-user', ownerId: 'transaction', value: false }),
            ]),
        )
        expect(reportValidationError).toHaveBeenCalledWith(
            'Delete selection validation problem: fragments.transaction.regions[0].edgeIds has empty array',
        )
        expect(source).toEqual(sourceBeforeDelete)
        expect(service.getOriginalDiagramSnapshot()?.diagram).toEqual(sourceBeforeDelete)
    })

    it('keeps valid hosts and republishes only references changed by batch deletion', () => {
        const service = sequenceHarness()
        const fragment = service.getFragmentSnapshot('transaction')
        const group = service.getGroupSnapshot('backend')
        const groupNodeIds = service.getGroupNodeIdsSnapshot('backend')
        const fragmentRegionChanged = vi.fn()
        const groupMembershipChanged = vi.fn()
        service.subscribeFragmentRegionMembership('transaction', 0, fragmentRegionChanged)
        service.subscribeGroupMembership('backend', groupMembershipChanged)

        expect(service.removeObjects([{ objectId: 'user-orders', objectKind: 'edge' }])).toBe(true)

        expect(service.getFragmentSnapshot('transaction')).toBe(fragment)
        expect(service.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).toEqual(['orders-user'])
        expect(service.getGroupSnapshot('backend')).toBe(group)
        expect(service.getGroupNodeIdsSnapshot('backend')).toBe(groupNodeIds)
        expect(fragmentRegionChanged).toHaveBeenCalledOnce()
        expect(groupMembershipChanged).not.toHaveBeenCalled()
        expect(service.getChangeIdsSnapshot().map((changeId) => service.getChange(changeId))).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ category: 'collection', objectId: 'user-orders', objectKind: 'edge' }),
                expect.objectContaining({ category: 'membership', objectId: 'user-orders', ownerId: 'transaction' }),
            ]),
        )
    })

    it('rejects a batch that would remove every node without partial mutation', () => {
        const source: DiagramData = {
            edges: [],
            groups: [],
            meta: { description: 'Single node', title: 'Single', type: 'architecture', version: 1 },
            nodes: [{ id: 'only', label: 'Only', role: 'focal' }],
        }
        const reportValidationError = vi.fn()
        const { service } = createHarness({ reportValidationError, source })
        service.start()
        const editable = service.getEditableDiagram()
        const nodeIds = service.getNodeIdsSnapshot()

        expect(service.removeObjects([{ objectId: 'only', objectKind: 'node' }])).toBe(false)

        expect(service.getEditableDiagram()).toBe(editable)
        expect(service.getNodeIdsSnapshot()).toBe(nodeIds)
        expect(service.getNodeSnapshot('only')).not.toBeNull()
        expect(service.getChangeIdsSnapshot()).toEqual([])
        expect(reportValidationError).toHaveBeenCalledWith(
            'Delete selection rejected: nodes has empty array after deleting selection',
        )
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

    it('inserts and moves sequence messages by persisted row without changing fragment references', () => {
        const service = sequenceHarness(vi.fn().mockReturnValue('edge-1'))
        const edgeMembershipChanged = vi.fn()
        const fragmentEdgeIds = service.getFragmentRegionEdgeIdsSnapshot('transaction', 0)
        service.subscribeCollectionMembership('edge', edgeMembershipChanged)

        expect(service.createSequenceEdge({ from: 'orders', kind: 'success', to: 'user' }, 1)).toBe('edge-1')
        expect(service.getEdgeIdsSnapshot()).toEqual(['user-orders', 'edge-1', 'orders-user'])
        expect(edgeMembershipChanged).toHaveBeenCalledOnce()
        expect(service.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).toBe(fragmentEdgeIds)

        expect(service.moveSequenceEdge('orders-user', 0)).toBe(true)
        expect(service.getEdgeIdsSnapshot()).toEqual(['orders-user', 'user-orders', 'edge-1'])
        expect(edgeMembershipChanged).toHaveBeenCalledTimes(2)
        expect(service.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).toBe(fragmentEdgeIds)

        const persisted = parseDiagramData(JSON.stringify(service.getEditableDiagram()))
        const reloaded = parseDiagramData(serializeDiagramData(persisted))
        expect(reloaded.edges.map(({ id }) => id)).toEqual(['orders-user', 'user-orders', 'edge-1'])
        expect(reloaded.fragments?.[0].regions[0].edgeIds).toEqual(['user-orders', 'orders-user'])
    })

    it('rejects sequence row operations on invalid rows and other diagram types', () => {
        const reportValidationError = vi.fn()
        const sequence = sequenceHarness(vi.fn().mockReturnValue('edge-1'), reportValidationError)

        expect(sequence.createSequenceEdge({ from: 'orders', kind: 'success', to: 'user' }, 3)).toBeNull()
        expect(sequence.moveSequenceEdge('orders-user', -1)).toBe(false)
        expect(sequence.getEdgeIdsSnapshot()).toEqual(['user-orders', 'orders-user'])

        const { service: architecture } = createHarness({ reportValidationError })
        architecture.start()
        expect(architecture.createSequenceEdge({ from: 'orders', kind: 'connection', to: 'store' }, 0)).toBeNull()
        expect(architecture.moveSequenceEdge('orders-store', 0)).toBe(false)
        expect(reportValidationError).toHaveBeenCalledTimes(4)
    })

    it('creates and removes groups without touching their member nodes', () => {
        const { service } = createHarness({ createId: vi.fn().mockReturnValue('group-1') })
        service.start()
        const store = service.getNodeSnapshot('store')
        const groupMembershipChanged = vi.fn()
        const nodeMembershipChanged = vi.fn()
        service.subscribeCollectionMembership('group', groupMembershipChanged)
        service.subscribeCollectionMembership('node', nodeMembershipChanged)

        const createdId = service.createGroup({ height: 80, label: 'Storage', nodeIds: [], width: 120, x: 20, y: 24 })

        expect(createdId).toBe('group-1')
        expect(service.getGroupIdsSnapshot()).toEqual(['backend', 'group-1'])
        expect(service.getGroupNodeIdsSnapshot('group-1')).toEqual([])
        expect(service.getGroupSnapshot('group-1')).toMatchObject({ height: 80, width: 120, x: 20, y: 24 })
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

    it('allows removing the final group member and removing a final member node without deleting the group', () => {
        const { service } = createHarness()
        service.start()
        service.removeGroupMember('backend', 'store')

        expect(service.removeGroupMember('backend', 'orders')).toBe(true)
        expect(service.getGroupNodeIdsSnapshot('backend')).toEqual([])

        expect(service.addGroupMember('backend', 'store')).toBe(true)
        expect(service.removeNode('store')).toBe(true)
        expect(service.getGroupSnapshot('backend')).not.toBeNull()
        expect(service.getGroupNodeIdsSnapshot('backend')).toEqual([])
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

        expect(service.removeFragmentRegionEdge('transaction', 0, 'user-orders')).toBe(true)
        expect(service.addFragmentRegionEdge('transaction', 0, 'user-orders')).toBe(true)
        expect(service.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).toEqual(['orders-user', 'user-orders'])
        expect(service.getDirtySnapshot()).toBe(true)
    })

    it('updates operator, guards, and ordered region assignments atomically without replacing fragment identity', () => {
        const reportValidationError = vi.fn()
        const service = sequenceHarness(undefined, reportValidationError)
        const fragment = service.getFragmentSnapshot('transaction')
        const fragmentIds = service.getFragmentIdsSnapshot()
        const fragmentCollectionChanged = vi.fn()
        const operatorChanged = vi.fn()
        const firstGuardChanged = vi.fn()
        const secondGuardChanged = vi.fn()
        const firstRegionChanged = vi.fn(() => {
            expect(service.getFragmentSnapshot('transaction')?.regions).toEqual([
                { edgeIds: ['orders-user'], guard: 'accepted' },
                { edgeIds: ['user-orders'], guard: 'rejected' },
            ])
        })
        const secondRegionChanged = vi.fn()
        service.subscribeCollectionMembership('fragment', fragmentCollectionChanged)
        service.subscribeFragmentField('transaction', 'operator', operatorChanged)
        service.subscribeFragmentRegionField('transaction', 0, 'guard', firstGuardChanged)
        service.subscribeFragmentRegionField('transaction', 1, 'guard', secondGuardChanged)
        service.subscribeFragmentRegionMembership('transaction', 0, firstRegionChanged)
        service.subscribeFragmentRegionMembership('transaction', 1, secondRegionChanged)

        expect(service.updateFragment('transaction', {
            operator: 'alt',
            regions: [
                { edgeIds: ['orders-user'], guard: 'accepted' },
                { edgeIds: ['user-orders'], guard: 'rejected' },
            ],
        })).toBe(true)

        expect(service.getFragmentSnapshot('transaction')).toBe(fragment)
        expect(service.getFragmentIdsSnapshot()).toBe(fragmentIds)
        expect(service.getFragmentRegionFieldSnapshot('transaction', 0, 'guard')).toBe('accepted')
        expect(service.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).toEqual(['orders-user'])
        expect(operatorChanged).toHaveBeenCalledOnce()
        expect(firstGuardChanged).toHaveBeenCalledOnce()
        expect(secondGuardChanged).toHaveBeenCalledOnce()
        expect(firstRegionChanged).toHaveBeenCalledOnce()
        expect(secondRegionChanged).toHaveBeenCalledOnce()
        expect(fragmentCollectionChanged).not.toHaveBeenCalled()
        expect(reportValidationError).not.toHaveBeenCalled()
    })

    it('tracks guard and edge order edits as net fragment changes and rejects invalid complete edits before mutation', () => {
        const reportValidationError = vi.fn()
        const service = sequenceHarness(undefined, reportValidationError)
        const fragment = service.getFragmentSnapshot('transaction')
        const regionEdgeIds = service.getFragmentRegionEdgeIdsSnapshot('transaction', 0)
        const guardChanged = vi.fn()
        const membershipChanged = vi.fn()
        service.subscribeFragmentRegionField('transaction', 0, 'guard', guardChanged)
        service.subscribeFragmentRegionMembership('transaction', 0, membershipChanged)

        expect(service.updateFragment('transaction', {
            operator: 'opt',
            regions: [{ edgeIds: ['orders-user', 'user-orders'], guard: 'approved' }],
        })).toBe(true)
        const changeIds = service.getChangeIdsSnapshot()
        expect(changeIds.map((changeId) => service.getChange(changeId))).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'guard', objectId: 'transaction', regionIndex: 0, value: 'approved' }),
            expect.objectContaining({ field: 'edgeIds', objectId: 'transaction', regionIndex: 0, value: ['orders-user', 'user-orders'] }),
        ]))

        expect(service.updateFragment('transaction', {
            operator: 'opt',
            regions: [{ edgeIds: [], guard: 'invalid' }],
        })).toBe(false)
        expect(service.updateFragment('transaction', {
            operator: 'alt',
            regions: [
                { edgeIds: ['user-orders'], guard: 'one' },
                { edgeIds: ['user-orders'], guard: 'two' },
            ],
        })).toBe(false)
        expect(service.getFragmentSnapshot('transaction')).toBe(fragment)
        expect(service.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).toEqual(['orders-user', 'user-orders'])
        expect(guardChanged).toHaveBeenCalledOnce()
        expect(membershipChanged).toHaveBeenCalledOnce()

        expect(service.updateFragment('transaction', {
            operator: 'opt',
            regions: [{ edgeIds: ['user-orders', 'orders-user'], guard: 'requested' }],
        })).toBe(true)
        expect(service.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).not.toBe(regionEdgeIds)
        expect(service.getDirtySnapshot()).toBe(false)
        expect(service.getChangeIdsSnapshot()).toEqual([])
        expect(reportValidationError).toHaveBeenCalledTimes(2)
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
        const relationship = entity.getEdgeSnapshot('order-item')
        expect(entity.setEdgeField('order-item', 'fromCardinality', 'many' as never)).toBe(false)
        expect(entity.createEdge({ from: 'order', kind: 'relationship', to: 'missing' })).toBeNull()
        expect(entity.getEdgeSnapshot('order-item')).toBe(relationship)
        expect(entity.getEdgeFieldSnapshot('order-item', 'fromCardinality')).toBe('1')

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
        expect(entityReporter).toHaveBeenCalledWith(
            'Set edge field rejected: edges.order-item.fromCardinality has unsupported value many',
        )
        expect(entityReporter).toHaveBeenCalledWith(
            'Create edge rejected: edges.new.to has unknown node missing',
        )
    })

    it('removes an edge reference and reports the resulting empty required fragment region', () => {
        const fragmentReporter = vi.fn()
        const sequence = sequenceHarness(undefined, fragmentReporter)
        expect(sequence.removeFragmentRegionEdge('transaction', 0, 'user-orders')).toBe(true)
        const regionEdgeIds = sequence.getFragmentRegionEdgeIdsSnapshot('transaction', 0)
        expect(sequence.removeEdge('orders-user')).toBe(true)
        expect(sequence.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).not.toBe(regionEdgeIds)
        expect(sequence.getFragmentRegionEdgeIdsSnapshot('transaction', 0)).toEqual([])
        expect(sequence.getEdgeSnapshot('orders-user')).toBeNull()

        expect(fragmentReporter).toHaveBeenCalledWith(
            'Remove edge validation problem: fragments.transaction.regions[0].edgeIds has empty array',
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

    it('exposes explicit legend membership and per-entry labels from the source diagram', () => {
        const service = legendHarness()

        expect(service.getLegendEntryKeysSnapshot()).toEqual(['node:focal', 'node:store', 'connection:connection'])
        expect(service.getLegendEntryFieldSnapshot('node:focal', 'label')).toBe('Service')
        expect(service.getLegendEntryFieldSnapshot('node:focal', 'role')).toBe('focal')
        expect(service.getLegendEntryFieldSnapshot('connection:connection', 'kind')).toBe('connection')
        expect(service.getLegendEntryFieldSnapshot('node:external', 'label')).toBeNull()
        expect(service.getOriginalLegendEntryFieldSnapshot('node:focal', 'label')).toBe('Service')
    })

    it('reports an empty legend for a diagram without explicit entries', () => {
        const { service } = createHarness()
        service.start()

        expect(service.getLegendEntryKeysSnapshot()).toEqual([])
    })

    it('assigns only the label of the addressed legend entry', () => {
        const service = legendHarness()
        const labelChanged = vi.fn()
        const otherLabelChanged = vi.fn()
        const membershipChanged = vi.fn()
        service.subscribeLegendEntryField('node:focal', 'label', labelChanged)
        service.subscribeLegendEntryField('node:store', 'label', otherLabelChanged)
        service.subscribeLegendMembership(membershipChanged)
        const entryKeys = service.getLegendEntryKeysSnapshot()

        expect(service.setLegendEntryLabel('node:focal', '  Order service  ')).toBe(true)
        expect(service.getLegendEntryFieldSnapshot('node:focal', 'label')).toBe('Order service')
        expect(service.getLegendEntryFieldSnapshot('node:store', 'label')).toBe('Database')
        expect(service.getLegendEntryKeysSnapshot()).toBe(entryKeys)
        expect(labelChanged).toHaveBeenCalledOnce()
        expect(otherLabelChanged).not.toHaveBeenCalled()
        expect(membershipChanged).not.toHaveBeenCalled()
        expect(service.setLegendEntryLabel('node:focal', 'Order service')).toBe(false)
        expect(labelChanged).toHaveBeenCalledOnce()
    })

    it('rejects an empty legend label and keeps the previous value', () => {
        const reportValidationError = vi.fn()
        const service = legendHarness(reportValidationError)

        expect(service.setLegendEntryLabel('node:focal', '   ')).toBe(false)
        expect(service.getLegendEntryFieldSnapshot('node:focal', 'label')).toBe('Service')
        expect(reportValidationError).toHaveBeenCalledWith(expect.stringContaining('Set legend entry label rejected'))
        expect(service.getDirtySnapshot()).toBe(false)
    })

    it('adds an entry with a canonical label and rejects a duplicate semantic', () => {
        const reportValidationError = vi.fn()
        const service = legendHarness(reportValidationError)
        const membershipChanged = vi.fn()
        service.subscribeLegendMembership(membershipChanged)

        expect(service.addLegendEntry({ role: 'external' })).toBe('node:external')
        expect(service.getLegendEntryKeysSnapshot()).toEqual(['node:focal', 'node:store', 'connection:connection', 'node:external'])
        expect(service.getLegendEntryFieldSnapshot('node:external', 'label')).toBe('external')
        expect(membershipDetail(membershipChanged)).toEqual({ addedKeys: ['node:external'], removedKeys: [] })

        expect(service.addLegendEntry({ label: 'Again', role: 'focal' })).toBeNull()
        expect(reportValidationError).toHaveBeenCalledWith(expect.stringContaining('duplicate entry for node:focal'))
        expect(service.addLegendEntry({ role: 'nope' } as never)).toBeNull()
        expect(membershipChanged).toHaveBeenCalledOnce()
    })

    it('creates an explicit legend on the first added entry of a derived diagram', () => {
        const { service } = createHarness()
        service.start()

        expect(service.addLegendEntry({ kind: 'connection', label: 'Calls' })).toBe('connection:connection')
        expect(service.getEditableDiagram()?.meta.legend).toEqual([{ kind: 'connection', label: 'Calls' }])
    })

    it('removes a legend entry without touching nodes or edges', () => {
        const service = legendHarness()
        const membershipChanged = vi.fn()
        service.subscribeLegendMembership(membershipChanged)
        const nodes = service.getEditableDiagram()?.nodes
        const edges = service.getEditableDiagram()?.edges
        const nodeIds = service.getNodeIdsSnapshot()
        const edgeIds = service.getEdgeIdsSnapshot()

        expect(service.removeLegendEntry('node:store')).toBe(true)
        expect(service.getLegendEntryKeysSnapshot()).toEqual(['node:focal', 'connection:connection'])
        expect(service.getEditableDiagram()?.nodes).toBe(nodes)
        expect(service.getEditableDiagram()?.edges).toBe(edges)
        expect(service.getNodeIdsSnapshot()).toBe(nodeIds)
        expect(service.getEdgeIdsSnapshot()).toBe(edgeIds)
        expect(membershipDetail(membershipChanged)).toEqual({ addedKeys: [], removedKeys: ['node:store'] })
        expect(service.removeLegendEntry('node:store')).toBe(false)
        expect(membershipChanged).toHaveBeenCalledOnce()
    })

    it('drops the legend key once the last explicit entry is removed', () => {
        const service = legendHarness()

        for (const entryKey of [...service.getLegendEntryKeysSnapshot()]) service.removeLegendEntry(entryKey)

        expect(service.getLegendEntryKeysSnapshot()).toEqual([])
        expect('legend' in (service.getEditableDiagram()?.meta ?? {})).toBe(false)
    })

    it('reorders legend membership without changing any entry label', () => {
        const service = legendHarness()
        const membershipChanged = vi.fn()
        const labelChanged = vi.fn()
        service.subscribeLegendMembership(membershipChanged)
        service.subscribeLegendEntryField('connection:connection', 'label', labelChanged)

        expect(service.moveLegendEntry('connection:connection', 0)).toBe(true)
        expect(service.getLegendEntryKeysSnapshot()).toEqual(['connection:connection', 'node:focal', 'node:store'])
        expect(service.getLegendEntryFieldSnapshot('connection:connection', 'label')).toBe('Calls')
        expect(membershipChanged).toHaveBeenCalledOnce()
        expect(labelChanged).not.toHaveBeenCalled()
        expect(service.moveLegendEntry('connection:connection', 0)).toBe(false)
        expect(() => service.moveLegendEntry('node:external', 0)).toThrow('legend entry node:external does not exist')
    })

    it('records legend label, membership, and order edits in the semantic change set', () => {
        const service = legendHarness()

        service.setLegendEntryLabel('node:focal', 'Order service')
        expect(service.getChangeIdsSnapshot()).toEqual(['diagram:legendEntry:node%3Afocal:label'])
        expect(service.getChange('diagram:legendEntry:node%3Afocal:label')).toMatchObject({
            category: 'field',
            field: 'label',
            objectId: 'node:focal',
            objectKind: 'legendEntry',
            originalValue: 'Service',
            value: 'Order service',
        })
        expect(service.getDirtySnapshot()).toBe(true)

        service.setLegendEntryLabel('node:focal', 'Service')
        expect(service.getChangeIdsSnapshot()).toEqual([])
        expect(service.getDirtySnapshot()).toBe(false)

        service.addLegendEntry({ role: 'external' })
        expect(service.getChangeIdsSnapshot()).toEqual(['diagram:legendEntry:membership:node%3Aexternal'])
        expect(service.getChange('diagram:legendEntry:membership:node%3Aexternal')).toMatchObject({
            category: 'membership',
            field: 'legend',
            objectId: 'node:external',
            objectKind: 'legendEntry',
            originalValue: false,
            ownerId: 'diagram',
            value: true,
        })

        service.removeLegendEntry('node:external')
        expect(service.getChangeIdsSnapshot()).toEqual([])

        service.moveLegendEntry('connection:connection', 0)
        expect(service.getChangeIdsSnapshot()).toEqual([
            'diagram:legendEntry:node%3Afocal:order',
            'diagram:legendEntry:node%3Astore:order',
            'diagram:legendEntry:connection%3Aconnection:order',
        ])
        expect(service.getChange('diagram:legendEntry:connection%3Aconnection:order')).toMatchObject({
            category: 'field',
            field: 'order',
            originalValue: 2,
            value: 0,
        })
    })

    it('treats removing one entry as membership only, not as reordering the rest', () => {
        const service = legendHarness()

        service.removeLegendEntry('node:focal')

        expect(service.getChangeIdsSnapshot()).toEqual(['diagram:legendEntry:membership:node%3Afocal'])
    })

    it('discards legend state and its changes when the session ends', () => {
        const service = legendHarness()
        service.setLegendEntryLabel('node:focal', 'Order service')

        service.discard()

        expect(service.getLegendEntryKeysSnapshot()).toEqual([])
        expect(service.getChangeIdsSnapshot()).toEqual([])
        expect(() => service.addLegendEntry({ role: 'focal' })).toThrow('session is not active')
    })

    it('fails fast when a legend entry is addressed without an active session or entry', () => {
        const { service } = createHarness()

        expect(() => service.setLegendEntryLabel('node:focal', 'Service')).toThrow('session is not active')
        service.start()
        expect(() => service.setLegendEntryLabel('node:focal', 'Service')).toThrow('legend entry node:focal does not exist')
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
