import { register } from '../service_injector'
import {
    diagramEditSessionService,
    type DiagramEditSessionService,
} from './diagram_edit_session_service'
import {
    DIAGRAM_GRID_SIZE,
    MINIMUM_DIAGRAM_GROUP_HEIGHT,
    MINIMUM_DIAGRAM_GROUP_WIDTH,
} from './diagram_layout'
import {
    diagramSelectionService,
    type DiagramSelectionService,
} from './diagram_selection_service'

const PENDING_LABEL_CHANGED_EVENT = 'groupDrawing:pendingLabel'
const PREVIEW_CHANGED_EVENT = 'groupDrawing:preview'

export interface DiagramGroupDrawingPoint {
    x: number
    y: number
}

export interface DiagramGroupDrawingBox {
    height: number
    width: number
    x: number
    y: number
}

function requireFinitePoint(point: DiagramGroupDrawingPoint) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Diagram group drawing point must be finite')
}

function snapCoordinate(value: number) {
    return Math.round(value / DIAGRAM_GRID_SIZE) * DIAGRAM_GRID_SIZE
}

function groupBox(start: DiagramGroupDrawingPoint, point: DiagramGroupDrawingPoint): DiagramGroupDrawingBox {
    const end = { x: snapCoordinate(point.x), y: snapCoordinate(point.y) }
    const width = Math.max(Math.abs(end.x - start.x), MINIMUM_DIAGRAM_GROUP_WIDTH)
    const height = Math.max(Math.abs(end.y - start.y), MINIMUM_DIAGRAM_GROUP_HEIGHT)

    return Object.freeze({
        height,
        width,
        x: end.x < start.x ? start.x - width : start.x,
        y: end.y < start.y ? start.y - height : start.y,
    })
}

function sameBox(left: DiagramGroupDrawingBox, right: DiagramGroupDrawingBox) {
    return left.height === right.height && left.width === right.width && left.x === right.x && left.y === right.y
}

/** Owns Group tool gesture, preview, pending label, and one committed group creation. */
export class DiagramGroupDrawingService extends EventTarget {
    private pendingLabelBox: DiagramGroupDrawingBox | null = null
    private preview: DiagramGroupDrawingBox | null = null
    private readonly selection: Pick<DiagramSelectionService, 'replace'>
    private readonly session: DiagramEditSessionService
    private startPoint: DiagramGroupDrawingPoint | null = null

    constructor(
        session: DiagramEditSessionService = diagramEditSessionService,
        selection: Pick<DiagramSelectionService, 'replace'> = diagramSelectionService,
    ) {
        super()
        this.selection = selection
        this.session = session
        this.session.subscribeActiveTool(this.handleActiveToolChanged)
        this.session.subscribeSession(this.handleSessionChanged)
    }

    getPendingLabelBoxSnapshot = () => this.pendingLabelBox

    getPreviewSnapshot = () => this.preview

    subscribePendingLabelBox = (listener: () => void) => this.subscribe(PENDING_LABEL_CHANGED_EVENT, listener)

    subscribePreview = (listener: () => void) => this.subscribe(PREVIEW_CHANGED_EVENT, listener)

    isDrawingActive() {
        return this.session.getActiveToolSnapshot() === 'group'
    }

    activate() {
        if (!this.session.getSessionSnapshot()) throw new Error('Cannot activate group drawing without an active edit session')

        this.clearDrawing()
        this.session.setActiveTool('group')

        return true
    }

    beginDrawing(point: DiagramGroupDrawingPoint) {
        requireFinitePoint(point)
        if (!this.isDrawingActive() || this.pendingLabelBox) return false
        if (this.startPoint) throw new Error('Cannot begin group drawing while another group drawing is active')

        this.startPoint = Object.freeze({ x: snapCoordinate(point.x), y: snapCoordinate(point.y) })
        this.setPreview(groupBox(this.startPoint, this.startPoint))
        this.session.beginTransientGesture('group')

        return true
    }

    updateDrawing(point: DiagramGroupDrawingPoint) {
        requireFinitePoint(point)
        const startPoint = this.requireStartPoint()
        const preview = groupBox(startPoint, point)
        if (this.preview && sameBox(preview, this.preview)) return false

        this.setPreview(preview)

        return true
    }

    finishDrawing(point: DiagramGroupDrawingPoint) {
        this.updateDrawing(point)
        const preview = this.preview
        if (!preview) throw new Error('Cannot finish group drawing without a preview')

        this.startPoint = null
        this.setPendingLabelBox(preview)
        this.session.completeTransientGesture()

        return true
    }

    completeGroup(label: string) {
        if (label.trim().length === 0) throw new Error('Diagram group label is required')
        const box = this.pendingLabelBox
        if (!box) throw new Error('Diagram group drawing has no pending label')

        const groupId = this.session.createGroup({ ...box, label, nodeIds: [] })
        if (!groupId) return null

        this.selection.replace([{ objectId: groupId, objectKind: 'group' }])
        this.clearDrawing()
        this.session.setActiveTool('select')

        return groupId
    }

    cancelDrawing() {
        if (!this.startPoint && !this.preview && !this.pendingLabelBox && !this.isDrawingActive()) return false

        this.clearDrawing()
        this.session.cancelActiveInteraction()

        return true
    }

    private readonly handleActiveToolChanged = () => {
        if (this.isDrawingActive()) return

        this.clearDrawing()
    }

    private readonly handleSessionChanged = () => this.clearDrawing()

    private clearDrawing() {
        this.startPoint = null
        this.setPreview(null)
        this.setPendingLabelBox(null)
    }

    private requireStartPoint() {
        if (!this.startPoint || !this.isDrawingActive()) throw new Error('No diagram group drawing is active')

        return this.startPoint
    }

    private setPendingLabelBox(box: DiagramGroupDrawingBox | null) {
        if (box === this.pendingLabelBox) return

        this.pendingLabelBox = box
        this.dispatchEvent(new Event(PENDING_LABEL_CHANGED_EVENT))
    }

    private setPreview(preview: DiagramGroupDrawingBox | null) {
        if (preview === this.preview) return

        this.preview = preview
        this.dispatchEvent(new Event(PREVIEW_CHANGED_EVENT))
    }

    private subscribe(eventType: string, listener: () => void) {
        this.addEventListener(eventType, listener)

        return () => this.removeEventListener(eventType, listener)
    }
}

export const diagramGroupDrawingService = register(
    'diagramGroupDrawingService',
    new DiagramGroupDrawingService(),
)
