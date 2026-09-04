import { register } from '../service_injector'
import {
    diagramEditSessionService,
    type DiagramEditSessionService,
} from './diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from './diagram_geometry_service'
import { DIAGRAM_GRID_SIZE } from './diagram_layout'
import {
    diagramSelectionService,
    type DiagramSelectionIdentity,
    type DiagramSelectionService,
} from './diagram_selection_service'

export const MINIMUM_DIAGRAM_NODE_WIDTH = 24
export const MINIMUM_DIAGRAM_NODE_HEIGHT = 24
export const MINIMUM_DIAGRAM_GROUP_WIDTH = 48
export const MINIMUM_DIAGRAM_GROUP_HEIGHT = 56

export type DiagramResizeDirection =
    | 'north'
    | 'north-east'
    | 'east'
    | 'south-east'
    | 'south'
    | 'south-west'
    | 'west'
    | 'north-west'

export interface DiagramResizePoint {
    x: number
    y: number
}

interface DiagramResizeBox {
    height: number
    width: number
    x: number
    y: number
}

interface ResizingDiagramObject {
    objectId: string
    objectKind: 'group' | 'node'
    originalHeight: number | undefined
    originalWidth: number | undefined
    originalX: number | undefined
    originalY: number | undefined
    startBox: DiagramResizeBox
}

interface DiagramResize {
    box: DiagramResizeBox
    direction: DiagramResizeDirection
    object: ResizingDiagramObject
    startPoint: DiagramResizePoint
}

function requireFinitePoint(point: DiagramResizePoint) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Diagram resize point must be finite')
}

function snapResizeDelta(value: number) {
    return Math.round(value / DIAGRAM_GRID_SIZE) * DIAGRAM_GRID_SIZE
}

function sameBox(left: DiagramResizeBox, right: DiagramResizeBox) {
    return left.height === right.height && left.width === right.width && left.x === right.x && left.y === right.y
}

function resizeBox(
    start: DiagramResizeBox,
    direction: DiagramResizeDirection,
    pointDelta: DiagramResizePoint,
    minimumWidth: number,
    minimumHeight: number,
) {
    const west = direction === 'west' || direction === 'north-west' || direction === 'south-west'
    const east = direction === 'east' || direction === 'north-east' || direction === 'south-east'
    const north = direction === 'north' || direction === 'north-east' || direction === 'north-west'
    const south = direction === 'south' || direction === 'south-east' || direction === 'south-west'
    const right = start.x + start.width
    const bottom = start.y + start.height
    const x = west ? Math.min(start.x + pointDelta.x, right - minimumWidth) : start.x
    const y = north ? Math.min(start.y + pointDelta.y, bottom - minimumHeight) : start.y
    const width = west ? right - x : east ? Math.max(minimumWidth, start.width + pointDelta.x) : start.width
    const height = north ? bottom - y : south ? Math.max(minimumHeight, start.height + pointDelta.y) : start.height

    return { height, width, x, y }
}

/** Owns one selected-object resize from pointer start through completion or rollback. */
export class DiagramResizeService {
    private readonly geometry: DiagramGeometryService
    private resize: DiagramResize | null = null
    private readonly selection: DiagramSelectionService
    private readonly session: DiagramEditSessionService

    constructor(
        session: DiagramEditSessionService = diagramEditSessionService,
        geometry: DiagramGeometryService = diagramGeometryService,
        selection: DiagramSelectionService = diagramSelectionService,
    ) {
        this.geometry = geometry
        this.selection = selection
        this.session = session
        this.session.subscribeTransientGesture(this.handleTransientGestureChanged)
    }

    getResizeActiveSnapshot = () => this.resize !== null

    beginResize(target: DiagramSelectionIdentity, direction: DiagramResizeDirection, point: DiagramResizePoint) {
        requireFinitePoint(point)
        if (this.session.getActiveToolSnapshot() !== 'select') return false
        if (this.resize) throw new Error('Cannot begin a diagram resize while another resize is active')

        const selection = this.selection.getSelectionSnapshot()
        if (selection.length !== 1 || !this.selection.isSelected(target) || target.objectKind === 'edge') return false

        const object = this.createResizingObject(target as DiagramSelectionIdentity & { objectKind: 'group' | 'node' })
        this.resize = {
            box: { ...object.startBox },
            direction,
            object,
            startPoint: { x: point.x, y: point.y },
        }
        this.session.beginTransientGesture('resize')

        return true
    }

    updateResize(point: DiagramResizePoint) {
        requireFinitePoint(point)
        const resize = this.requireResize()
        const minimumWidth = resize.object.objectKind === 'node'
            ? MINIMUM_DIAGRAM_NODE_WIDTH
            : MINIMUM_DIAGRAM_GROUP_WIDTH
        const minimumHeight = resize.object.objectKind === 'node'
            ? MINIMUM_DIAGRAM_NODE_HEIGHT
            : MINIMUM_DIAGRAM_GROUP_HEIGHT
        const pointDelta = {
            x: snapResizeDelta(point.x - resize.startPoint.x),
            y: snapResizeDelta(point.y - resize.startPoint.y),
        }
        const box = resizeBox(resize.object.startBox, resize.direction, pointDelta, minimumWidth, minimumHeight)
        if (sameBox(box, resize.box)) return false

        resize.box = box
        this.applyBox(resize.object, resize.direction, box)

        return true
    }

    completeResize() {
        if (!this.resize) return false

        this.resize = null
        this.session.completeTransientGesture()

        return true
    }

    cancelResize() {
        if (!this.resize) return false

        this.restoreResize()
        this.resize = null
        this.session.completeTransientGesture()

        return true
    }

    private readonly handleTransientGestureChanged = () => {
        if (!this.resize || this.session.getTransientGestureSnapshot() === 'resize') return

        this.restoreResize()
        this.resize = null
    }

    private createResizingObject(
        identity: DiagramSelectionIdentity & { objectKind: 'group' | 'node' },
    ): ResizingDiagramObject {
        const { objectId, objectKind } = identity
        const getGeometryField = objectKind === 'node'
            ? this.geometry.getNodeGeometryFieldSnapshot
            : this.geometry.getGroupGeometryFieldSnapshot
        const height = getGeometryField(objectId, 'height')
        const width = getGeometryField(objectId, 'width')
        const x = getGeometryField(objectId, 'x')
        const y = getGeometryField(objectId, 'y')
        if (height === null || width === null || x === null || y === null) {
            throw new Error(`Diagram ${objectKind} ${objectId} has no resize geometry`)
        }

        const originalHeight = objectKind === 'node'
            ? this.session.getNodeFieldSnapshot(objectId, 'height')
            : this.session.getGroupFieldSnapshot(objectId, 'height')
        const originalWidth = objectKind === 'node'
            ? this.session.getNodeFieldSnapshot(objectId, 'width')
            : this.session.getGroupFieldSnapshot(objectId, 'width')
        const originalX = objectKind === 'node'
            ? this.session.getNodeFieldSnapshot(objectId, 'x')
            : this.session.getGroupFieldSnapshot(objectId, 'x')
        const originalY = objectKind === 'node'
            ? this.session.getNodeFieldSnapshot(objectId, 'y')
            : this.session.getGroupFieldSnapshot(objectId, 'y')
        if (originalHeight === null || originalWidth === null || originalX === null || originalY === null) {
            throw new Error(`Diagram ${objectKind} ${objectId} does not exist`)
        }

        return {
            objectId,
            objectKind,
            originalHeight,
            originalWidth,
            originalX,
            originalY,
            startBox: { height, width, x, y },
        }
    }

    private applyBox(object: ResizingDiagramObject, direction: DiagramResizeDirection, box: DiagramResizeBox) {
        const changesX = direction === 'west' || direction === 'north-west' || direction === 'south-west'
        const changesY = direction === 'north' || direction === 'north-east' || direction === 'north-west'
        if (object.objectKind === 'node') {
            if (changesX) this.session.setNodeField(object.objectId, 'x', box.x)
            if (changesY) this.session.setNodeField(object.objectId, 'y', box.y)
            this.session.setNodeField(object.objectId, 'width', box.width)
            this.session.setNodeField(object.objectId, 'height', box.height)

            return
        }

        if (changesX) this.session.setGroupField(object.objectId, 'x', box.x)
        if (changesY) this.session.setGroupField(object.objectId, 'y', box.y)
        this.session.setGroupField(object.objectId, 'width', box.width)
        this.session.setGroupField(object.objectId, 'height', box.height)
    }

    private restoreResize() {
        const { direction, object } = this.requireResize()
        const { startBox } = object
        const changesX = direction === 'west' || direction === 'north-west' || direction === 'south-west'
        const changesY = direction === 'north' || direction === 'north-east' || direction === 'north-west'
        if (changesX) {
            if (object.originalX === undefined) this.applyX(object, startBox.x)
            this.applyX(object, object.originalX)
        }
        if (changesY) {
            if (object.originalY === undefined) this.applyY(object, startBox.y)
            this.applyY(object, object.originalY)
        }
        this.applySize(object, object.originalWidth, object.originalHeight)
    }

    private applyX(object: ResizingDiagramObject, x: number | undefined) {
        if (object.objectKind === 'node') {
            this.session.setNodeField(object.objectId, 'x', x)

            return
        }

        this.session.setGroupField(object.objectId, 'x', x)
    }

    private applyY(object: ResizingDiagramObject, y: number | undefined) {
        if (object.objectKind === 'node') {
            this.session.setNodeField(object.objectId, 'y', y)

            return
        }

        this.session.setGroupField(object.objectId, 'y', y)
    }

    private applySize(object: ResizingDiagramObject, width: number | undefined, height: number | undefined) {
        if (object.objectKind === 'node') {
            this.session.setNodeField(object.objectId, 'width', width)
            this.session.setNodeField(object.objectId, 'height', height)

            return
        }

        this.session.setGroupField(object.objectId, 'width', width)
        this.session.setGroupField(object.objectId, 'height', height)
    }

    private requireResize() {
        if (!this.resize) throw new Error('No diagram resize is active')

        return this.resize
    }
}

export const diagramResizeService = register('diagramResizeService', new DiagramResizeService())
