import { describe, expect, it, vi } from 'vitest'
import type { DiagramData } from './diagram_data'
import {
    DiagramEdgeDrawingService,
    diagramConnectionPointAt,
    orthogonalEdgePreviewRoute,
} from './diagram_edge_drawing_service'
import { DiagramEditSessionService } from './diagram_edit_session_service'
import { DiagramGeometryService } from './diagram_geometry_service'
import type { DiagramRecord } from './diagram_index'
import { DiagramSelectionService } from './diagram_selection_service'
import type { DiagramViewSourceSnapshot } from './diagram_view_service'

const record: DiagramRecord = { actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'design/diagrams/overview.json' }
const project = { branch: 'main', id: 'project', rootPath: 'C:/repo' }

function architectureDiagram(): DiagramData {
    return {
        edges: [{ from: 'source', id: 'existing', kind: 'connection', to: 'target' }],
        groups: [],
        meta: { description: 'Editable architecture', title: 'Architecture', type: 'architecture', version: 1 },
        nodes: [
            { height: 80, id: 'source', label: 'Source', role: 'focal', width: 120, x: 0, y: 0 },
            { height: 80, id: 'target', label: 'Target', role: 'store', width: 120, x: 240, y: 0 },
        ],
    }
}

function dependencyDiagram(): DiagramData {
    return {
        edges: [{ from: 'source', id: 'existing', kind: 'dependency', to: 'target' }],
        groups: [],
        meta: { description: 'Editable dependencies', title: 'Dependencies', type: 'dependency', version: 1 },
        nodes: [
            { height: 80, id: 'source', label: 'Source', role: 'focal', width: 120, x: 0, y: 0 },
            { height: 80, id: 'target', label: 'Target', role: 'backend', width: 120, x: 240, y: 0 },
        ],
    }
}

function sequenceDiagram(): DiagramData {
    return {
        edges: [
            { from: 'source', id: 'call', kind: 'call', to: 'target' },
            { from: 'target', id: 'return', kind: 'return', to: 'source' },
        ],
        groups: [],
        meta: { description: 'Editable sequence', title: 'Sequence', type: 'sequence', version: 1 },
        nodes: [
            { height: 72, id: 'source', kind: 'participant', label: 'Source', role: 'focal', width: 120, x: 0, y: 40 },
            { height: 72, id: 'target', kind: 'participant', label: 'Target', role: 'store', width: 120, x: 240, y: 40 },
        ],
    }
}

function flowchartDiagram(): DiagramData {
    return {
        edges: [{ from: 'step', id: 'existing', kind: 'flow', to: 'check' }],
        groups: [],
        meta: { description: 'Editable flowchart', preset: 'flowchart', title: 'Flow', type: 'flow', version: 1 },
        nodes: [
            { height: 72, id: 'step', kind: 'step', label: 'Step', role: 'focal', width: 160, x: 0, y: 0 },
            { height: 96, id: 'check', kind: 'decision', label: 'Check', role: 'focal', width: 96, x: 240, y: 0 },
            { height: 72, id: 'done', kind: 'end', label: 'Done', role: 'backend', width: 120, x: 480, y: 0 },
        ],
    }
}

function stateDiagram(): DiagramData {
    return {
        edges: [{ from: 'idle', id: 'existing', kind: 'transition', label: 'start', to: 'working' }],
        groups: [],
        meta: { description: 'Editable states', preset: 'state', title: 'States', type: 'flow', version: 1 },
        nodes: [
            { height: 72, id: 'idle', kind: 'state', label: 'Idle', role: 'focal', width: 160, x: 0, y: 0 },
            { height: 72, id: 'working', kind: 'state', label: 'Working', role: 'backend', width: 160, x: 240, y: 0 },
        ],
    }
}

function entityDiagram(): DiagramData {
    return {
        edges: [],
        groups: [],
        meta: { description: 'Editable entities', title: 'Entities', type: 'entity', version: 1 },
        nodes: [
            { height: 80, id: 'source', kind: 'entity', label: 'Source', role: 'focal', width: 120, x: 0, y: 0 },
            { height: 80, id: 'target', kind: 'entity', label: 'Target', role: 'store', width: 120, x: 240, y: 0 },
        ],
    }
}

class DiagramSourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot

    constructor(source: DiagramViewSourceSnapshot) {
        super()
        this.source = source
    }

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

function createHarness(source: DiagramData = architectureDiagram()) {
    const session = new DiagramEditSessionService(new DiagramSourceStub({ diagram: source, record }), () => 'drawn-edge')
    session.bindProject(project)
    session.start()
    const geometry = new DiagramGeometryService(session)
    const selection = new DiagramSelectionService(session, geometry)
    const drawing = new DiagramEdgeDrawingService(session, geometry, selection)

    return { drawing, geometry, selection, session }
}

describe('diagram edge drawing geometry', () => {
    it('resolves the nearest node boundary and relative offset', () => {
        const node = { height: 80, id: 'source', width: 120, x: 20, y: 40 }

        expect(diagramConnectionPointAt(node, { x: 140, y: 60 })).toEqual({ nodeId: 'source', offset: 0.25, side: 'right' })
        expect(diagramConnectionPointAt(node, { x: 50, y: 40 })).toEqual({ nodeId: 'source', offset: 0.25, side: 'top' })
    })

    it('builds an orthogonal route without duplicate points', () => {
        expect(orthogonalEdgePreviewRoute({ x: 10, y: 20 }, { x: 70, y: 60 }, 'right')).toEqual([
            { x: 10, y: 20 },
            { x: 70, y: 20 },
            { x: 70, y: 60 },
        ])
        expect(orthogonalEdgePreviewRoute({ x: 10, y: 20 }, { x: 10, y: 60 }, 'bottom')).toEqual([
            { x: 10, y: 20 },
            { x: 10, y: 60 },
        ])
    })
})

describe('DiagramEdgeDrawingService', () => {
    it('creates an entity relationship between persisted connection points', () => {
        const { drawing, geometry, selection, session } = createHarness(entityDiagram())

        expect(drawing.activate({ kind: 'relationship' })).toBe(true)
        drawing.beginSource('source', { x: 120, y: 20 })
        expect(drawing.completeTarget('target', { x: 240, y: 60 })).toBe('drawn-edge')

        expect(session.getEdgeSnapshot('drawn-edge')).toMatchObject({
            from: 'source',
            kind: 'relationship',
            sourceAttachment: { nodeId: 'source', offset: 0.25, side: 'right' },
            targetAttachment: { nodeId: 'target', offset: 0.75, side: 'left' },
            to: 'target',
        })
        expect(geometry.getEdgeRouteSnapshot('drawn-edge')[0]).toEqual({ x: 120, y: 20 })
        expect(geometry.getEdgeRouteSnapshot('drawn-edge').at(-1)).toEqual({ x: 240, y: 60 })
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'drawn-edge', objectKind: 'edge' }])
    })

    it('rejects relationship drawing outside an entity diagram before mutation', () => {
        const { drawing, session } = createHarness()
        const edgeIds = session.getEdgeIdsSnapshot()

        expect(drawing.activate({ kind: 'relationship' })).toBe(false)

        expect(session.getEdgeIdsSnapshot()).toBe(edgeIds)
        expect(session.getActiveToolSnapshot()).toBe('select')
        expect(drawing.getPreviewSnapshot()).toBeNull()
    })

    it.each(['connection', 'data', 'async'] as const)('creates selected architecture %s kind through shared drawing', (kind) => {
        const { drawing, session } = createHarness()

        expect(drawing.activate({ kind })).toBe(true)
        drawing.beginSource('source', { x: 120, y: 40 })
        expect(drawing.completeTarget('target', { x: 240, y: 40 })).toBe('drawn-edge')

        expect(session.getEdgeFieldSnapshot('drawn-edge', 'kind')).toBe(kind)
    })

    it.each(['dependency', 'cycle'] as const)('creates selected dependency %s kind with persisted direction and route', (kind) => {
        const { drawing, geometry, session } = createHarness(dependencyDiagram())

        expect(drawing.activate({ kind })).toBe(true)
        drawing.beginSource('source', { x: 120, y: 20 })
        expect(drawing.completeTarget('target', { x: 240, y: 60 })).toBe('drawn-edge')

        expect(session.getEdgeSnapshot('drawn-edge')).toMatchObject({
            from: 'source',
            kind,
            sourceAttachment: { nodeId: 'source', offset: 0.25, side: 'right' },
            targetAttachment: { nodeId: 'target', offset: 0.75, side: 'left' },
            to: 'target',
        })
        expect(geometry.getEdgeRouteSnapshot('drawn-edge')[0]).toEqual({ x: 120, y: 20 })
        expect(geometry.getEdgeRouteSnapshot('drawn-edge').at(-1)).toEqual({ x: 240, y: 60 })
    })

    it.each(['call', 'return', 'async', 'success'] as const)(
        'creates sequence %s at completion row without persisting preview geometry',
        (kind) => {
            const { drawing, session } = createHarness(sequenceDiagram())

            expect(drawing.activate({ kind })).toBe(true)
            drawing.beginSource('source', { x: 60, y: 200 })
            expect(drawing.getPreviewSnapshot()?.points).toEqual([{ x: 60, y: 200 }])
            expect(drawing.completeTarget('target', { x: 300, y: 200 })).toBe('drawn-edge')

            expect(session.getEdgeIdsSnapshot()).toEqual(['call', 'drawn-edge', 'return'])
            expect(session.getEdgeSnapshot('drawn-edge')).toEqual({from: 'source', id: 'drawn-edge', kind, to: 'target'})
        },
    )

    it('creates and selects one attached edge without replacing existing objects', () => {
        const { drawing, geometry, selection, session } = createHarness()
        const existingEdge = session.getEdgeSnapshot('existing')
        const sourceNode = session.getNodeSnapshot('source')
        const edgeMembershipChanged = vi.fn()
        const targetFanInChanged = vi.fn()
        session.subscribeCollectionMembership('edge', edgeMembershipChanged)
        geometry.subscribeNodeGeometryField('target', 'fanIn', targetFanInChanged)

        expect(drawing.activate({ kind: 'data', label: 'payload' })).toBe(true)
        drawing.beginSource('source', { x: 120, y: 20 })
        drawing.updatePreview({ x: 240, y: 60 }, 'target')
        expect(drawing.completeTarget('target', { x: 240, y: 60 })).toBe('drawn-edge')

        expect(session.getEdgeSnapshot('drawn-edge')).toMatchObject({
            from: 'source',
            kind: 'data',
            label: 'payload',
            sourceAttachment: { nodeId: 'source', offset: 0.25, side: 'right' },
            targetAttachment: { nodeId: 'target', offset: 0.75, side: 'left' },
            to: 'target',
        })
        expect(session.getEdgeSnapshot('existing')).toBe(existingEdge)
        expect(session.getNodeSnapshot('source')).toBe(sourceNode)
        expect(session.getEdgeIdsSnapshot()).toEqual(['existing', 'drawn-edge'])
        expect(edgeMembershipChanged).toHaveBeenCalledTimes(1)
        expect(targetFanInChanged).toHaveBeenCalledTimes(1)
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'drawn-edge', objectKind: 'edge' }])
        expect(session.getActiveToolSnapshot()).toBe('select')
        expect(session.getTransientGestureSnapshot()).toBeNull()
        expect(drawing.getPreviewSnapshot()).toBeNull()
    })

    it('keeps an invalid target recoverable and creates nothing', () => {
        const { drawing, session } = createHarness()
        drawing.activate({ kind: 'connection' })
        drawing.beginSource('source', { x: 120, y: 40 })
        const edgeIds = session.getEdgeIdsSnapshot()

        expect(drawing.completeTarget(null, { x: 180, y: 120 })).toBeNull()

        expect(session.getEdgeIdsSnapshot()).toBe(edgeIds)
        expect(session.getActiveToolSnapshot()).toBe('edge:connection')
        expect(session.getTransientGestureSnapshot()).toBe('edge')
        expect(drawing.getPreviewSnapshot()?.targetAttachment).toBeNull()
        expect(drawing.completeTarget('target', { x: 240, y: 40 })).toBe('drawn-edge')
    })

    it('accepts a self-connection because current diagram validation permits it', () => {
        const { drawing, session } = createHarness()
        drawing.activate({ kind: 'connection' })
        drawing.beginSource('source', { x: 120, y: 20 })

        expect(drawing.completeTarget('source', { x: 60, y: 80 })).toBe('drawn-edge')
        expect(session.getEdgeSnapshot('drawn-edge')).toMatchObject({
            from: 'source',
            sourceAttachment: { nodeId: 'source', offset: 0.25, side: 'right' },
            targetAttachment: { nodeId: 'source', offset: 0.5, side: 'bottom' },
            to: 'source',
        })
    })

    it('labels a drawn decision branch so the flowchart label rule accepts it', () => {
        const { drawing, session } = createHarness(flowchartDiagram())

        expect(drawing.activate({ kind: 'flow' })).toBe(true)
        drawing.beginSource('check', { x: 336, y: 48 })
        expect(drawing.completeTarget('done', { x: 480, y: 36 })).toBe('drawn-edge')

        expect(session.getEdgeSnapshot('drawn-edge')).toMatchObject({
            from: 'check',
            kind: 'flow',
            label: 'New branch',
            to: 'done',
        })
    })

    it('leaves a drawn flow edge from a non-decision source unlabelled', () => {
        const { drawing, session } = createHarness(flowchartDiagram())

        expect(drawing.activate({ kind: 'flow' })).toBe(true)
        drawing.beginSource('step', { x: 160, y: 36 })
        expect(drawing.completeTarget('done', { x: 480, y: 36 })).toBe('drawn-edge')

        expect(session.getEdgeFieldSnapshot('drawn-edge', 'label')).toBeUndefined()
    })

    it('keeps a tool supplied flow label instead of the placeholder', () => {
        const { drawing, session } = createHarness(flowchartDiagram())

        drawing.activate({ kind: 'flow', label: 'no' })
        drawing.beginSource('check', { x: 336, y: 48 })
        expect(drawing.completeTarget('done', { x: 480, y: 36 })).toBe('drawn-edge')

        expect(session.getEdgeFieldSnapshot('drawn-edge', 'label')).toBe('no')
    })

    it('labels every drawn state transition and keeps shared attachments and routing', () => {
        const { drawing, geometry, selection, session } = createHarness(stateDiagram())
        const existingEdge = session.getEdgeSnapshot('existing')

        expect(drawing.activate({ kind: 'transition' })).toBe(true)
        drawing.beginSource('working', { x: 400, y: 18 })
        drawing.updatePreview({ x: 0, y: 54 }, 'idle')
        expect(drawing.completeTarget('idle', { x: 0, y: 54 })).toBe('drawn-edge')

        expect(session.getEdgeSnapshot('drawn-edge')).toMatchObject({
            from: 'working',
            kind: 'transition',
            label: 'New transition',
            sourceAttachment: { nodeId: 'working', offset: 0.25, side: 'right' },
            targetAttachment: { nodeId: 'idle', offset: 0.75, side: 'left' },
            to: 'idle',
        })
        expect(session.getEdgeSnapshot('existing')).toBe(existingEdge)
        expect(session.getEdgeIdsSnapshot()).toEqual(['existing', 'drawn-edge'])
        expect(geometry.getEdgeRouteSnapshot('drawn-edge')[0]).toEqual({ x: 400, y: 18 })
        expect(geometry.getEdgeRouteSnapshot('drawn-edge').at(-1)).toEqual({ x: 0, y: 54 })
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'drawn-edge', objectKind: 'edge' }])
    })

    it.each([
        ['flow', flowchartDiagram, 'check'],
        ['transition', stateDiagram, 'idle'],
    ] as const)('leaves the diagram unchanged when %s drawing ends off any node', (kind, source, sourceNodeId) => {
        const { drawing, session } = createHarness(source())
        drawing.activate({ kind })
        drawing.beginSource(sourceNodeId, { x: 0, y: 36 })
        const edgeIds = session.getEdgeIdsSnapshot()

        expect(drawing.completeTarget(null, { x: 900, y: 400 })).toBeNull()

        expect(session.getEdgeIdsSnapshot()).toBe(edgeIds)
        expect(session.getActiveToolSnapshot()).toBe(`edge:${kind}`)
        expect(session.getTransientGestureSnapshot()).toBe('edge')
    })

    it('clears incomplete drawing on cancellation or tool change', () => {
        const { drawing, session } = createHarness()
        const previewChanged = vi.fn()
        drawing.subscribePreview(previewChanged)
        drawing.activate({ kind: 'connection' })
        drawing.beginSource('source', { x: 120, y: 40 })

        expect(drawing.cancelDrawing()).toBe(true)
        expect(drawing.getPreviewSnapshot()).toBeNull()
        expect(session.getActiveToolSnapshot()).toBe('select')

        drawing.activate({ kind: 'connection' })
        drawing.beginSource('source', { x: 120, y: 40 })
        session.setActiveTool('node:component')
        expect(drawing.getPreviewSnapshot()).toBeNull()
        expect(previewChanged).toHaveBeenCalledTimes(4)
    })
})
