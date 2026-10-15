import { describe, expect, it, vi } from 'vitest'
import { parseDiagramData, serializeDiagramData, type DiagramData } from './diagram_data'
import type { DiagramRecord } from './diagram_index'
import { DiagramEditSessionService } from './diagram_edit_session_service'
import type { DiagramViewSourceSnapshot } from './diagram_view_service'
import { DEFAULT_DIAGRAM_ZOOM, MAXIMUM_DIAGRAM_ZOOM, MINIMUM_DIAGRAM_ZOOM } from './diagram_zoom'

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
const mindmapDiagram: DiagramData = {
    edges: [{ from: 'root', id: 'root-topic', kind: 'connection', to: 'topic' }],
    groups: [],
    meta: { description: 'Ideas', title: 'Ideas', type: 'mindmap', version: 1 },
    nodes: [
        { height: 128, id: 'root', kind: 'root', label: 'Root', role: 'focal', width: 128 },
        { height: 96, id: 'topic', kind: 'topic', label: 'Topic', role: 'backend', width: 96 },
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
    it('enforces mindmap root creation, deletion, and paired dimensions', () => {
        const reportValidationError = vi.fn()
        const { service } = createHarness({ reportValidationError, source: mindmapDiagram })
        service.start()

        expect(service.createNode({ height: 128, kind: 'root', label: 'Second', role: 'focal', width: 128 })).toBeNull()
        expect(service.removeObjects([{ objectId: 'root', objectKind: 'node' }])).toBe(false)
        expect(service.removeObjects([{ objectId: 'root', objectKind: 'node' }])).toBe(false)
        expect(service.objects.setNodeField('topic', 'width', undefined)).toBe(false)
        expect(service.objects.setNodeSize('topic', 120, 120)).toBe(true)
        expect(service.read.getNodeSnapshot('topic')).toMatchObject({ height: 120, width: 120 })
        expect(service.removeObjects([{ objectId: 'topic', objectKind: 'node' }])).toBe(true)
        expect(service.removeObjects([{ objectId: 'root', objectKind: 'node' }])).toBe(true)
        expect(service.read.getNodeIdsSnapshot()).toEqual([])
        expect(reportValidationError).toHaveBeenCalledWith(expect.stringContaining('cannot remove mindmap root while topics remain'))
    })

    it('allows Root first and Topic only after Root in an empty mindmap', () => {
        const ids = ['created-root', 'created-topic']
        const emptyMindmap: DiagramData = { ...mindmapDiagram, edges: [], nodes: [] }
        const { service } = createHarness({ createId: () => ids.shift() ?? 'unused', source: emptyMindmap })
        service.start()

        expect(service.createNode({ height: 96, kind: 'topic', label: 'Early', role: 'backend', width: 96 })).toBeNull()
        expect(service.createNode({ height: 128, kind: 'root', label: 'Root', role: 'focal', width: 128 })).toBe('created-root')
        expect(service.createNode({ height: 96, kind: 'topic', label: 'Topic', role: 'backend', width: 96 })).toBe('created-topic')
    })

    it('tracks New formatting independently as scoped semantic changes', () => {
        const { service, sourceService } = createHarness()
        service.start()
        const sourceBefore = structuredClone(sourceService.getSourceSnapshot()?.diagram)
        const focalChanged = vi.fn()
        const storeChanged = vi.fn()
        const connectionChanged = vi.fn()
        const fontScaleChanged = vi.fn()
        service.read.subscribeNodeRoleFormatting('focal', focalChanged)
        service.read.subscribeNodeRoleFormatting('store', storeChanged)
        service.read.subscribeConnectionKindFormatting('connection', connectionChanged)
        service.read.subscribeFormattingScale('fontScalePercent', fontScaleChanged)

        service.formatting.setNodeRoleFormatting('focal', { box: { autoWrap: false, contentInset: 0 }, font: { bold: true, color: '#112233' } })
        service.formatting.setConnectionKindFormatting('connection', { endMarker: 'open-arrow', line: { thickness: 3 } })
        service.formatting.setFormattingScale('fontScalePercent', 110)

        expect(service.read.getNodeRoleFormattingSnapshot('focal')).toEqual({ box: { autoWrap: false, contentInset: 0 }, font: { bold: true, color: '#112233' } })
        expect(service.read.getNodeRoleFormattingSnapshot('store')).toBeUndefined()
        expect(service.read.getConnectionKindFormattingSnapshot('connection')).toEqual({ endMarker: 'open-arrow', line: { thickness: 3 } })
        expect(service.read.getFormattingScaleSnapshot('fontScalePercent')).toBe(110)
        expect(service.read.getDirtySnapshot()).toBe(true)
        expect(service.read.getChangeIdsSnapshot()).toEqual([
            'diagram:formatting:nodeRole:focal',
            'diagram:formatting:connectionKind:connection',
            'diagram:formatting:scale:fontScalePercent',
        ])
        expect(focalChanged).toHaveBeenCalledOnce()
        expect(storeChanged).not.toHaveBeenCalled()
        expect(connectionChanged).toHaveBeenCalledOnce()
        expect(fontScaleChanged).toHaveBeenCalledOnce()
        expect(sourceService.getSourceSnapshot()?.diagram).toEqual(sourceBefore)
    })

    it('clears a formatting change when value returns to baseline', () => {
        const { service } = createHarness({ source: { ...diagram, formatting: { boxScalePercent: 120 } } })
        service.start()

        service.formatting.setFormattingScale('boxScalePercent', 130)
        service.formatting.setFormattingScale('boxScalePercent', 120)

        expect(service.read.getDirtySnapshot()).toBe(false)
        expect(service.read.getChangeIdsSnapshot()).toEqual([])
    })

    it('sets viewport scale directly without changing editable model state', () => {
        const { service } = createHarness()
        const viewportScaleChanged = vi.fn()
        const dirtyChanged = vi.fn()
        const changeIdsChanged = vi.fn()
        const sessionChanged = vi.fn()
        service.read.subscribeViewportScale(viewportScaleChanged)
        service.read.subscribeDirty(dirtyChanged)
        service.read.subscribeChangeIds(changeIdsChanged)
        service.read.subscribeSession(sessionChanged)
        service.start()
        sessionChanged.mockClear()
        const editableDiagram = service.read.getEditableDiagram()
        const changeIds = service.read.getChangeIdsSnapshot()

        expect(service.setViewportScale(MAXIMUM_DIAGRAM_ZOOM)).toBe(true)
        expect(service.read.getViewportScaleSnapshot()).toBe(MAXIMUM_DIAGRAM_ZOOM)
        expect(service.read.getEditableDiagram()).toBe(editableDiagram)
        expect(service.read.getChangeIdsSnapshot()).toBe(changeIds)
        expect(service.read.getDirtySnapshot()).toBe(false)
        expect(viewportScaleChanged).toHaveBeenCalledOnce()
        expect(dirtyChanged).not.toHaveBeenCalled()
        expect(changeIdsChanged).not.toHaveBeenCalled()
        expect(sessionChanged).not.toHaveBeenCalled()

        expect(service.setViewportScale(MAXIMUM_DIAGRAM_ZOOM)).toBe(false)
        expect(viewportScaleChanged).toHaveBeenCalledOnce()
    })

    it('accepts the minimum viewport scale', () => {
        const { service } = createHarness()
        const viewportScaleChanged = vi.fn()
        service.read.subscribeViewportScale(viewportScaleChanged)
        service.start()

        service.setViewportScale(MINIMUM_DIAGRAM_ZOOM)
        expect(service.read.getViewportScaleSnapshot()).toBe(MINIMUM_DIAGRAM_ZOOM)
        expect(viewportScaleChanged).toHaveBeenCalledOnce()
    })

    it('resets viewport scale on fresh session and discard', () => {
        const { service } = createHarness()
        const viewportScaleChanged = vi.fn()
        service.read.subscribeViewportScale(viewportScaleChanged)
        service.start()
        service.setViewportScale(MAXIMUM_DIAGRAM_ZOOM)

        service.start()
        expect(service.read.getViewportScaleSnapshot()).toBe(DEFAULT_DIAGRAM_ZOOM)
        expect(viewportScaleChanged).toHaveBeenCalledTimes(2)

        service.setViewportScale(MINIMUM_DIAGRAM_ZOOM)
        service.discard()
        expect(service.read.getViewportScaleSnapshot()).toBe(DEFAULT_DIAGRAM_ZOOM)
        expect(viewportScaleChanged).toHaveBeenCalledTimes(4)
    })

    it('rejects zoom without an active edit session', () => {
        const { service } = createHarness()

        expect(() => service.setViewportScale(MAXIMUM_DIAGRAM_ZOOM)).toThrow('Cannot zoom diagram without an active edit session')
    })

    it('publishes active tool and transient gesture independently', () => {
        const { service } = createHarness()
        const toolChanged = vi.fn()
        const gestureChanged = vi.fn()
        const creationToolChanged = vi.fn()
        const sessionChanged = vi.fn()
        service.read.subscribeActiveTool(toolChanged)
        service.read.subscribeTransientGesture(gestureChanged)
        service.read.subscribeLastSelectedCreationTool(creationToolChanged)
        service.read.subscribeSession(sessionChanged)
        service.start()
        sessionChanged.mockClear()

        service.setActiveTool('node:component')
        expect(service.read.getActiveToolSnapshot()).toBe('node:component')
        expect(service.read.getTransientGestureSnapshot()).toBeNull()
        expect(toolChanged).toHaveBeenCalledOnce()
        expect(gestureChanged).not.toHaveBeenCalled()

        service.beginTransientGesture('placement')
        expect(service.read.getTransientGestureSnapshot()).toBe('placement')
        expect(gestureChanged).toHaveBeenCalledOnce()
        expect(toolChanged).toHaveBeenCalledOnce()
        expect(creationToolChanged).toHaveBeenCalledOnce()
        expect(sessionChanged).not.toHaveBeenCalled()
    })

    it('keeps exactly one persistent tool and cancels an old tool gesture on replacement', () => {
        const { service } = createHarness()
        const toolChanged = vi.fn()
        const gestureChanged = vi.fn()
        service.read.subscribeActiveTool(toolChanged)
        service.read.subscribeTransientGesture(gestureChanged)
        service.start()
        service.setActiveTool('node:component')
        service.beginTransientGesture('placement')

        service.setActiveTool('edge:connection')

        expect(service.read.getActiveToolSnapshot()).toBe('edge:connection')
        expect(service.read.getTransientGestureSnapshot()).toBeNull()
        expect(toolChanged).toHaveBeenCalledTimes(2)
        expect(gestureChanged).toHaveBeenCalledTimes(2)
        service.setActiveTool('edge:connection')
        expect(toolChanged).toHaveBeenCalledTimes(2)
    })

    it('cancels an active gesture while keeping its tool selected', () => {
        const { service } = createHarness()
        service.start()
        service.setActiveTool('edge:connection')
        service.beginTransientGesture('edge')

        expect(service.cancelActiveInteraction()).toBe(true)
        expect(service.read.getActiveToolSnapshot()).toBe('edge:connection')
        expect(service.read.getTransientGestureSnapshot()).toBeNull()
        expect(service.cancelActiveInteraction()).toBe(false)
    })

    it('cancels a pan gesture while keeping Pan selected', () => {
        const { service } = createHarness()
        const toolChanged = vi.fn()
        const gestureChanged = vi.fn()
        service.read.subscribeActiveTool(toolChanged)
        service.read.subscribeTransientGesture(gestureChanged)
        service.start()

        service.setActiveTool('pan')
        service.beginTransientGesture('pan')

        expect(service.read.getActiveToolSnapshot()).toBe('pan')
        expect(service.read.getTransientGestureSnapshot()).toBe('pan')
        expect(toolChanged).toHaveBeenCalledOnce()
        expect(gestureChanged).toHaveBeenCalledOnce()

        expect(service.cancelActiveInteraction()).toBe(true)
        expect(service.read.getActiveToolSnapshot()).toBe('pan')
        expect(service.read.getTransientGestureSnapshot()).toBeNull()
        expect(toolChanged).toHaveBeenCalledOnce()
        expect(gestureChanged).toHaveBeenCalledTimes(2)
    })

    it('completes a pan gesture without leaving the pan tool', () => {
        const { service } = createHarness()
        service.start()
        service.setActiveTool('pan')
        service.beginTransientGesture('pan')

        service.completeTransientGesture()

        expect(service.read.getActiveToolSnapshot()).toBe('pan')
        expect(service.read.getTransientGestureSnapshot()).toBeNull()
    })

    it('resets active interaction on fresh session, discard, source change, and project change', () => {
        const { service, sourceService } = createHarness()
        service.start()
        service.setActiveTool('node:component')
        service.beginTransientGesture('placement')
        service.start()
        expect(service.read.getActiveToolSnapshot()).toBe('select')
        expect(service.read.getTransientGestureSnapshot()).toBeNull()

        service.setActiveTool('group')
        service.beginTransientGesture('placement')
        service.discard()
        expect(service.read.getActiveToolSnapshot()).toBe('select')
        expect(service.read.getTransientGestureSnapshot()).toBeNull()

        service.start()
        service.setActiveTool('edge:connection')
        service.beginTransientGesture('edge')
        const nextRecord = { ...firstRecord, id: 'diagram-2', path: 'design/diagrams/detail.json' }
        sourceService.setSource({ diagram: structuredClone(diagram), record: nextRecord })
        expect(service.read.getActiveToolSnapshot()).toBe('select')
        expect(service.read.getTransientGestureSnapshot()).toBeNull()

        service.start()
        service.setActiveTool('node:component')
        service.beginTransientGesture('placement')
        service.bindProject({ ...project, branch: 'feature' })
        expect(service.read.getActiveToolSnapshot()).toBe('select')
        expect(service.read.getTransientGestureSnapshot()).toBeNull()
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

    it('publishes last selected creation tool independently and resets it with the session', () => {
        const { service } = createHarness()
        const creationToolChanged = vi.fn()
        const sessionChanged = vi.fn()
        service.read.subscribeLastSelectedCreationTool(creationToolChanged)
        service.read.subscribeSession(sessionChanged)
        service.start()
        const session = service.read.getSessionSnapshot()
        const editable = service.read.getEditableDiagram()

        service.setActiveTool('node:component')
        service.setActiveTool('select')
        service.setActiveTool('pan')

        expect(service.read.getLastSelectedCreationToolSnapshot()).toBe('node:component')
        expect(creationToolChanged).toHaveBeenCalledOnce()
        expect(sessionChanged).toHaveBeenCalledOnce()
        expect(service.read.getSessionSnapshot()).toBe(session)
        expect(service.read.getEditableDiagram()).toBe(editable)

        service.setLastSelectedCreationTool('fragment')
        expect(service.read.getLastSelectedCreationToolSnapshot()).toBe('fragment')
        expect(creationToolChanged).toHaveBeenCalledTimes(2)

        service.discard()

        expect(service.read.getLastSelectedCreationToolSnapshot()).toBeNull()
        expect(creationToolChanged).toHaveBeenCalledTimes(3)
        expect(sessionChanged).toHaveBeenCalledTimes(2)
    })

    it('rejects creation-tool memory changes without an active edit session', () => {
        const { service } = createHarness()

        expect(() => service.setLastSelectedCreationTool('fragment')).toThrow(
            'Cannot select a diagram creation tool without an active edit session',
        )
    })

    it('starts with immutable source references and one deep editable copy', () => {
        const { service } = createHarness()

        service.start()
        const original = service.read.getOriginalDiagramSnapshot()
        const editable = service.read.getEditableDiagram()

        expect(original).toEqual({ diagram, record: firstRecord })
        expect(original?.diagram).toBe(diagram)
        expect(original?.record).toBe(firstRecord)
        expect(editable).toEqual(diagram)
        expect(editable).not.toBe(diagram)
        expect(editable?.nodes).not.toBe(diagram.nodes)

        service.objects.setNodeField('orders', 'label', 'Edited orders')
        expect(diagram.nodes[0].label).toBe('Orders')
        expect(original?.diagram.nodes[0].label).toBe('Orders')
        expect(service.read.getDirtySnapshot()).toBe(true)
    })

    it('exposes stable snapshots and notifies only changed values', () => {
        const { service } = createHarness()
        const dirtyListener = vi.fn()
        const originalListener = vi.fn()
        const sessionListener = vi.fn()
        service.read.subscribeDirty(dirtyListener)
        service.read.subscribeOriginalDiagram(originalListener)
        service.read.subscribeSession(sessionListener)

        service.start()
        const editable = service.read.getEditableDiagram()
        const original = service.read.getOriginalDiagramSnapshot()
        const session = service.read.getSessionSnapshot()
        expect(service.read.getEditableDiagram()).toBe(editable)
        expect(service.read.getOriginalDiagramSnapshot()).toBe(original)
        expect(service.read.getSessionSnapshot()).toBe(session)
        expect(dirtyListener).not.toHaveBeenCalled()
        expect(originalListener).toHaveBeenCalledOnce()
        expect(sessionListener).toHaveBeenCalledOnce()

        service.discard()
        service.discard()
        expect(dirtyListener).not.toHaveBeenCalled()
        expect(originalListener).toHaveBeenCalledTimes(2)
        expect(sessionListener).toHaveBeenCalledTimes(2)
    })

    it('keeps the read adapter and scoped subscriptions across session replacement', () => {
        const { service } = createHarness()
        const reader = service.read
        const labelChanged = vi.fn()
        const unsubscribe = reader.subscribeNodeField('orders', 'label', labelChanged)

        service.start()
        service.objects.setNodeField('orders', 'label', 'First edit')
        service.discard()
        service.start()

        expect(service.read).toBe(reader)
        expect(reader.getNodeFieldSnapshot('orders', 'label')).toBe('Orders')
        service.objects.setNodeField('orders', 'label', 'Second edit')
        expect(labelChanged).toHaveBeenCalledTimes(2)

        unsubscribe()
        service.objects.setNodeField('orders', 'label', 'Third edit')
        expect(labelChanged).toHaveBeenCalledTimes(2)
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
        const session = service.read.getSessionSnapshot()

        sourceService.setSource({ diagram: structuredClone(diagram), record: { ...firstRecord } })
        expect(service.read.getSessionSnapshot()).toBe(session)

        const nextRecord = { ...firstRecord, id: 'diagram-2', path: 'design/diagrams/detail.json' }
        sourceService.setSource({ diagram: structuredClone(diagram), record: nextRecord })
        expect(service.read.getSessionSnapshot()).toBeNull()
        expect(service.read.getOriginalDiagramSnapshot()).toBeNull()
        expect(service.read.getEditableDiagram()).toBeNull()
    })

    it('keeps creation status only for the created source and clears it on later edits', () => {
        const { service, sourceService } = createHarness()
        expect(() => service.startCreation('')).toThrow('without a source diagram ID')
        expect(() => service.startCreation('other-diagram')).toThrow('different diagram source')
        expect(service.read.getSessionSnapshot()).toBeNull()

        service.startCreation(firstRecord.id)
        expect(service.read.getSessionSnapshot()).toEqual({
            creationSourceDiagramId: firstRecord.id,
            sourceDiagramId: firstRecord.id,
        })

        sourceService.setSource({ diagram: structuredClone(diagram), record: { ...firstRecord } })
        expect(service.read.getSessionSnapshot()?.creationSourceDiagramId).toBe(firstRecord.id)

        service.discard()
        expect(service.read.getSessionSnapshot()).toBeNull()
        service.start()
        expect(service.read.getSessionSnapshot()).toEqual({ sourceDiagramId: firstRecord.id })

        service.startCreation(firstRecord.id)
        sourceService.setSource({ diagram: structuredClone(diagram), record: { ...firstRecord, id: 'next' } })
        expect(service.read.getSessionSnapshot()).toBeNull()
        service.start()
        expect(service.read.getSessionSnapshot()).toEqual({ sourceDiagramId: 'next' })
    })

    it('preselects Root for a new empty mindmap and leaves other sessions unchanged', () => {
        const { service, sourceService } = createHarness()
        const emptyMindmap = { ...mindmapDiagram, edges: [], nodes: [] }
        sourceService.setSource({ diagram: emptyMindmap, record: firstRecord })

        service.startCreation(firstRecord.id)
        expect(service.read.getLastSelectedCreationToolSnapshot()).toBe('node:root')
        expect(service.read.getActiveToolSnapshot()).toBe('select')

        service.start()
        expect(service.read.getLastSelectedCreationToolSnapshot()).toBeNull()
    })

    it('restores saved creation content and copy target as a clean session', () => {
        const { service } = createHarness()
        const savedDiagram = structuredClone(diagram)
        savedDiagram.nodes[0].label = 'Saved label'
        const savedRecord = { ...firstRecord, id: 'copy-1', sourceDiagramId: firstRecord.id }

        service.restoreCreation(firstRecord.id, savedDiagram, savedRecord)

        expect(service.read.getSessionSnapshot()?.creationSourceDiagramId).toBe(firstRecord.id)
        expect(service.read.getEditableDiagram()?.nodes[0].label).toBe('Saved label')
        expect(service.read.getOriginalDiagramSnapshot()?.record).toBe(firstRecord)
        expect(service.read.getSavedRecordSnapshot()).toBe(savedRecord)
        expect(service.read.getDirtySnapshot()).toBe(false)
        expect(() => service.restoreCreation(firstRecord.id, savedDiagram, null)).toThrow('restored together')
    })

    it('starts every session fresh and resets only when project identity changes', () => {
        const { service } = createHarness()
        service.start()
        const firstSession = service.read.getSessionSnapshot()
        service.objects.setNodeField('orders', 'label', 'Draft label')

        service.start()
        expect(service.read.getSessionSnapshot()).not.toBe(firstSession)
        expect(service.read.getEditableDiagram()?.nodes[0].label).toBe('Orders')

        const secondSession = service.read.getSessionSnapshot()
        service.bindProject({ ...project })
        expect(service.read.getSessionSnapshot()).toBe(secondSession)

        service.bindProject({ ...project, branch: 'feature' })
        expect(service.read.getSessionSnapshot()).toBeNull()
    })

    it('unsubscribes from source navigation when cleared', () => {
        const { service, sourceService } = createHarness()
        service.start()
        service.clear()

        sourceService.setSource(null)
        expect(service.read.getSessionSnapshot()).toBeNull()
        expect(() => service.start()).toThrow('not bound to a project')
    })

    it('assigns one node field and emits only its scoped field event plus dirty transition', () => {
        const { service } = createHarness()
        service.start()
        const editable = service.read.getEditableDiagram()
        const nodes = editable?.nodes
        const edges = editable?.edges
        const groups = editable?.groups
        const orders = service.read.getNodeSnapshot('orders')
        const store = service.read.getNodeSnapshot('store')
        const nodeIds = service.read.getNodeIdsSnapshot()
        const nodeLabelChanged = vi.fn()
        const storeLabelChanged = vi.fn()
        const nodeMembershipChanged = vi.fn()
        const edgeChanged = vi.fn()
        const groupChanged = vi.fn()
        const sessionChanged = vi.fn()
        const dirtyChanged = vi.fn()
        service.read.subscribeNodeField('orders', 'label', nodeLabelChanged)
        service.read.subscribeNodeField('store', 'label', storeLabelChanged)
        service.read.subscribeCollectionMembership('node', nodeMembershipChanged)
        service.read.subscribeEdgeField('orders-store', 'kind', edgeChanged)
        service.read.subscribeGroupField('backend', 'label', groupChanged)
        service.read.subscribeSession(sessionChanged)
        service.read.subscribeDirty(dirtyChanged)

        service.objects.setNodeField('orders', 'label', 'Order API')

        expect(service.read.getEditableDiagram()).toBe(editable)
        expect(service.read.getEditableDiagram()?.nodes).toBe(nodes)
        expect(service.read.getEditableDiagram()?.edges).toBe(edges)
        expect(service.read.getEditableDiagram()?.groups).toBe(groups)
        expect(service.read.getNodeSnapshot('orders')).toBe(orders)
        expect(service.read.getNodeSnapshot('store')).toBe(store)
        expect(service.read.getNodeIdsSnapshot()).toBe(nodeIds)
        expect(service.read.getNodeFieldSnapshot('orders', 'label')).toBe('Order API')
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
        const editable = service.read.getEditableDiagram()
        const nodes = editable?.nodes
        const edges = editable?.edges
        const groups = editable?.groups
        const metadata = editable?.meta
        const titleChanged = vi.fn()
        const descriptionChanged = vi.fn()
        const nodeChanged = vi.fn()
        const nodeMembershipChanged = vi.fn()
        const sessionChanged = vi.fn()
        service.read.subscribeMetadataField('title', titleChanged)
        service.read.subscribeMetadataField('description', descriptionChanged)
        service.read.subscribeNodeField('orders', 'label', nodeChanged)
        service.read.subscribeCollectionMembership('node', nodeMembershipChanged)
        service.read.subscribeSession(sessionChanged)

        expect(service.objects.setMetadataField('title', '  System overview  ')).toBe(true)

        expect(service.read.getEditableDiagram()).toBe(editable)
        expect(service.read.getEditableDiagram()?.nodes).toBe(nodes)
        expect(service.read.getEditableDiagram()?.edges).toBe(edges)
        expect(service.read.getEditableDiagram()?.groups).toBe(groups)
        expect(service.read.getEditableDiagram()?.meta).toBe(metadata)
        expect(service.read.getMetadataFieldSnapshot('title')).toBe('System overview')
        expect(service.read.getMetadataFieldSnapshot('description')).toBe('Orders architecture')
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

        const [titleChangeId] = service.read.getChangeIdsSnapshot()
        expect(service.read.getChange(titleChangeId)).toMatchObject({
            category: 'field',
            field: 'title',
            objectId: 'diagram',
            objectKind: 'meta',
            originalValue: 'Overview',
            value: 'System overview',
        })

        expect(service.objects.setMetadataField('description', '  Updated architecture  ')).toBe(true)
        expect(service.read.getMetadataFieldSnapshot('description')).toBe('Updated architecture')
        expect(titleChanged).toHaveBeenCalledOnce()
        expect(descriptionChanged).toHaveBeenCalledOnce()
        const descriptionChangeId = service.read.getChangeIdsSnapshot().find((changeId) => (
            service.read.getChangeFieldSnapshot(changeId, 'field') === 'description'
        ))
        if (!descriptionChangeId) throw new Error('Expected description semantic change')
        expect(service.read.getChangeFieldSnapshot(descriptionChangeId, 'value')).toBe('Updated architecture')
    })

    it('rejects blank metadata and treats surrounding whitespace on the current value as unchanged', () => {
        const reportValidationError = vi.fn()
        const { service } = createHarness({ reportValidationError })
        service.start()
        const titleChanged = vi.fn()
        const descriptionChanged = vi.fn()
        service.read.subscribeMetadataField('title', titleChanged)
        service.read.subscribeMetadataField('description', descriptionChanged)

        expect(service.objects.setMetadataField('title', '  Overview  ')).toBe(false)
        expect(service.objects.setMetadataField('description', ' \n ')).toBe(false)

        expect(service.read.getMetadataFieldSnapshot('title')).toBe('Overview')
        expect(service.read.getMetadataFieldSnapshot('description')).toBe('Orders architecture')
        expect(service.read.getChangeIdsSnapshot()).toEqual([])
        expect(service.read.getDirtySnapshot()).toBe(false)
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
        service.read.subscribeDirty(dirtyChanged)

        service.objects.setNodeField('orders', 'label', 'Order API')
        service.objects.setMetadataField('title', 'System')
        service.objects.setNodeField('orders', 'label', 'Orders')
        expect(service.read.getDirtySnapshot()).toBe(true)

        service.objects.setMetadataField('title', 'Overview')
        expect(service.read.getDirtySnapshot()).toBe(false)
        expect(dirtyChanged).toHaveBeenCalledTimes(2)
    })

    it('exposes stable IDs and granular accessors for architecture objects', () => {
        const { service } = createHarness()
        service.start()

        expect(service.read.getNodeIdsSnapshot()).toEqual(['orders', 'store'])
        expect(service.read.getEdgeIdsSnapshot()).toEqual(['orders-store'])
        expect(service.read.getGroupIdsSnapshot()).toEqual(['backend'])
        expect(service.read.getFragmentIdsSnapshot()).toEqual([])
        expect(service.read.getMetadataFieldSnapshot('description')).toBe('Orders architecture')
        expect(service.read.getEdgeFieldSnapshot('orders-store', 'kind')).toBe('connection')
        expect(service.read.getGroupFieldSnapshot('backend', 'label')).toBe('Backend')
        expect(service.read.getConnectionPointFieldSnapshot('orders-store', 'sourceAttachment', 'side')).toBe('right')

        service.objects.setEdgeField('orders-store', 'label', 'writes')
        service.objects.setGroupField('backend', 'label', 'Core')

        expect(service.read.getEdgeFieldSnapshot('orders-store', 'label')).toBe('writes')
        expect(service.read.getGroupFieldSnapshot('backend', 'label')).toBe('Core')
    })

    it('reconnects each endpoint atomically while preserving stable edge and attachment objects', () => {
        const { service } = createHarness()
        service.start()
        const edge = service.read.getEdgeSnapshot('orders-store')
        const sourceAttachment = service.read.getEdgeSnapshot('orders-store')?.sourceAttachment
        const targetAttachment = service.read.getEdgeSnapshot('orders-store')?.targetAttachment
        const fromChanged = vi.fn()
        const toChanged = vi.fn()
        const sourceNodeChanged = vi.fn()
        const targetNodeChanged = vi.fn()
        const edgeMembershipChanged = vi.fn()
        service.read.subscribeEdgeField('orders-store', 'from', fromChanged)
        service.read.subscribeEdgeField('orders-store', 'to', toChanged)
        service.read.subscribeConnectionPointField('orders-store', 'sourceAttachment', 'nodeId', sourceNodeChanged)
        service.read.subscribeConnectionPointField('orders-store', 'targetAttachment', 'nodeId', targetNodeChanged)
        service.read.subscribeCollectionMembership('edge', edgeMembershipChanged)

        expect(service.objects.reconnectEdgeEndpoint('orders-store', 'sourceAttachment', 'store')).toBe(true)
        expect(service.objects.reconnectEdgeEndpoint('orders-store', 'targetAttachment', 'orders')).toBe(true)

        expect(service.read.getEdgeSnapshot('orders-store')).toBe(edge)
        expect(service.read.getEdgeSnapshot('orders-store')?.sourceAttachment).toBe(sourceAttachment)
        expect(service.read.getEdgeSnapshot('orders-store')?.targetAttachment).toBe(targetAttachment)
        expect(service.read.getEdgeFieldSnapshot('orders-store', 'from')).toBe('store')
        expect(service.read.getEdgeFieldSnapshot('orders-store', 'to')).toBe('orders')
        expect(service.read.getConnectionPointFieldSnapshot('orders-store', 'sourceAttachment', 'nodeId')).toBe('store')
        expect(service.read.getConnectionPointFieldSnapshot('orders-store', 'targetAttachment', 'nodeId')).toBe('orders')
        expect(service.read.getConnectionPointFieldSnapshot('orders-store', 'sourceAttachment', 'offset')).toBe(0.5)
        expect(service.read.getConnectionPointFieldSnapshot('orders-store', 'targetAttachment', 'side')).toBe('left')
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
        const edge = service.read.getEdgeSnapshot('orders-store')
        const sourceAttachment = service.read.getEdgeSnapshot('orders-store')?.sourceAttachment

        expect(service.objects.reconnectEdgeEndpoint('orders-store', 'sourceAttachment', 'missing')).toBe(false)

        expect(service.read.getEdgeSnapshot('orders-store')).toBe(edge)
        expect(service.read.getEdgeSnapshot('orders-store')?.sourceAttachment).toBe(sourceAttachment)
        expect(service.read.getEdgeFieldSnapshot('orders-store', 'from')).toBe('orders')
        expect(service.read.getConnectionPointFieldSnapshot('orders-store', 'sourceAttachment', 'nodeId')).toBe('orders')
        expect(service.read.getDirtySnapshot()).toBe(false)
        expect(reportValidationError).toHaveBeenCalledWith(
            'Reconnect edge endpoint rejected: edges.orders-store.from has unknown node missing',
        )
    })

    it('exposes and changes sequence fragments and entity fields in their valid diagram types', () => {
        const sequenceService = sequenceHarness()
        const { service: entityService } = createHarness({ source: entityDiagram })
        entityService.start()

        expect(sequenceService.read.getFragmentFieldSnapshot('transaction', 'operator')).toBe('opt')
        expect(sequenceService.fragments.updateFragment('transaction', { operator: 'loop', regions: sequenceService.read.getFragmentSnapshot('transaction')?.regions.map(({ edgeIds, guard }) => ({ edgeIds: [...edgeIds], guard })) ?? [] })).toBe(true)
        expect(entityService.read.getEntityFieldValueSnapshot('order', 0, 'type')).toBe('uuid')
        expect(entityService.entityFields.setEntityField('order', 0, 'type', 'string')).toBe(true)

        expect(sequenceService.read.getFragmentFieldSnapshot('transaction', 'operator')).toBe('loop')
        expect(entityService.read.getEntityFieldValueSnapshot('order', 0, 'type')).toBe('string')
    })

    it('adds, reorders, and removes entity fields through one scoped membership event per operation', () => {
        const { service } = createHarness({ source: entityDiagram })
        service.start()
        const membershipChanged = vi.fn()
        const nodeFieldsChanged = vi.fn()
        const originalIndexes = service.read.getEntityFieldIndexesSnapshot('order')
        const originalNode = service.read.getNodeSnapshot('order')
        service.read.subscribeEntityFieldMembership('order', membershipChanged)
        service.read.subscribeNodeField('order', 'fields', nodeFieldsChanged)

        expect(service.entityFields.addEntityField('order', { key: 'foreign', name: 'customerId', type: 'uuid' })).toBe(true)
        expect(service.read.getEntityFieldIndexesSnapshot('order')).toEqual([0, 1])
        expect(service.read.getEntityFieldIndexesSnapshot('order')).not.toBe(originalIndexes)
        expect(service.read.getNodeSnapshot('order')).toBe(originalNode)
        expect(service.entityFields.moveEntityField('order', 1, 0)).toBe(true)
        expect(service.read.getEntityFieldValueSnapshot('order', 0, 'name')).toBe('customerId')
        expect(service.entityFields.removeEntityField('order', 1)).toBe(true)

        expect(service.read.getEntityFieldIndexesSnapshot('order')).toEqual([0])
        expect(service.read.getEntityFieldValueSnapshot('order', 0, 'name')).toBe('customerId')
        expect(membershipChanged).toHaveBeenCalledTimes(3)
        expect(membershipDetail(membershipChanged, 0)).toEqual({ addedIndexes: [1], nodeId: 'order', removedIndexes: [] })
        expect(membershipDetail(membershipChanged, 1)).toEqual({ addedIndexes: [0], nodeId: 'order', removedIndexes: [1] })
        expect(membershipDetail(membershipChanged, 2)).toEqual({ addedIndexes: [], nodeId: 'order', removedIndexes: [1] })
        expect(nodeFieldsChanged).not.toHaveBeenCalled()
        expect(service.read.getDirtySnapshot()).toBe(true)
    })

    it('validates entity fields before insertion and leaves membership unchanged when rejected', () => {
        const reportValidationError = vi.fn()
        const { service } = createHarness({ reportValidationError, source: entityDiagram })
        service.start()
        const fields = service.read.getNodeFieldSnapshot('order', 'fields')
        const indexes = service.read.getEntityFieldIndexesSnapshot('order')

        expect(service.entityFields.addEntityField('order', { name: '' })).toBe(false)
        expect(service.entityFields.addEntityField('order', { name: 'createdAt' }, 3)).toBe(false)

        expect(service.read.getNodeFieldSnapshot('order', 'fields')).toBe(fields)
        expect(service.read.getEntityFieldIndexesSnapshot('order')).toBe(indexes)
        expect(service.read.getDirtySnapshot()).toBe(false)
        expect(reportValidationError).toHaveBeenCalledTimes(2)
    })


    it('creates a node with a generated collision-free id and notifies only the node collection', () => {
        const createId = vi.fn().mockReturnValueOnce('orders').mockReturnValueOnce('orders-store').mockReturnValueOnce('node-1')
        const { service } = createHarness({ createId })
        service.start()
        const editable = service.read.getEditableDiagram()
        const nodes = editable?.nodes
        const orders = service.read.getNodeSnapshot('orders')
        const edgeIds = service.read.getEdgeIdsSnapshot()
        const nodeIds = service.read.getNodeIdsSnapshot()
        const nodeMembershipChanged = vi.fn()
        const edgeMembershipChanged = vi.fn()
        const ordersLabelChanged = vi.fn()
        const groupMembershipChanged = vi.fn()
        const sessionChanged = vi.fn()
        const dirtyChanged = vi.fn()
        service.read.subscribeCollectionMembership('node', nodeMembershipChanged)
        service.read.subscribeCollectionMembership('edge', edgeMembershipChanged)
        service.read.subscribeNodeField('orders', 'label', ordersLabelChanged)
        service.read.subscribeGroupMembership('backend', groupMembershipChanged)
        service.read.subscribeSession(sessionChanged)
        service.read.subscribeDirty(dirtyChanged)

        const createdId = service.createNode({ label: 'Billing', role: 'backend' })

        expect(createdId).toBe('node-1')
        expect(createId).toHaveBeenCalledTimes(3)
        expect(service.read.getEditableDiagram()).toBe(editable)
        expect(service.read.getEditableDiagram()?.nodes).toBe(nodes)
        expect(service.read.getNodeSnapshot('orders')).toBe(orders)
        expect(service.read.getNodeIdsSnapshot()).toEqual(['orders', 'store', 'node-1'])
        expect(service.read.getNodeIdsSnapshot()).not.toBe(nodeIds)
        expect(service.read.getEdgeIdsSnapshot()).toBe(edgeIds)
        expect(service.read.getNodeFieldSnapshot('node-1', 'label')).toBe('Billing')
        expect(nodeMembershipChanged).toHaveBeenCalledOnce()
        expect(membershipDetail(nodeMembershipChanged)).toEqual({
            addedIds: ['node-1'],
            memberKind: 'node',
            ownerId: null,
            regionIndex: null,
            removedIds: [],
        })
        expect(dirtyChanged).toHaveBeenCalledOnce()
        expect(service.read.getDirtySnapshot()).toBe(true)
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
        const editable = service.read.getEditableDiagram()
        const nodes = editable?.nodes
        const edges = editable?.edges
        const groups = editable?.groups
        const fragments = editable?.fragments
        const existingNode = service.read.getNodeSnapshot('user')
        const existingEdge = service.read.getEdgeSnapshot('user-orders')
        const nodeMembershipChanged = vi.fn()
        const edgeMembershipChanged = vi.fn()
        const groupMembershipChanged = vi.fn()
        const fragmentMembershipChanged = vi.fn()
        const existingNodeChanged = vi.fn()
        const existingGroupMembershipChanged = vi.fn()
        const existingFragmentMembershipChanged = vi.fn()
        service.read.subscribeCollectionMembership('node', nodeMembershipChanged)
        service.read.subscribeCollectionMembership('edge', edgeMembershipChanged)
        service.read.subscribeCollectionMembership('group', groupMembershipChanged)
        service.read.subscribeCollectionMembership('fragment', fragmentMembershipChanged)
        service.read.subscribeNodeField('user', 'label', existingNodeChanged)
        service.read.subscribeGroupMembership('backend', existingGroupMembershipChanged)
        service.read.subscribeFragmentRegionMembership('transaction', 0, existingFragmentMembershipChanged)

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
        expect(service.read.getEditableDiagram()).toBe(editable)
        expect(service.read.getEditableDiagram()?.nodes).toBe(nodes)
        expect(service.read.getEditableDiagram()?.edges).toBe(edges)
        expect(service.read.getEditableDiagram()?.groups).toBe(groups)
        expect(service.read.getEditableDiagram()?.fragments).toBe(fragments)
        expect(service.read.getNodeSnapshot('user')).toBe(existingNode)
        expect(service.read.getEdgeSnapshot('user-orders')).toBe(existingEdge)
        expect(service.read.getNodeSnapshot('pasted-user')).toMatchObject({ x: 12, y: 16 })
        expect(service.read.getEdgeSnapshot('pasted-call')).toMatchObject({
            from: 'pasted-user',
            sourceAttachment: { nodeId: 'pasted-user' },
            targetAttachment: { nodeId: 'pasted-orders' },
            to: 'pasted-orders',
            waypoints: [{ x: 24, y: 16 }, { x: 44, y: 16 }],
        })
        expect(service.read.getGroupSnapshot('pasted-group')).toMatchObject({ nodeIds: ['pasted-user', 'pasted-orders'], x: 8, y: 12 })
        expect(service.read.getFragmentSnapshot('pasted-fragment')).toMatchObject({regions: [{ edgeIds: ['pasted-call'], guard: 'requested' }]})
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
        expect(service.read.getChangeIdsSnapshot()).toHaveLength(5)
    })

    it('rejects pasted object kinds unsupported by target type before mutation', () => {
        const reportValidationError = vi.fn()
        const { service } = createHarness({ reportValidationError })
        service.start()
        const editable = service.read.getEditableDiagram()
        const nodeIds = service.read.getNodeIdsSnapshot()
        const changeIds = service.read.getChangeIdsSnapshot()
        const nodeMembershipChanged = vi.fn()
        service.read.subscribeCollectionMembership('node', nodeMembershipChanged)

        const result = service.pasteFragment({
            edges: [],
            fragments: [],
            groups: [],
            nodes: [{ id: 'participant', kind: 'participant', label: 'Participant', role: 'external', x: 4, y: 4 }],
        }, 4)

        expect(result).toBeNull()
        expect(service.read.getEditableDiagram()).toBe(editable)
        expect(service.read.getNodeIdsSnapshot()).toBe(nodeIds)
        expect(service.read.getChangeIdsSnapshot()).toBe(changeIds)
        expect(service.read.getDirtySnapshot()).toBe(false)
        expect(nodeMembershipChanged).not.toHaveBeenCalled()
        expect(reportValidationError).toHaveBeenCalledWith(expect.stringContaining('Paste diagram fragment rejected'))
    })

    it('removes a node with its incident edges and group membership in one transaction', () => {
        const { service } = createHarness()
        service.start()
        const editable = service.read.getEditableDiagram()
        const nodes = editable?.nodes
        const edges = editable?.edges
        const groups = editable?.groups
        const store = service.read.getNodeSnapshot('store')
        const backend = service.read.getGroupSnapshot('backend')
        const nodeMembershipChanged = vi.fn()
        const edgeMembershipChanged = vi.fn()
        const groupMembershipChanged = vi.fn()
        const groupLabelChanged = vi.fn()
        const storeLabelChanged = vi.fn()
        service.read.subscribeCollectionMembership('node', nodeMembershipChanged)
        service.read.subscribeCollectionMembership('edge', edgeMembershipChanged)
        service.read.subscribeGroupMembership('backend', groupMembershipChanged)
        service.read.subscribeGroupField('backend', 'label', groupLabelChanged)
        service.read.subscribeNodeField('store', 'label', storeLabelChanged)

        expect(service.removeObjects([{ objectId: 'orders', objectKind: 'node' }])).toBe(true)

        expect(service.read.getEditableDiagram()).toBe(editable)
        expect(service.read.getEditableDiagram()?.nodes).toBe(nodes)
        expect(service.read.getEditableDiagram()?.edges).toBe(edges)
        expect(service.read.getEditableDiagram()?.groups).toBe(groups)
        expect(service.read.getNodeSnapshot('store')).toBe(store)
        expect(service.read.getGroupSnapshot('backend')).toBe(backend)
        expect(service.read.getNodeIdsSnapshot()).toEqual(['store'])
        expect(service.read.getEdgeIdsSnapshot()).toEqual([])
        expect(service.read.getGroupNodeIdsSnapshot('backend')).toEqual(['store'])
        expect(service.read.getNodeSnapshot('orders')).toBeNull()
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
        expect(service.removeObjects([{ objectId: 'orders', objectKind: 'node' }])).toBe(false)
    })

    it('deletes one selection, preserves emptied hosts, and reports the invalid fragment region after publication', () => {
        const source = structuredClone(sequenceDiagram)
        source.groups.push({ id: 'actors', label: 'Actors', nodeIds: ['user'] })
        const sourceBeforeDelete = structuredClone(source)
        const reportValidationError = vi.fn()
        const { service } = createHarness({ reportValidationError, source })
        service.start()
        const editable = service.read.getEditableDiagram()
        const nodes = editable?.nodes
        const edges = editable?.edges
        const groups = editable?.groups
        const fragments = editable?.fragments
        const user = service.read.getNodeSnapshot('user')
        const transaction = service.read.getFragmentSnapshot('transaction')
        const actors = service.read.getGroupSnapshot('actors')
        const actorsNodeIds = service.read.getGroupNodeIdsSnapshot('actors')
        const nodeMembershipChanged = vi.fn()
        const edgeMembershipChanged = vi.fn()
        const groupMembershipChanged = vi.fn()
        const backendMembershipChanged = vi.fn()
        const fragmentMembershipChanged = vi.fn()
        const dirtyChanged = vi.fn()
        const changeIdsChanged = vi.fn()
        service.read.subscribeCollectionMembership('node', nodeMembershipChanged)
        service.read.subscribeCollectionMembership('edge', edgeMembershipChanged)
        service.read.subscribeCollectionMembership('group', groupMembershipChanged)
        service.read.subscribeGroupMembership('backend', backendMembershipChanged)
        service.read.subscribeCollectionMembership('fragment', fragmentMembershipChanged)
        service.read.subscribeDirty(dirtyChanged)
        service.read.subscribeChangeIds(changeIdsChanged)

        expect(service.removeObjects([
            { objectId: 'orders', objectKind: 'node' },
            { objectId: 'orders-user', objectKind: 'edge' },
        ])).toBe(true)

        expect(service.read.getEditableDiagram()).toBe(editable)
        expect(service.read.getEditableDiagram()?.nodes).toBe(nodes)
        expect(service.read.getEditableDiagram()?.edges).toBe(edges)
        expect(service.read.getEditableDiagram()?.groups).toBe(groups)
        expect(service.read.getEditableDiagram()?.fragments).toBe(fragments)
        expect(service.read.getNodeSnapshot('user')).toBe(user)
        expect(service.read.getGroupSnapshot('actors')).toBe(actors)
        expect(service.read.getGroupNodeIdsSnapshot('actors')).toBe(actorsNodeIds)
        expect(service.read.getNodeIdsSnapshot()).toEqual(['user'])
        expect(service.read.getEdgeIdsSnapshot()).toEqual([])
        expect(service.read.getGroupIdsSnapshot()).toEqual(['backend', 'actors'])
        expect(service.read.getGroupNodeIdsSnapshot('backend')).toEqual([])
        expect(service.read.getFragmentIdsSnapshot()).toEqual(['transaction'])
        expect(service.read.getFragmentSnapshot('transaction')).toBe(transaction)
        expect((service.read.getFragmentSnapshot('transaction')?.regions[0]?.edgeIds ?? null)).toEqual([])
        expect(membershipDetail(nodeMembershipChanged).removedIds).toEqual(['orders'])
        expect(membershipDetail(edgeMembershipChanged).removedIds).toEqual(['user-orders', 'orders-user'])
        expect(nodeMembershipChanged).toHaveBeenCalledOnce()
        expect(edgeMembershipChanged).toHaveBeenCalledOnce()
        expect(groupMembershipChanged).not.toHaveBeenCalled()
        expect(backendMembershipChanged).toHaveBeenCalledOnce()
        expect(fragmentMembershipChanged).not.toHaveBeenCalled()
        expect(dirtyChanged).toHaveBeenCalledOnce()
        expect(changeIdsChanged).toHaveBeenCalledOnce()
        expect(service.read.getChangeIdsSnapshot()).toHaveLength(7)
        expect(service.read.getChangeIdsSnapshot().map((changeId) => service.read.getChange(changeId))).toEqual(
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
        expect(service.read.getOriginalDiagramSnapshot()?.diagram).toEqual(sourceBeforeDelete)
    })

    it('keeps valid hosts and republishes only references changed by batch deletion', () => {
        const service = sequenceHarness()
        const fragment = service.read.getFragmentSnapshot('transaction')
        const group = service.read.getGroupSnapshot('backend')
        const groupNodeIds = service.read.getGroupNodeIdsSnapshot('backend')
        const fragmentRegionChanged = vi.fn()
        const groupMembershipChanged = vi.fn()
        service.read.subscribeFragmentRegionMembership('transaction', 0, fragmentRegionChanged)
        service.read.subscribeGroupMembership('backend', groupMembershipChanged)

        expect(service.removeObjects([{ objectId: 'user-orders', objectKind: 'edge' }])).toBe(true)

        expect(service.read.getFragmentSnapshot('transaction')).toBe(fragment)
        expect((service.read.getFragmentSnapshot('transaction')?.regions[0]?.edgeIds ?? null)).toEqual(['orders-user'])
        expect(service.read.getGroupSnapshot('backend')).toBe(group)
        expect(service.read.getGroupNodeIdsSnapshot('backend')).toBe(groupNodeIds)
        expect(fragmentRegionChanged).toHaveBeenCalledOnce()
        expect(groupMembershipChanged).not.toHaveBeenCalled()
        expect(service.read.getChangeIdsSnapshot().map((changeId) => service.read.getChange(changeId))).toEqual(
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
        const editable = service.read.getEditableDiagram()
        const nodeIds = service.read.getNodeIdsSnapshot()

        expect(service.removeObjects([{ objectId: 'only', objectKind: 'node' }])).toBe(false)

        expect(service.read.getEditableDiagram()).toBe(editable)
        expect(service.read.getNodeIdsSnapshot()).toBe(nodeIds)
        expect(service.read.getNodeSnapshot('only')).not.toBeNull()
        expect(service.read.getChangeIdsSnapshot()).toEqual([])
        expect(reportValidationError).toHaveBeenCalledWith(
            'Delete selection rejected: nodes has empty array after deleting selection',
        )
    })

    it('creates an edge between existing nodes and drops fragment references when it is removed', () => {
        const service = sequenceHarness(vi.fn().mockReturnValue('edge-1'))
        const nodes = service.read.getEditableDiagram()?.nodes
        const nodeMembershipChanged = vi.fn()
        const edgeMembershipChanged = vi.fn()
        const regionMembershipChanged = vi.fn()
        service.read.subscribeCollectionMembership('node', nodeMembershipChanged)
        service.read.subscribeCollectionMembership('edge', edgeMembershipChanged)
        service.read.subscribeFragmentRegionMembership('transaction', 0, regionMembershipChanged)

        const createdId = service.createEdge({ from: 'orders', kind: 'async', to: 'user' })

        expect(createdId).toBe('edge-1')
        expect(service.read.getEdgeIdsSnapshot()).toEqual(['user-orders', 'orders-user', 'edge-1'])
        expect(service.read.getEditableDiagram()?.nodes).toBe(nodes)
        expect(edgeMembershipChanged).toHaveBeenCalledOnce()
        expect(nodeMembershipChanged).not.toHaveBeenCalled()
        expect(regionMembershipChanged).not.toHaveBeenCalled()

        expect(service.removeObjects([{ objectId: 'user-orders', objectKind: 'edge' }])).toBe(true)
        expect(service.read.getEdgeIdsSnapshot()).toEqual(['orders-user', 'edge-1'])
        expect((service.read.getFragmentSnapshot('transaction')?.regions[0]?.edgeIds ?? null)).toEqual(['orders-user'])
        expect(regionMembershipChanged).toHaveBeenCalledOnce()
        expect(service.read.getNodeIdsSnapshot()).toEqual(['user', 'orders'])
        expect(service.removeObjects([{ objectId: 'user-orders', objectKind: 'edge' }])).toBe(false)
    })

    it('inserts and moves sequence messages by persisted row without changing fragment references', () => {
        const service = sequenceHarness(vi.fn().mockReturnValue('edge-1'))
        const edgeMembershipChanged = vi.fn()
        const fragmentEdgeIds = (service.read.getFragmentSnapshot('transaction')?.regions[0]?.edgeIds ?? null)
        const initialEdgeIds = service.read.getEdgeIdsSnapshot()
        service.read.subscribeCollectionMembership('edge', edgeMembershipChanged)

        expect(service.createSequenceEdge({ from: 'orders', kind: 'success', to: 'user' }, 1)).toBe('edge-1')
        expect(service.read.getEdgeIdsSnapshot()).toEqual(['user-orders', 'edge-1', 'orders-user'])
        expect(service.read.getEdgeIdsSnapshot()).not.toBe(initialEdgeIds)
        const insertedEdgeIds = service.read.getEdgeIdsSnapshot()
        expect(edgeMembershipChanged).toHaveBeenCalledOnce()
        expect((service.read.getFragmentSnapshot('transaction')?.regions[0]?.edgeIds ?? null)).toBe(fragmentEdgeIds)

        expect(service.objects.moveSequenceEdge('orders-user', 0)).toBe(true)
        expect(service.read.getEdgeIdsSnapshot()).toEqual(['orders-user', 'user-orders', 'edge-1'])
        expect(service.read.getEdgeIdsSnapshot()).not.toBe(insertedEdgeIds)
        expect(edgeMembershipChanged).toHaveBeenCalledTimes(2)
        expect((service.read.getFragmentSnapshot('transaction')?.regions[0]?.edgeIds ?? null)).toBe(fragmentEdgeIds)

        const persisted = parseDiagramData(JSON.stringify(service.read.getEditableDiagram()))
        const reloaded = parseDiagramData(serializeDiagramData(persisted))
        expect(reloaded.edges.map(({ id }) => id)).toEqual(['orders-user', 'user-orders', 'edge-1'])
        expect(reloaded.fragments?.[0].regions[0].edgeIds).toEqual(['user-orders', 'orders-user'])
    })

    it('rejects sequence row operations on invalid rows and other diagram types', () => {
        const reportValidationError = vi.fn()
        const sequence = sequenceHarness(vi.fn().mockReturnValue('edge-1'), reportValidationError)

        expect(sequence.createSequenceEdge({ from: 'orders', kind: 'success', to: 'user' }, 3)).toBeNull()
        expect(sequence.objects.moveSequenceEdge('orders-user', -1)).toBe(false)
        expect(sequence.read.getEdgeIdsSnapshot()).toEqual(['user-orders', 'orders-user'])

        const { service: architecture } = createHarness({ reportValidationError })
        architecture.start()
        expect(architecture.createSequenceEdge({ from: 'orders', kind: 'connection', to: 'store' }, 0)).toBeNull()
        expect(architecture.objects.moveSequenceEdge('orders-store', 0)).toBe(false)
        expect(reportValidationError).toHaveBeenCalledTimes(4)
    })

    it('creates and removes groups without touching their member nodes', () => {
        const { service } = createHarness({ createId: vi.fn().mockReturnValue('group-1') })
        service.start()
        const store = service.read.getNodeSnapshot('store')
        const groupMembershipChanged = vi.fn()
        const nodeMembershipChanged = vi.fn()
        service.read.subscribeCollectionMembership('group', groupMembershipChanged)
        service.read.subscribeCollectionMembership('node', nodeMembershipChanged)

        const createdId = service.createGroup({ height: 80, label: 'Storage', nodeIds: [], width: 120, x: 20, y: 24 })

        expect(createdId).toBe('group-1')
        expect(service.read.getGroupIdsSnapshot()).toEqual(['backend', 'group-1'])
        expect(service.read.getGroupNodeIdsSnapshot('group-1')).toEqual([])
        expect(service.read.getGroupSnapshot('group-1')).toMatchObject({ height: 80, width: 120, x: 20, y: 24 })
        expect(groupMembershipChanged).toHaveBeenCalledOnce()

        expect(service.removeObjects([{ objectId: 'group-1', objectKind: 'group' }])).toBe(true)
        expect(service.read.getGroupIdsSnapshot()).toEqual(['backend'])
        expect(service.read.getGroupNodeIdsSnapshot('group-1')).toBeNull()
        expect(service.read.getNodeSnapshot('store')).toBe(store)
        expect(service.read.getNodeIdsSnapshot()).toEqual(['orders', 'store'])
        expect(nodeMembershipChanged).not.toHaveBeenCalled()
        expect(service.removeObjects([{ objectId: 'group-1', objectKind: 'group' }])).toBe(false)
    })

    it('adds and removes one group member without republishing other collections', () => {
        const reportValidationError = vi.fn()
        const { service } = createHarness({ reportValidationError })
        service.start()
        service.objects.removeGroupMember('backend', 'store')
        const backend = service.read.getGroupSnapshot('backend')
        const nodeIds = service.read.getNodeIdsSnapshot()
        const groupMembershipChanged = vi.fn()
        const nodeMembershipChanged = vi.fn()
        service.read.subscribeGroupMembership('backend', groupMembershipChanged)
        service.read.subscribeCollectionMembership('node', nodeMembershipChanged)

        expect(service.objects.addGroupMember('backend', 'store')).toBe(true)
        expect(service.objects.addGroupMember('backend', 'store')).toBe(false)

        expect(service.read.getGroupNodeIdsSnapshot('backend')).toEqual(['orders', 'store'])
        expect(service.read.getGroupSnapshot('backend')).toBe(backend)
        expect(service.read.getNodeIdsSnapshot()).toBe(nodeIds)
        expect(groupMembershipChanged).toHaveBeenCalledOnce()
        expect(nodeMembershipChanged).not.toHaveBeenCalled()
        expect(service.read.getDirtySnapshot()).toBe(false)
        expect(service.objects.addGroupMember('backend', 'missing')).toBe(false)
        expect(reportValidationError).toHaveBeenCalledWith(
            'Add group member rejected: groups.backend.nodeIds has unknown node missing',
        )
        expect(() => service.objects.removeGroupMember('missing', 'store')).toThrow('group missing does not exist')
        expect(service.objects.removeGroupMember('backend', 'missing')).toBe(false)
    })

    it('allows removing the final group member and removing a final member node without deleting the group', () => {
        const { service } = createHarness()
        service.start()
        service.objects.removeGroupMember('backend', 'store')

        expect(service.objects.removeGroupMember('backend', 'orders')).toBe(true)
        expect(service.read.getGroupNodeIdsSnapshot('backend')).toEqual([])

        expect(service.objects.addGroupMember('backend', 'store')).toBe(true)
        expect(service.removeObjects([{ objectId: 'store', objectKind: 'node' }])).toBe(true)
        expect(service.read.getGroupSnapshot('backend')).not.toBeNull()
        expect(service.read.getGroupNodeIdsSnapshot('backend')).toEqual([])
    })

    it('creates fragments only on sequence diagrams and keeps region edges after removal', () => {
        const service = sequenceHarness(vi.fn().mockReturnValue('fragment-1'))
        const fragmentMembershipChanged = vi.fn()
        service.read.subscribeCollectionMembership('fragment', fragmentMembershipChanged)

        const createdId = service.fragments.createFragment({
            operator: 'alt',
            regions: [{ edgeIds: ['user-orders'], guard: 'ok' }, { edgeIds: ['orders-user'], guard: 'failed' }],
        })

        expect(createdId).toBe('fragment-1')
        expect(service.read.getFragmentIdsSnapshot()).toEqual(['transaction', 'fragment-1'])
        expect((service.read.getFragmentSnapshot('fragment-1')?.regions[1]?.edgeIds ?? null)).toEqual(['orders-user'])
        expect(fragmentMembershipChanged).toHaveBeenCalledOnce()

        expect(service.fragments.removeFragment('fragment-1')).toBe(true)
        expect(service.read.getFragmentIdsSnapshot()).toEqual(['transaction'])
        expect((service.read.getFragmentSnapshot('fragment-1')?.regions[0]?.edgeIds ?? null)).toBeNull()
        expect(service.read.getEdgeIdsSnapshot()).toEqual(['user-orders', 'orders-user'])
        expect(service.fragments.removeFragment('fragment-1')).toBe(false)
    })

    it('updates operator, guards, and ordered region assignments atomically without replacing fragment identity', () => {
        const reportValidationError = vi.fn()
        const service = sequenceHarness(undefined, reportValidationError)
        const fragment = service.read.getFragmentSnapshot('transaction')
        const fragmentIds = service.read.getFragmentIdsSnapshot()
        const fragmentCollectionChanged = vi.fn()
        const operatorChanged = vi.fn()
        const firstGuardChanged = vi.fn()
        const secondGuardChanged = vi.fn()
        const firstRegionChanged = vi.fn(() => {
            expect(service.read.getFragmentSnapshot('transaction')?.regions).toEqual([
                { edgeIds: ['orders-user'], guard: 'accepted' },
                { edgeIds: ['user-orders'], guard: 'rejected' },
            ])
        })
        const secondRegionChanged = vi.fn()
        service.read.subscribeCollectionMembership('fragment', fragmentCollectionChanged)
        service.read.subscribeFragmentField('transaction', 'operator', operatorChanged)
        service.read.subscribeFragmentRegionField('transaction', 0, 'guard', firstGuardChanged)
        service.read.subscribeFragmentRegionField('transaction', 1, 'guard', secondGuardChanged)
        service.read.subscribeFragmentRegionMembership('transaction', 0, firstRegionChanged)
        service.read.subscribeFragmentRegionMembership('transaction', 1, secondRegionChanged)

        expect(service.fragments.updateFragment('transaction', {
            operator: 'alt',
            regions: [
                { edgeIds: ['orders-user'], guard: 'accepted' },
                { edgeIds: ['user-orders'], guard: 'rejected' },
            ],
        })).toBe(true)

        expect(service.read.getFragmentSnapshot('transaction')).toBe(fragment)
        expect(service.read.getFragmentIdsSnapshot()).toBe(fragmentIds)
        expect(service.read.getFragmentSnapshot('transaction')?.regions[0]?.guard).toBe('accepted')
        expect((service.read.getFragmentSnapshot('transaction')?.regions[0]?.edgeIds ?? null)).toEqual(['orders-user'])
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
        const fragment = service.read.getFragmentSnapshot('transaction')
        const guardChanged = vi.fn()
        const membershipChanged = vi.fn()
        service.read.subscribeFragmentRegionField('transaction', 0, 'guard', guardChanged)
        service.read.subscribeFragmentRegionMembership('transaction', 0, membershipChanged)

        expect(service.fragments.updateFragment('transaction', {
            operator: 'opt',
            regions: [{ edgeIds: ['orders-user', 'user-orders'], guard: 'approved' }],
        })).toBe(true)
        const changeIds = service.read.getChangeIdsSnapshot()
        expect(changeIds.map((changeId) => service.read.getChange(changeId))).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'guard', objectId: 'transaction', regionIndex: 0, value: 'approved' }),
            expect.objectContaining({ field: 'edgeIds', objectId: 'transaction', regionIndex: 0, value: ['orders-user', 'user-orders'] }),
        ]))

        expect(service.fragments.updateFragment('transaction', {
            operator: 'opt',
            regions: [{ edgeIds: [], guard: 'invalid' }],
        })).toBe(false)
        expect(service.fragments.updateFragment('transaction', {
            operator: 'alt',
            regions: [
                { edgeIds: ['user-orders'], guard: 'one' },
                { edgeIds: ['user-orders'], guard: 'two' },
            ],
        })).toBe(false)
        expect(service.read.getFragmentSnapshot('transaction')).toBe(fragment)
        expect((service.read.getFragmentSnapshot('transaction')?.regions[0]?.edgeIds ?? null)).toEqual(['orders-user', 'user-orders'])
        expect(guardChanged).toHaveBeenCalledOnce()
        expect(membershipChanged).toHaveBeenCalledOnce()

        expect(service.fragments.updateFragment('transaction', {
            operator: 'opt',
            regions: [{ edgeIds: ['user-orders', 'orders-user'], guard: 'requested' }],
        })).toBe(true)
        expect(service.read.getDirtySnapshot()).toBe(false)
        expect(service.read.getChangeIdsSnapshot()).toEqual([])
        expect(reportValidationError).toHaveBeenCalledTimes(2)
    })

    it('leaves the session untouched when a create operation is rejected', () => {
        const reportValidationError = vi.fn()
        const service = sequenceHarness(undefined, reportValidationError)
        const editable = service.read.getEditableDiagram()
        const edgeIds = service.read.getEdgeIdsSnapshot()
        const fragmentIds = service.read.getFragmentIdsSnapshot()
        const nodeIds = service.read.getNodeIdsSnapshot()
        const listener = vi.fn()
        service.read.subscribeCollectionMembership('edge', listener)
        service.read.subscribeCollectionMembership('fragment', listener)
        service.read.subscribeCollectionMembership('group', listener)
        service.read.subscribeCollectionMembership('node', listener)
        service.read.subscribeDirty(listener)

        expect(service.createEdge({ from: 'missing', kind: 'call', to: 'user' })).toBeNull()
        expect(service.createNode({ label: '  ', role: 'focal' })).toBeNull()
        expect(service.createGroup({ label: 'Twice', nodeIds: ['user', 'user'] })).toBeNull()
        expect(service.fragments.createFragment({ operator: 'alt', regions: [{ edgeIds: [], guard: 'only' }] })).toBeNull()
        expect(service.fragments.createFragment({
            operator: 'alt',
            regions: [{ edgeIds: ['user-orders'], guard: 'ok' }, { edgeIds: ['user-orders'], guard: 'again' }],
        })).toBeNull()

        expect(service.read.getEditableDiagram()).toBe(editable)
        expect(service.read.getEdgeIdsSnapshot()).toBe(edgeIds)
        expect(service.read.getFragmentIdsSnapshot()).toBe(fragmentIds)
        expect(service.read.getNodeIdsSnapshot()).toBe(nodeIds)
        expect(service.read.getGroupIdsSnapshot()).toEqual(['backend'])
        expect(service.read.getDirtySnapshot()).toBe(false)
        expect(listener).not.toHaveBeenCalled()
        expect(reportValidationError).toHaveBeenCalledTimes(5)
        expect(reportValidationError.mock.calls.map(([message]) => message)).toContain(
            'Create edge rejected: edges.new.from has unknown node missing',
        )

        const architectureReporter = vi.fn()
        const { service: architecture } = createHarness({ reportValidationError: architectureReporter })
        architecture.start()
        expect(architecture.fragments.createFragment({ operator: 'opt', regions: [{ edgeIds: [], guard: 'maybe' }] })).toBeNull()
        expect(architectureReporter).toHaveBeenCalledWith(
            'Create fragment rejected: fragments has value only allowed for sequence diagrams',
        )
    })

    it('rejects invalid runtime types and geometry without mutation, changes, or diagram events', () => {
        const reportValidationError = vi.fn()
        const { service } = createHarness({ reportValidationError })
        service.start()
        const editable = service.read.getEditableDiagram()
        const changeIds = service.read.getChangeIdsSnapshot()
        const listener = vi.fn()
        service.read.subscribeDirty(listener)
        service.read.subscribeChangeIds(listener)
        service.read.subscribeNodeField('orders', 'x', listener)
        service.read.subscribeCollectionMembership('edge', listener)

        expect(service.objects.setNodeField('orders', 'role', 'invalid' as never)).toBe(false)
        expect(service.objects.setNodeField('orders', 'x', 3)).toBe(false)
        expect(service.objects.setGroupField('backend', 'width', 0)).toBe(false)
        expect(service.createEdge({
            from: 'orders',
            kind: 'connection',
            to: 'store',
            waypoints: [{ x: 0, y: 0 }, { x: 4, y: 4 }],
        })).toBeNull()

        expect(service.read.getEditableDiagram()).toBe(editable)
        expect(service.read.getNodeFieldSnapshot('orders', 'role')).toBe('focal')
        expect(service.read.getNodeFieldSnapshot('orders', 'x')).toBeUndefined()
        expect(service.read.getGroupFieldSnapshot('backend', 'width')).toBeUndefined()
        expect(service.read.getConnectionPointFieldSnapshot('orders-store', 'sourceAttachment', 'offset')).toBe(0.5)
        expect(service.read.getChangeIdsSnapshot()).toBe(changeIds)
        expect(service.read.getDirtySnapshot()).toBe(false)
        expect(listener).not.toHaveBeenCalled()
        expect(reportValidationError.mock.calls.map(([message]) => message)).toEqual(expect.arrayContaining([
            'Set node field rejected: nodes.orders.role has unsupported value invalid',
            'Set node field rejected: nodes.orders.x has number outside the 4px grid',
            'Set group field rejected: groups.backend.width has invalid number',
            'Create edge rejected: edges.new.waypoints[1] has diagonal segment',
        ]))
    })

    it('enforces diagram-type rules, references, cardinalities, and required semantic labels', () => {
        const architectureReporter = vi.fn()
        const { service: architecture } = createHarness({ reportValidationError: architectureReporter })
        architecture.start()
        expect(architecture.objects.setEdgeField('orders-store', 'from', 'missing')).toBe(false)
        expect(architecture.objects.setEdgeField('orders-store', 'kind', 'relationship')).toBe(false)
        expect(architecture.objects.setEdgeField('orders-store', 'fromCardinality', '1')).toBe(false)
        expect(architecture.createNode({ fields: [{ name: 'id' }], label: 'Wrong', role: 'focal' })).toBeNull()

        const flowchartReporter = vi.fn()
        const { service: flowchart } = createHarness({ reportValidationError: flowchartReporter, source: flowchartDiagram })
        flowchart.start()
        expect(flowchart.objects.setEdgeField('check-done', 'label', undefined)).toBe(false)
        expect(flowchart.createEdge({ from: 'check', kind: 'flow', to: 'done' })).toBeNull()

        const stateReporter = vi.fn()
        const { service: state } = createHarness({ reportValidationError: stateReporter, source: stateDiagram })
        state.start()
        expect(state.objects.setEdgeField('start-work', 'label', undefined)).toBe(false)
        expect(state.createNode({ kind: 'decision', label: 'Wrong', role: 'focal' })).toBeNull()

        const sequenceReporter = vi.fn()
        const sequence = sequenceHarness(undefined, sequenceReporter)
        expect(sequence.fragments.createFragment({ operator: 'opt', regions: [{ edgeIds: ['user-orders'], guard: ' ' }] })).toBeNull()
        expect(sequence.fragments.updateFragment('transaction', { operator: 'alt', regions: sequence.read.getFragmentSnapshot('transaction')?.regions.map(({ edgeIds, guard }) => ({ edgeIds: [...edgeIds], guard })) ?? [] })).toBe(false)

        const entityReporter = vi.fn()
        const { service: entity } = createHarness({ reportValidationError: entityReporter, source: entityDiagram })
        entity.start()
        expect(entity.entityFields.setEntityField('order', 0, 'key', 'invalid' as never)).toBe(false)
        const relationship = entity.read.getEdgeSnapshot('order-item')
        expect(entity.objects.setEdgeField('order-item', 'fromCardinality', 'many' as never)).toBe(false)
        expect(entity.createEdge({ from: 'order', kind: 'relationship', to: 'missing' })).toBeNull()
        expect(entity.read.getEdgeSnapshot('order-item')).toBe(relationship)
        expect(entity.read.getEdgeFieldSnapshot('order-item', 'fromCardinality')).toBe('1')

        expect(architectureReporter.mock.calls.map(([message]) => message)).toEqual(expect.arrayContaining([
            'Set edge field rejected: edges.orders-store.from has unknown node missing',
            'Set edge field rejected: edges.orders-store.kind has unsupported value relationship for architecture',
            'Set edge field rejected: edges.orders-store.fromCardinality has value only allowed for entity diagrams',
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
        expect(sequence.fragments.updateFragment('transaction', { operator: 'opt', regions: [{ edgeIds: ['orders-user'], guard: 'requested' }] })).toBe(true)
        expect(sequence.removeObjects([{ objectId: 'orders-user', objectKind: 'edge' }])).toBe(true)
        expect((sequence.read.getFragmentSnapshot('transaction')?.regions[0]?.edgeIds ?? null)).toEqual([])
        expect(sequence.read.getEdgeSnapshot('orders-user')).toBeNull()

        expect(fragmentReporter).toHaveBeenCalledWith(
            'Delete selection validation problem: fragments.transaction.regions[0].edgeIds has empty array',
        )
    })

    it('clears dirty when a created object and its field edits are removed again', () => {
        const { service } = createHarness({ createId: vi.fn().mockReturnValue('node-1') })
        service.start()

        const createdId = service.createNode({ label: 'Billing', role: 'backend' })
        if (!createdId) throw new Error('Expected node creation to succeed')
        service.objects.setNodeField(createdId, 'label', 'Billing API')
        expect(service.read.getDirtySnapshot()).toBe(true)

        expect(service.removeObjects([{ objectId: createdId, objectKind: 'node' }])).toBe(true)
        expect(service.read.getDirtySnapshot()).toBe(false)
        expect(service.read.getChangeIdsSnapshot()).toEqual([])

        service.removeObjects([{ objectId: 'store', objectKind: 'node' }])
        expect(service.read.getDirtySnapshot()).toBe(true)
    })

    it('stores one original value and updates one existing field change in place', () => {
        const { service } = createHarness()
        service.start()
        const changeIdsChanged = vi.fn()
        service.read.subscribeChangeIds(changeIdsChanged)

        service.objects.setNodeField('orders', 'x', 4)
        const changeIds = service.read.getChangeIdsSnapshot()
        const [changeId] = changeIds
        const valueChanged = vi.fn()
        service.read.subscribeChangeField(changeId, 'value', valueChanged)

        expect(service.read.getChange(changeId)).toMatchObject({
            category: 'field',
            field: 'x',
            objectId: 'orders',
            objectKind: 'node',
            originalValue: undefined,
            value: 4,
        })

        service.objects.setNodeField('orders', 'x', 8)

        expect(service.read.getChangeIdsSnapshot()).toBe(changeIds)
        expect(changeIdsChanged).toHaveBeenCalledOnce()
        expect(valueChanged).toHaveBeenCalledOnce()
        expect(service.read.getChangeFieldSnapshot(changeId, 'originalValue')).toBeUndefined()
        expect(service.read.getChangeFieldSnapshot(changeId, 'value')).toBe(8)
    })

    it('removes a reverted field change and changes dirty only at empty boundaries', () => {
        const { service } = createHarness()
        service.start()
        const dirtyChanged = vi.fn()
        const changeIdsChanged = vi.fn()
        service.read.subscribeDirty(dirtyChanged)
        service.read.subscribeChangeIds(changeIdsChanged)

        service.objects.setNodeField('orders', 'label', 'Order API')
        service.objects.setMetadataField('title', 'System')
        const orderedChangeIds = service.read.getChangeIdsSnapshot()
        service.objects.setNodeField('orders', 'label', 'Order API v2')

        expect(service.read.getChangeIdsSnapshot()).toBe(orderedChangeIds)
        expect(dirtyChanged).toHaveBeenCalledOnce()

        service.objects.setNodeField('orders', 'label', 'Orders')
        expect(service.read.getDirtySnapshot()).toBe(true)
        expect(service.read.getChangeIdsSnapshot()).toHaveLength(1)
        expect(dirtyChanged).toHaveBeenCalledOnce()

        service.objects.setMetadataField('title', 'Overview')
        expect(service.read.getDirtySnapshot()).toBe(false)
        expect(service.read.getChangeIdsSnapshot()).toEqual([])
        expect(dirtyChanged).toHaveBeenCalledTimes(2)
        expect(changeIdsChanged).toHaveBeenCalledTimes(4)
    })

    it('tracks collection and nested membership as net semantic changes', () => {
        const { service } = createHarness({ createId: vi.fn().mockReturnValue('node-1') })
        service.start()

        const createdId = service.createNode({ label: 'Billing', role: 'backend' })
        if (!createdId) throw new Error('Expected node creation to succeed')
        const [additionId] = service.read.getChangeIdsSnapshot()
        expect(service.read.getChange(additionId)).toMatchObject({
            category: 'collection',
            objectId: createdId,
            objectKind: 'node',
            originalValue: null,
        })
        expect(service.read.getChangeFieldSnapshot(additionId, 'value')).toBe(service.read.getNodeSnapshot(createdId))

        service.removeObjects([{ objectId: createdId, objectKind: 'node' }])
        expect(service.read.getChangeIdsSnapshot()).toEqual([])

        service.objects.removeGroupMember('backend', 'store')
        const [membershipId] = service.read.getChangeIdsSnapshot()
        expect(service.read.getChange(membershipId)).toMatchObject({
            category: 'membership',
            field: 'nodeIds',
            objectId: 'store',
            objectKind: 'node',
            originalValue: true,
            ownerId: 'backend',
            value: false,
        })

        service.objects.addGroupMember('backend', 'store')
        expect(service.read.getChangeIdsSnapshot()).toEqual([])
        expect(service.read.getDirtySnapshot()).toBe(false)
    })

    it('replaces field entries with one original-object removal entry', () => {
        const { service } = createHarness()
        service.start()
        const originalGroup = diagram.groups[0]
        service.objects.setGroupField('backend', 'label', 'Core')

        service.removeObjects([{ objectId: 'backend', objectKind: 'group' }])

        const [removalId] = service.read.getChangeIdsSnapshot()
        expect(service.read.getChangeIdsSnapshot()).toHaveLength(1)
        expect(service.read.getChange(removalId)).toMatchObject({
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
        service.objects.setNodeField('orders', 'label', 'Order API')
        const changeIdsChanged = vi.fn()
        service.read.subscribeChangeIds(changeIdsChanged)

        service.start()

        expect(service.read.getChangeIdsSnapshot()).toEqual([])
        expect(service.read.getDirtySnapshot()).toBe(false)
        expect(changeIdsChanged).toHaveBeenCalledOnce()
    })

    it('exposes explicit legend membership and per-entry labels from the source diagram', () => {
        const service = legendHarness()

        expect(service.read.getLegendEntryKeysSnapshot()).toEqual(['node:focal', 'node:store', 'connection:connection'])
        expect(service.read.getLegendEntryFieldSnapshot('node:focal', 'label')).toBe('Service')
        expect(service.read.getLegendEntryFieldSnapshot('node:focal', 'role')).toBe('focal')
        expect(service.read.getLegendEntryFieldSnapshot('connection:connection', 'kind')).toBe('connection')
        expect(service.read.getLegendEntryFieldSnapshot('node:external', 'label')).toBeNull()
        expect(service.read.getOriginalLegendEntryFieldSnapshot('node:focal', 'label')).toBe('Service')
    })

    it('reports an empty legend for a diagram without explicit entries', () => {
        const { service } = createHarness()
        service.start()

        expect(service.read.getLegendEntryKeysSnapshot()).toEqual([])
    })

    it('assigns only the label of the addressed legend entry', () => {
        const service = legendHarness()
        const labelChanged = vi.fn()
        const otherLabelChanged = vi.fn()
        const membershipChanged = vi.fn()
        service.read.subscribeLegendEntryField('node:focal', 'label', labelChanged)
        service.read.subscribeLegendEntryField('node:store', 'label', otherLabelChanged)
        service.read.subscribeLegendMembership(membershipChanged)
        const entryKeys = service.read.getLegendEntryKeysSnapshot()

        expect(service.legend.setLegendEntryLabel('node:focal', '  Order service  ')).toBe(true)
        expect(service.read.getLegendEntryFieldSnapshot('node:focal', 'label')).toBe('Order service')
        expect(service.read.getLegendEntryFieldSnapshot('node:store', 'label')).toBe('Database')
        expect(service.read.getLegendEntryKeysSnapshot()).toBe(entryKeys)
        expect(labelChanged).toHaveBeenCalledOnce()
        expect(otherLabelChanged).not.toHaveBeenCalled()
        expect(membershipChanged).not.toHaveBeenCalled()
        expect(service.legend.setLegendEntryLabel('node:focal', 'Order service')).toBe(false)
        expect(labelChanged).toHaveBeenCalledOnce()
    })

    it('rejects an empty legend label and keeps the previous value', () => {
        const reportValidationError = vi.fn()
        const service = legendHarness(reportValidationError)

        expect(service.legend.setLegendEntryLabel('node:focal', '   ')).toBe(false)
        expect(service.read.getLegendEntryFieldSnapshot('node:focal', 'label')).toBe('Service')
        expect(reportValidationError).toHaveBeenCalledWith(expect.stringContaining('Set legend entry label rejected'))
        expect(service.read.getDirtySnapshot()).toBe(false)
    })

    it('adds an entry with a canonical label and rejects a duplicate semantic', () => {
        const reportValidationError = vi.fn()
        const service = legendHarness(reportValidationError)
        const membershipChanged = vi.fn()
        service.read.subscribeLegendMembership(membershipChanged)

        expect(service.legend.addLegendEntry({ role: 'external' })).toBe('node:external')
        expect(service.read.getLegendEntryKeysSnapshot()).toEqual(['node:focal', 'node:store', 'connection:connection', 'node:external'])
        expect(service.read.getLegendEntryFieldSnapshot('node:external', 'label')).toBe('external')
        expect(membershipDetail(membershipChanged)).toEqual({ addedKeys: ['node:external'], removedKeys: [] })

        expect(service.legend.addLegendEntry({ label: 'Again', role: 'focal' })).toBeNull()
        expect(reportValidationError).toHaveBeenCalledWith(expect.stringContaining('duplicate entry for node:focal'))
        expect(service.legend.addLegendEntry({ role: 'nope' } as never)).toBeNull()
        expect(membershipChanged).toHaveBeenCalledOnce()
    })

    it('preserves derived entries before the first added entry and saves their order', () => {
        const { service } = createHarness()
        service.start()

        expect(service.legend.addLegendEntry({ kind: 'data', label: 'Transfers' })).toBe('connection:data')
        const expectedLegend = [
            { label: 'Component', nodeKind: 'component' },
            { kind: 'connection', label: 'Connection' },
            { kind: 'data', label: 'Transfers' },
        ]
        expect(service.read.getEditableDiagram()?.meta.legend).toEqual(expectedLegend)
        const serialized = serializeDiagramData(service.read.getEditableDiagram() as DiagramData)
        expect(parseDiagramData(serialized).meta.legend).toEqual(expectedLegend)
    })

    it('saves separate custom labels for node kinds sharing one role and reloads them', () => {
        const source: DiagramData = {
            ...flowchartDiagram,
            edges: [],
            nodes: [
                { id: 'start', kind: 'start', label: 'Begin', role: 'focal' },
                { id: 'step', kind: 'step', label: 'Work', role: 'focal' },
                { id: 'decision', kind: 'decision', label: 'Check', role: 'focal' },
                { id: 'end', kind: 'end', label: 'Finish', role: 'focal' },
            ],
        }
        const { service } = createHarness({ source })
        service.start()

        expect(service.selectLegendEntry('nodeKind:step')).toBe(true)
        expect(service.legend.materializeDerivedLegend()).toBe(true)
        expect(service.read.getSelectedLegendEntryKeySnapshot()).toBe('nodeKind:step')
        expect(service.legend.setLegendEntryLabel('nodeKind:step', 'Process')).toBe(true)
        expect(service.legend.setLegendEntryLabel('nodeKind:decision', 'Branch')).toBe(true)
        const saved = parseDiagramData(serializeDiagramData(service.read.getEditableDiagram() as DiagramData))
        const { service: reloaded } = createHarness({ source: saved })
        reloaded.start()

        expect(reloaded.read.getLegendEntryKeysSnapshot()).toEqual([
            'nodeKind:start', 'nodeKind:step', 'nodeKind:decision', 'nodeKind:end',
        ])
        expect(reloaded.read.getLegendEntryFieldSnapshot('nodeKind:step', 'label')).toBe('Process')
        expect(reloaded.read.getLegendEntryFieldSnapshot('nodeKind:decision', 'label')).toBe('Branch')
    })

    it('rejects a derived duplicate and an incompatible connection kind before changing the legend', () => {
        const reportValidationError = vi.fn()
        const { service } = createHarness({ reportValidationError })
        service.start()

        expect(service.legend.addLegendEntry({ kind: 'connection' })).toBeNull()
        expect(service.legend.addLegendEntry({ kind: 'call' })).toBeNull()
        expect(service.read.getEditableDiagram()?.meta.legend).toBeUndefined()
        expect(reportValidationError).toHaveBeenCalledWith(expect.stringContaining('duplicate entry for connection:connection'))
        expect(reportValidationError).toHaveBeenCalledWith(expect.stringContaining('unsupported value call for architecture'))
    })

    it('removes a legend entry without touching nodes or edges', () => {
        const service = legendHarness()
        const membershipChanged = vi.fn()
        service.read.subscribeLegendMembership(membershipChanged)
        const nodes = service.read.getEditableDiagram()?.nodes
        const edges = service.read.getEditableDiagram()?.edges
        const nodeIds = service.read.getNodeIdsSnapshot()
        const edgeIds = service.read.getEdgeIdsSnapshot()

        expect(service.legend.removeLegendEntry('node:store')).toBe(true)
        expect(service.read.getLegendEntryKeysSnapshot()).toEqual(['node:focal', 'connection:connection'])
        expect(service.read.getEditableDiagram()?.nodes).toBe(nodes)
        expect(service.read.getEditableDiagram()?.edges).toBe(edges)
        expect(service.read.getNodeIdsSnapshot()).toBe(nodeIds)
        expect(service.read.getEdgeIdsSnapshot()).toBe(edgeIds)
        expect(membershipDetail(membershipChanged)).toEqual({ addedKeys: [], removedKeys: ['node:store'] })
        expect(service.legend.removeLegendEntry('node:store')).toBe(false)
        expect(membershipChanged).toHaveBeenCalledOnce()
    })

    it('keeps an explicit empty legend once the last entry is removed', () => {
        const service = legendHarness()

        for (const entryKey of [...service.read.getLegendEntryKeysSnapshot()]) service.legend.removeLegendEntry(entryKey)

        expect(service.read.getLegendEntryKeysSnapshot()).toEqual([])
        expect(service.read.getEditableDiagram()?.meta.legend).toEqual([])
    })

    it('materializes derived entries and persists removal of the last one after reload', () => {
        const { service } = createHarness()
        service.start()

        expect(service.legend.materializeDerivedLegend()).toBe(true)
        for (const entryKey of [...service.read.getLegendEntryKeysSnapshot()]) service.legend.removeLegendEntry(entryKey)

        expect(service.read.getDirtySnapshot()).toBe(true)
        const serialized = serializeDiagramData(service.read.getEditableDiagram() as DiagramData)
        expect(parseDiagramData(serialized).meta.legend).toEqual([])
    })

    it('reorders legend membership without changing any entry label', () => {
        const service = legendHarness()
        const membershipChanged = vi.fn()
        const labelChanged = vi.fn()
        service.read.subscribeLegendMembership(membershipChanged)
        service.read.subscribeLegendEntryField('connection:connection', 'label', labelChanged)

        expect(service.legend.moveLegendEntry('connection:connection', 0)).toBe(true)
        expect(service.read.getLegendEntryKeysSnapshot()).toEqual(['connection:connection', 'node:focal', 'node:store'])
        expect(service.read.getLegendEntryFieldSnapshot('connection:connection', 'label')).toBe('Calls')
        expect(membershipChanged).toHaveBeenCalledOnce()
        expect(labelChanged).not.toHaveBeenCalled()
        expect(service.legend.moveLegendEntry('connection:connection', 0)).toBe(false)
        expect(() => service.legend.moveLegendEntry('node:external', 0)).toThrow('legend entry node:external does not exist')
    })

    it('records legend label, membership, and order edits in the semantic change set', () => {
        const service = legendHarness()

        service.legend.setLegendEntryLabel('node:focal', 'Order service')
        expect(service.read.getChangeIdsSnapshot()).toEqual(['diagram:legendEntry:node%3Afocal:label'])
        expect(service.read.getChange('diagram:legendEntry:node%3Afocal:label')).toMatchObject({
            category: 'field',
            field: 'label',
            objectId: 'node:focal',
            objectKind: 'legendEntry',
            originalValue: 'Service',
            value: 'Order service',
        })
        expect(service.read.getDirtySnapshot()).toBe(true)

        service.legend.setLegendEntryLabel('node:focal', 'Service')
        expect(service.read.getChangeIdsSnapshot()).toEqual([])
        expect(service.read.getDirtySnapshot()).toBe(false)

        service.legend.addLegendEntry({ role: 'external' })
        expect(service.read.getChangeIdsSnapshot()).toEqual(['diagram:legendEntry:membership:node%3Aexternal'])
        expect(service.read.getChange('diagram:legendEntry:membership:node%3Aexternal')).toMatchObject({
            category: 'membership',
            field: 'legend',
            objectId: 'node:external',
            objectKind: 'legendEntry',
            originalValue: false,
            ownerId: 'diagram',
            value: true,
        })

        service.legend.removeLegendEntry('node:external')
        expect(service.read.getChangeIdsSnapshot()).toEqual([])

        service.legend.moveLegendEntry('connection:connection', 0)
        expect(service.read.getChangeIdsSnapshot()).toEqual([
            'diagram:legendEntry:node%3Afocal:order',
            'diagram:legendEntry:node%3Astore:order',
            'diagram:legendEntry:connection%3Aconnection:order',
        ])
        expect(service.read.getChange('diagram:legendEntry:connection%3Aconnection:order')).toMatchObject({
            category: 'field',
            field: 'order',
            originalValue: 2,
            value: 0,
        })
    })

    it('treats removing one entry as membership only, not as reordering the rest', () => {
        const service = legendHarness()

        service.legend.removeLegendEntry('node:focal')

        expect(service.read.getChangeIdsSnapshot()).toEqual(['diagram:legendEntry:membership:node%3Afocal'])
    })

    it('discards legend state and its changes when the session ends', () => {
        const service = legendHarness()
        service.legend.setLegendEntryLabel('node:focal', 'Order service')

        service.discard()

        expect(service.read.getLegendEntryKeysSnapshot()).toEqual([])
        expect(service.read.getChangeIdsSnapshot()).toEqual([])
        expect(() => service.legend.addLegendEntry({ role: 'focal' })).toThrow('session is not active')
    })

    it('fails fast when a legend entry is addressed without an active session or entry', () => {
        const { service } = createHarness()

        expect(() => service.legend.setLegendEntryLabel('node:focal', 'Service')).toThrow('session is not active')
        service.start()
        expect(() => service.legend.setLegendEntryLabel('node:focal', 'Service')).toThrow('legend entry node:focal does not exist')
    })

    it('fails fast when field assignment has no active session or owner', () => {
        const { service } = createHarness()

        expect(() => service.objects.setNodeField('orders', 'label', 'Order API')).toThrow('session is not active')
        service.start()
        expect(() => service.objects.setNodeField('missing', 'label', 'Missing')).toThrow('node missing does not exist')
        expect(() => service.entityFields.setEntityField('store', 0, 'name', 'id')).toThrow('entity field store[0] does not exist')
    })

    it('publishes dirty and semantic changes before a scoped field notification, including baseline reversion', () => {
        const { service } = createHarness()
        service.start()
        const order: string[] = []
        const changeId = 'diagram:node:orders:label'
        service.read.subscribeDirty(() => order.push('dirty'))
        service.read.subscribeChangeIds(() => order.push('changeIds'))
        service.read.subscribeChangeField(changeId, 'value', () => order.push('semantic'))
        service.read.subscribeModelMutation(() => order.push('mutation'))
        service.read.subscribeNodeField('orders', 'label', () => order.push('field'))

        service.objects.setNodeField('orders', 'label', 'Order API')
        expect(order).toEqual(['dirty', 'changeIds', 'mutation', 'field'])

        order.length = 0
        service.objects.setNodeField('orders', 'label', 'Order API v2')
        expect(order).toEqual(['semantic', 'mutation', 'field'])

        order.length = 0
        service.objects.setNodeField('orders', 'label', 'Orders')
        expect(order).toEqual(['dirty', 'changeIds', 'mutation', 'field'])
        expect(service.read.getChangeIdsSnapshot()).toEqual([])
    })

    it('publishes collection removal pre-notifications before dirty, semantic, and membership notifications', () => {
        const { service } = createHarness()
        service.start()
        const order: string[] = []
        service.read.subscribeCollectionMembershipWillChange('edge', () => order.push('edgePre'))
        service.read.subscribeCollectionMembershipWillChange('node', () => order.push('nodePre'))
        service.read.subscribeDirty(() => order.push('dirty'))
        service.read.subscribeChangeIds(() => order.push('semantic'))
        service.read.subscribeCollectionMembership('edge', () => order.push('edgeMembership'))
        service.read.subscribeCollectionMembership('node', () => order.push('nodeMembership'))
        service.read.subscribeGroupMembership('backend', () => order.push('groupMembership'))
        service.read.subscribeModelMutation(() => order.push('mutation'))

        expect(service.removeObjects([{ objectId: 'orders', objectKind: 'node' }])).toBe(true)
        expect(order).toEqual([
            'edgePre', 'nodePre', 'dirty', 'semantic',
            'edgeMembership', 'nodeMembership', 'groupMembership', 'mutation',
        ])
    })

    it('fails on repeated generated ID collisions without mutating the diagram', () => {
        const { service } = createHarness({ createId: () => 'orders' })
        service.start()
        const diagramBefore = service.read.getEditableDiagram()
        const nodeIdsBefore = service.read.getNodeIdsSnapshot()

        expect(() => service.createNode({ label: 'Billing', role: 'backend' })).toThrow(
            'Could not generate a collision-free diagram object id',
        )
        expect(service.read.getEditableDiagram()).toBe(diagramBefore)
        expect(service.read.getNodeIdsSnapshot()).toBe(nodeIdsBefore)
        expect(service.read.getChangeIdsSnapshot()).toEqual([])
    })

    it('rejects invalid edits before mutation or event publication', () => {
        const reportValidationError = vi.fn()
        const { service } = createHarness({ reportValidationError })
        service.start()
        const nodeBefore = service.read.getNodeSnapshot('orders')
        const changed = vi.fn()
        service.read.subscribeNodeField('orders', 'role', changed)

        expect(service.objects.setNodeField('orders', 'role', 'invalid' as never)).toBe(false)
        expect(service.read.getNodeSnapshot('orders')).toBe(nodeBefore)
        expect(service.read.getNodeFieldSnapshot('orders', 'role')).toBe('focal')
        expect(service.read.getChangeIdsSnapshot()).toEqual([])
        expect(changed).not.toHaveBeenCalled()
        expect(reportValidationError).toHaveBeenCalledWith(
            'Set node field rejected: nodes.orders.role has unsupported value invalid',
        )
    })

    it('acknowledges a saved copy as the new baseline and clears dirty before semantic changes', () => {
        const { service } = createHarness()
        service.start()
        service.objects.setNodeField('orders', 'label', 'Order API')
        const savedDiagram = structuredClone(service.read.getEditableDiagram() as DiagramData)
        const savedRecord = { ...firstRecord, id: 'copy-1', sourceDiagramId: firstRecord.id }
        const order: string[] = []
        service.read.subscribeDirty(() => order.push('dirty'))
        service.read.subscribeChangeIds(() => order.push('semantic'))

        expect(service.acknowledgeSavedCopy(savedRecord, savedDiagram, true)).toBe(true)
        expect(order).toEqual(['dirty', 'semantic'])
        expect(service.read.getDirtySnapshot()).toBe(false)
        expect(service.read.getChangeIdsSnapshot()).toEqual([])
        expect(service.read.getSavedRecordSnapshot()).toBe(savedRecord)

        service.objects.setNodeField('orders', 'label', 'Orders')
        expect(service.read.getDirtySnapshot()).toBe(true)
        service.objects.setNodeField('orders', 'label', 'Order API')
        expect(service.read.getDirtySnapshot()).toBe(false)
    })
})
