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

function createHarness() {
    const source = architectureDiagram()
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
