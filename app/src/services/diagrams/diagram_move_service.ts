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

export interface DiagramMovePoint {
    x: number
    y: number
}

interface MovingDiagramObject {
    objectId: string
    objectKind: 'group' | 'node'
    originalX: number | undefined
    originalY: number | undefined
    startX: number
    startY: number
}

interface DiagramMove {
    deltaX: number
    deltaY: number
    objects: readonly MovingDiagramObject[]
    startPoint: DiagramMovePoint
}

function requireFinitePoint(point: DiagramMovePoint) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Diagram move point must be finite')
}

function snapMoveDelta(value: number) {
    return Math.round(value / DIAGRAM_GRID_SIZE) * DIAGRAM_GRID_SIZE
}

/** Owns one selected-object move from pointer start through completion or rollback. */
export class DiagramMoveService {
    private readonly geometry: DiagramGeometryService
    private move: DiagramMove | null = null
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

    getMoveActiveSnapshot = () => this.move !== null

    beginMove(target: DiagramSelectionIdentity, point: DiagramMovePoint) {
        requireFinitePoint(point)
        if (this.session.getActiveToolSnapshot() !== 'select') return false
        if (this.move) throw new Error('Cannot begin a diagram move while another move is active')

        if (!this.selection.isSelected(target)) this.selection.replace([target])
        const objects = this.selection.getSelectionSnapshot()
            .filter((identity): identity is DiagramSelectionIdentity & { objectKind: 'group' | 'node' } => (
                identity.objectKind === 'group' || identity.objectKind === 'node'
            ))
            .map((identity) => this.createMovingObject(identity))
        if (objects.length === 0) return false

        this.move = { deltaX: 0, deltaY: 0, objects, startPoint: { x: point.x, y: point.y } }
        this.session.beginTransientGesture('move')

        return true
    }

    updateMove(point: DiagramMovePoint) {
        requireFinitePoint(point)
        const move = this.requireMove()
        const deltaX = snapMoveDelta(point.x - move.startPoint.x)
        const deltaY = snapMoveDelta(point.y - move.startPoint.y)
        if (deltaX === move.deltaX && deltaY === move.deltaY) return false

        move.deltaX = deltaX
        move.deltaY = deltaY
        for (const object of move.objects) this.applyPosition(object, object.startX + deltaX, object.startY + deltaY)

        return true
    }

    completeMove() {
        if (!this.move) return false

        this.move = null
        this.session.completeTransientGesture()

        return true
    }

    cancelMove() {
        if (!this.move) return false

        this.restoreMove()
        this.move = null
        this.session.completeTransientGesture()

        return true
    }

    private readonly handleTransientGestureChanged = () => {
        if (!this.move || this.session.getTransientGestureSnapshot() === 'move') return

        this.restoreMove()
        this.move = null
    }

    private createMovingObject(identity: DiagramSelectionIdentity & { objectKind: 'group' | 'node' }): MovingDiagramObject {
        const { objectId, objectKind } = identity
        const startX = objectKind === 'node'
            ? this.geometry.getNodeGeometryFieldSnapshot(objectId, 'x')
            : this.geometry.getGroupGeometryFieldSnapshot(objectId, 'x')
        const startY = objectKind === 'node'
            ? this.geometry.getNodeGeometryFieldSnapshot(objectId, 'y')
            : this.geometry.getGroupGeometryFieldSnapshot(objectId, 'y')
        if (startX === null || startY === null) throw new Error(`Diagram ${objectKind} ${objectId} has no move geometry`)

        const originalX = objectKind === 'node'
            ? this.session.getNodeFieldSnapshot(objectId, 'x')
            : this.session.getGroupFieldSnapshot(objectId, 'x')
        const originalY = objectKind === 'node'
            ? this.session.getNodeFieldSnapshot(objectId, 'y')
            : this.session.getGroupFieldSnapshot(objectId, 'y')
        if (originalX === null || originalY === null) throw new Error(`Diagram ${objectKind} ${objectId} does not exist`)

        return { objectId, objectKind, originalX, originalY, startX, startY }
    }

    private applyPosition(object: MovingDiagramObject, x: number | undefined, y: number | undefined) {
        if (object.objectKind === 'node') {
            this.session.setNodeField(object.objectId, 'x', x)
            this.session.setNodeField(object.objectId, 'y', y)

            return
        }

        this.session.setGroupField(object.objectId, 'x', x)
        this.session.setGroupField(object.objectId, 'y', y)
    }

    private restoreMove() {
        const move = this.requireMove()
        for (const object of move.objects.filter(({ objectKind }) => objectKind === 'node')) this.restorePosition(object)
        for (const object of move.objects.filter(({ objectKind }) => objectKind === 'group')) this.restorePosition(object)
    }

    private restorePosition(object: MovingDiagramObject) {
        if (object.objectKind === 'node') {
            if (object.originalX === undefined) this.session.setNodeField(object.objectId, 'x', object.startX)
            if (object.originalY === undefined) this.session.setNodeField(object.objectId, 'y', object.startY)
        }
        this.applyPosition(object, object.originalX, object.originalY)
    }

    private requireMove() {
        if (!this.move) throw new Error('No diagram move is active')

        return this.move
    }
}

export const diagramMoveService = register('diagramMoveService', new DiagramMoveService())
