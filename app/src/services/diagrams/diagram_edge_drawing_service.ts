import { register } from '../service_injector'
import {
    requireDiagramEdgeKind,
    type DiagramConnectionPoint,
    type DiagramEdgeKind,
    type DiagramWaypoint,
} from './diagram_data'
import {
    diagramEditSessionService,
    type DiagramEditSessionService,
    type NewDiagramEdge,
} from './diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from './diagram_geometry_service'
import type { PositionedDiagramNode } from './diagram_layout'
import { diagramSelectionService, type DiagramSelectionService } from './diagram_selection_service'

const PREVIEW_CHANGED_EVENT = 'edgeDrawing:preview'

export interface DiagramEdgeDrawingPoint {
    x: number
    y: number
}

export type DiagramEdgeDrawingDefaults = Omit<
    NewDiagramEdge,
    'from' | 'sourceAttachment' | 'targetAttachment' | 'to' | 'waypoints'
>

export interface DiagramEdgeDrawingPreview {
    kind: DiagramEdgeKind
    points: readonly DiagramWaypoint[]
    sourceAttachment: DiagramConnectionPoint
    targetAttachment: DiagramConnectionPoint | null
}

type DiagramEdgeDrawingGeometry = Pick<DiagramGeometryService, 'getNodeGeometryFieldSnapshot'>
type DiagramEdgeDrawingSelection = Pick<DiagramSelectionService, 'replace'>

function requireFinitePoint(point: DiagramEdgeDrawingPoint) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new Error('Diagram edge drawing point must be finite')
    }
}

function clamp(value: number, minimum: number, maximum: number) {
    return Math.min(Math.max(value, minimum), maximum)
}

/** Resolves a pointer to the nearest boundary location in the persisted connection-point contract. */
export function diagramConnectionPointAt(
    node: Pick<PositionedDiagramNode, 'height' | 'id' | 'width' | 'x' | 'y'>,
    point: DiagramEdgeDrawingPoint,
): DiagramConnectionPoint {
    requireFinitePoint(point)
    const distances = [
        { distance: Math.abs(point.y - node.y), side: 'top' },
        { distance: Math.abs(point.x - node.x - node.width), side: 'right' },
        { distance: Math.abs(point.y - node.y - node.height), side: 'bottom' },
        { distance: Math.abs(point.x - node.x), side: 'left' },
    ] as const
    const nearest = distances.reduce((current, candidate) => (
        candidate.distance < current.distance ? candidate : current
    ))
    const horizontal = nearest.side === 'top' || nearest.side === 'bottom'
    const offset = horizontal
        ? clamp((point.x - node.x) / node.width, 0, 1)
        : clamp((point.y - node.y) / node.height, 0, 1)

    return { nodeId: node.id, offset, side: nearest.side }
}

function absoluteConnectionPoint(
    connectionPoint: DiagramConnectionPoint,
    node: Pick<PositionedDiagramNode, 'height' | 'width' | 'x' | 'y'>,
): DiagramWaypoint {
    const { offset, side } = connectionPoint
    if (side === 'top') return { x: node.x + node.width * offset, y: node.y }
    if (side === 'bottom') return { x: node.x + node.width * offset, y: node.y + node.height }
    if (side === 'left') return { x: node.x, y: node.y + node.height * offset }

    return { x: node.x + node.width, y: node.y + node.height * offset }
}

function samePoint(left: DiagramWaypoint, right: DiagramWaypoint) {
    return left.x === right.x && left.y === right.y
}

/** Creates the smallest horizontal/vertical preview route while preserving both endpoints. */
export function orthogonalEdgePreviewRoute(
    source: DiagramWaypoint,
    target: DiagramWaypoint,
    sourceSide: DiagramConnectionPoint['side'],
): readonly DiagramWaypoint[] {
    const sourceIsHorizontal = sourceSide === 'left' || sourceSide === 'right'
    const elbow = sourceIsHorizontal ? { x: target.x, y: source.y } : { x: source.x, y: target.y }
    const points = [source, elbow, target].filter((point, index, values) => index === 0 || !samePoint(point, values[index - 1]))

    return Object.freeze(points.map((point) => Object.freeze(point)))
}

/** Owns one edge tool from activation through source selection, preview, validation, and commit. */
export class DiagramEdgeDrawingService extends EventTarget {
    private defaults: DiagramEdgeDrawingDefaults | null = null
    private preview: DiagramEdgeDrawingPreview | null = null
    private readonly geometry: DiagramEdgeDrawingGeometry
    private readonly selection: DiagramEdgeDrawingSelection
    private readonly session: DiagramEditSessionService

    constructor(
        session: DiagramEditSessionService = diagramEditSessionService,
        geometry: DiagramEdgeDrawingGeometry = diagramGeometryService,
        selection: DiagramEdgeDrawingSelection = diagramSelectionService,
    ) {
        super()
        this.geometry = geometry
        this.selection = selection
        this.session = session
        this.session.subscribeActiveTool(this.handleActiveToolChanged)
        this.session.subscribeSession(this.handleSessionChanged)
    }

    getPreviewSnapshot = () => this.preview

    subscribePreview = (listener: () => void) => {
        this.addEventListener(PREVIEW_CHANGED_EVENT, listener)

        return () => this.removeEventListener(PREVIEW_CHANGED_EVENT, listener)
    }

    isDrawingActive() {
        return !!this.defaults && this.session.getActiveToolSnapshot() === `edge:${this.defaults.kind}`
    }

    hasSource() {
        return !!this.preview
    }

    isEdgeKindAvailable(kind: DiagramEdgeKind) {
        const diagramType = this.session.getMetadataFieldSnapshot('type')
        if (!diagramType) return false

        try {
            requireDiagramEdgeKind(kind, diagramType, 'edge.kind')

            return true
        } catch {
            return false
        }
    }

    activate(defaults: DiagramEdgeDrawingDefaults) {
        if (!this.session.getSessionSnapshot()) throw new Error('Cannot activate edge drawing without an active edit session')
        if (!this.isEdgeKindAvailable(defaults.kind)) return false

        this.defaults = { ...defaults }
        this.setPreview(null)
        this.session.setActiveTool(`edge:${defaults.kind}`)

        return true
    }

    beginSource(nodeId: string, point: DiagramEdgeDrawingPoint) {
        const defaults = this.requireActiveDefaults()
        const node = this.requirePositionedNode(nodeId)
        const sourceAttachment = diagramConnectionPointAt(node, point)
        const source = absoluteConnectionPoint(sourceAttachment, node)
        const preview = { kind: defaults.kind, points: Object.freeze([Object.freeze(source)]), sourceAttachment, targetAttachment: null }
        this.setPreview(preview)
        this.session.beginTransientGesture('edge')

        return true
    }

    updatePreview(point: DiagramEdgeDrawingPoint, targetNodeId: string | null = null) {
        requireFinitePoint(point)
        const preview = this.requirePreview()
        const sourceNode = this.requirePositionedNode(preview.sourceAttachment.nodeId)
        const source = absoluteConnectionPoint(preview.sourceAttachment, sourceNode)
        const targetNode = targetNodeId ? this.findPositionedNode(targetNodeId) : null
        const targetAttachment = targetNode ? diagramConnectionPointAt(targetNode, point) : null
        const target = targetAttachment && targetNode ? absoluteConnectionPoint(targetAttachment, targetNode) : point
        const points = orthogonalEdgePreviewRoute(source, target, preview.sourceAttachment.side)
        this.setPreview({ kind: preview.kind, points, sourceAttachment: preview.sourceAttachment, targetAttachment })

        return true
    }

    completeTarget(nodeId: string | null, point: DiagramEdgeDrawingPoint) {
        requireFinitePoint(point)
        const defaults = this.requireActiveDefaults()
        this.requirePreview()
        if (!nodeId || !this.findPositionedNode(nodeId)) {
            this.updatePreview(point)

            return null
        }

        this.updatePreview(point, nodeId)
        const completedPreview = this.requirePreview()
        const targetAttachment = completedPreview.targetAttachment
        if (!targetAttachment) return null

        const edge: NewDiagramEdge = {
            ...defaults,
            from: completedPreview.sourceAttachment.nodeId,
            sourceAttachment: { ...completedPreview.sourceAttachment },
            targetAttachment: { ...targetAttachment },
            to: targetAttachment.nodeId,
        }
        const edgeId = this.session.createEdge(edge)
        if (!edgeId) return null

        this.selection.replace([{ objectId: edgeId, objectKind: 'edge' }])
        this.defaults = null
        this.setPreview(null)
        this.session.setActiveTool('select')

        return edgeId
    }

    cancelDrawing() {
        if (!this.defaults && !this.preview) return false

        this.defaults = null
        this.setPreview(null)
        this.session.cancelActiveInteraction()

        return true
    }

    private readonly handleActiveToolChanged = () => {
        if (this.isDrawingActive()) return

        this.clearDrawing()
    }

    private readonly handleSessionChanged = () => this.clearDrawing()

    private clearDrawing() {
        this.defaults = null
        this.setPreview(null)
    }

    private findPositionedNode(nodeId: string) {
        const node = this.session.getNodeSnapshot(nodeId)
        const height = this.geometry.getNodeGeometryFieldSnapshot(nodeId, 'height')
        const width = this.geometry.getNodeGeometryFieldSnapshot(nodeId, 'width')
        const x = this.geometry.getNodeGeometryFieldSnapshot(nodeId, 'x')
        const y = this.geometry.getNodeGeometryFieldSnapshot(nodeId, 'y')
        if (!node || height === null || width === null || x === null || y === null) return null

        return { height, id: nodeId, width, x, y }
    }

    private requirePositionedNode(nodeId: string) {
        const node = this.findPositionedNode(nodeId)
        if (!node) throw new Error(`Diagram edge node ${nodeId} does not exist`)

        return node
    }

    private requireActiveDefaults() {
        if (!this.defaults || !this.isDrawingActive()) throw new Error('No diagram edge drawing is active')

        return this.defaults
    }

    private requirePreview() {
        if (!this.preview) throw new Error('Diagram edge drawing has no source connection point')

        return this.preview
    }

    private setPreview(preview: DiagramEdgeDrawingPreview | null) {
        if (preview === this.preview) return

        this.preview = preview
        this.dispatchEvent(new Event(PREVIEW_CHANGED_EVENT))
    }
}

export const diagramEdgeDrawingService = register(
    'diagramEdgeDrawingService',
    new DiagramEdgeDrawingService(),
)
