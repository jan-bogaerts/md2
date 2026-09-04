import { register } from '../service_injector'
import {
    diagramEditSessionService,
    type DiagramCollectionKind,
    type DiagramEditSessionService,
    type DiagramMembershipChangeDetail,
} from './diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from './diagram_geometry_service'
import {
    diagramRectangleBetween,
    diagramRectangleIntersectsBox,
    diagramRectangleIntersectsRoute,
    type DiagramPoint,
    type DiagramRectangle,
} from './diagram_rectangle_selection'

const SELECTION_MEMBERSHIP_CHANGED_EVENT = 'selection:membership'
const SELECTION_RECTANGLE_CHANGED_EVENT = 'selection:rectangle'
const EMPTY_SELECTION: readonly DiagramSelectionIdentity[] = Object.freeze([])

export type DiagramSelectableObjectKind = Extract<DiagramCollectionKind, 'edge' | 'group' | 'node'>

export interface DiagramSelectionIdentity {
    objectId: string
    objectKind: DiagramSelectableObjectKind
}

type DiagramSelectionSession = Pick<
    DiagramEditSessionService,
    | 'getEdgeSnapshot'
    | 'getEdgeIdsSnapshot'
    | 'getGroupSnapshot'
    | 'getGroupIdsSnapshot'
    | 'getNodeSnapshot'
    | 'getNodeIdsSnapshot'
    | 'getSessionSnapshot'
    | 'getActiveToolSnapshot'
    | 'subscribeActiveTool'
    | 'subscribeCollectionMembershipWillChange'
    | 'subscribeSession'
>

type DiagramSelectionGeometry = Pick<
    DiagramGeometryService,
    'getEdgeRouteSnapshot' | 'getGroupGeometryFieldSnapshot' | 'getNodeGeometryFieldSnapshot'
>

function selectionKey({ objectId, objectKind }: DiagramSelectionIdentity) {
    return `${objectKind}:${objectId}`
}

function selectedChangedEvent(identity: DiagramSelectionIdentity) {
    return `selection:${identity.objectKind}:${encodeURIComponent(identity.objectId)}`
}

function frozenIdentity(identity: DiagramSelectionIdentity): DiagramSelectionIdentity {
    return Object.freeze({ objectId: identity.objectId, objectKind: identity.objectKind })
}

function requireFinitePoint(point: DiagramPoint) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new Error('Diagram selection point coordinates must be finite')
    }
}

/** Owns selected node, edge, and group identities for the active diagram edit session. */
export class DiagramSelectionService extends EventTarget {
    private readonly geometry: DiagramSelectionGeometry
    private rectangle: DiagramRectangle | null = null
    private rectangleStart: DiagramPoint | null = null
    private selection: readonly DiagramSelectionIdentity[] = EMPTY_SELECTION
    private selectedKeys = new Set<string>()
    private readonly session: DiagramSelectionSession

    constructor(
        session: DiagramSelectionSession = diagramEditSessionService,
        geometry: DiagramSelectionGeometry = diagramGeometryService,
    ) {
        super()
        this.geometry = geometry
        this.session = session
        this.session.subscribeActiveTool(this.handleActiveToolChange)
        this.session.subscribeSession(this.handleSessionChange)
        this.session.subscribeCollectionMembershipWillChange('edge', this.handleCollectionMembershipWillChange)
        this.session.subscribeCollectionMembershipWillChange('group', this.handleCollectionMembershipWillChange)
        this.session.subscribeCollectionMembershipWillChange('node', this.handleCollectionMembershipWillChange)
    }

    getSelectionSnapshot = () => this.selection

    getRectangleSnapshot = () => this.rectangle

    getSelectedSnapshot = (identity: DiagramSelectionIdentity) => this.isSelected(identity)

    isSelected(identity: DiagramSelectionIdentity) {
        return this.selectedKeys.has(selectionKey(identity))
    }

    subscribeSelection = (listener: () => void) => this.subscribe(SELECTION_MEMBERSHIP_CHANGED_EVENT, listener)

    subscribeRectangle = (listener: () => void) => this.subscribe(SELECTION_RECTANGLE_CHANGED_EVENT, listener)

    subscribeSelected = (identity: DiagramSelectionIdentity, listener: () => void) => (
        this.subscribe(selectedChangedEvent(identity), listener)
    )

    replace(identities: readonly DiagramSelectionIdentity[]) {
        const nextSelection: DiagramSelectionIdentity[] = []
        const nextKeys = new Set<string>()
        for (const identity of identities) {
            this.requireSelectableIdentity(identity)
            const key = selectionKey(identity)
            if (nextKeys.has(key)) continue

            nextKeys.add(key)
            nextSelection.push(frozenIdentity(identity))
        }
        if (this.hasSameMembership(nextKeys)) return false

        const changedIdentities = [
            ...this.selection.filter((identity) => !nextKeys.has(selectionKey(identity))),
            ...nextSelection.filter((identity) => !this.selectedKeys.has(selectionKey(identity))),
        ]
        this.selection = nextSelection.length > 0 ? Object.freeze(nextSelection) : EMPTY_SELECTION
        this.selectedKeys = nextKeys
        this.publish(changedIdentities)

        return true
    }

    add(identity: DiagramSelectionIdentity) {
        this.requireSelectableIdentity(identity)
        const key = selectionKey(identity)
        if (this.selectedKeys.has(key)) return false

        const storedIdentity = frozenIdentity(identity)
        this.selectedKeys.add(key)
        this.selection = Object.freeze([...this.selection, storedIdentity])
        this.publish([storedIdentity])

        return true
    }

    remove(identity: DiagramSelectionIdentity) {
        const key = selectionKey(identity)
        if (!this.selectedKeys.has(key)) return false

        this.selectedKeys.delete(key)
        this.selection = this.selection.length === 1
            ? EMPTY_SELECTION
            : Object.freeze(this.selection.filter((selected) => selectionKey(selected) !== key))
        this.publish([identity])

        return true
    }

    toggle(identity: DiagramSelectionIdentity) {
        return this.isSelected(identity) ? this.remove(identity) : this.add(identity)
    }

    clear() {
        if (this.selection.length === 0) return false

        const removed = this.selection
        this.selection = EMPTY_SELECTION
        this.selectedKeys = new Set<string>()
        this.publish(removed)

        return true
    }

    beginRectangleSelection(point: DiagramPoint) {
        requireFinitePoint(point)
        this.rectangleStart = Object.freeze({ x: point.x, y: point.y })
        this.setRectangle(diagramRectangleBetween(point, point))
    }

    updateRectangleSelection(point: DiagramPoint) {
        requireFinitePoint(point)
        if (!this.rectangleStart) return false

        return this.setRectangle(diagramRectangleBetween(this.rectangleStart, point))
    }

    completeRectangleSelection(point: DiagramPoint) {
        requireFinitePoint(point)
        const start = this.rectangleStart
        if (!start) return false

        const rectangle = diagramRectangleBetween(start, point)
        this.clearRectangle()
        if (rectangle.width === 0 && rectangle.height === 0) {
            this.clear()

            return true
        }
        this.replace(this.identitiesIntersecting(rectangle))

        return true
    }

    cancelRectangleSelection() {
        return this.clearRectangle()
    }

    private handleActiveToolChange = () => {
        if (this.session.getActiveToolSnapshot() !== 'select') this.clearRectangle()
    }

    private handleSessionChange = () => {
        this.clearRectangle()
        this.clear()
    }

    private handleCollectionMembershipWillChange = (event: Event) => {
        const { memberKind, removedIds } = (event as CustomEvent<DiagramMembershipChangeDetail>).detail
        const removedIdSet = new Set(removedIds)
        const removed = this.selection.filter(({ objectId, objectKind }) => (
            objectKind === memberKind && removedIdSet.has(objectId)
        ))
        if (removed.length === 0) return

        const removedKeys = new Set(removed.map(selectionKey))
        for (const key of removedKeys) this.selectedKeys.delete(key)
        this.selection = this.selection.length === removed.length
            ? EMPTY_SELECTION
            : Object.freeze(this.selection.filter((identity) => !removedKeys.has(selectionKey(identity))))
        this.publish(removed)
    }

    private hasSameMembership(nextKeys: Set<string>) {
        return nextKeys.size === this.selectedKeys.size && [...nextKeys].every((key) => this.selectedKeys.has(key))
    }

    private identitiesIntersecting(rectangle: DiagramRectangle) {
        const identities: DiagramSelectionIdentity[] = []
        for (const nodeId of this.session.getNodeIdsSnapshot()) {
            const box = this.readBox('node', nodeId)
            if (box && diagramRectangleIntersectsBox(rectangle, box)) {
                identities.push({ objectId: nodeId, objectKind: 'node' })
            }
        }
        for (const edgeId of this.session.getEdgeIdsSnapshot()) {
            if (diagramRectangleIntersectsRoute(rectangle, this.geometry.getEdgeRouteSnapshot(edgeId))) {
                identities.push({ objectId: edgeId, objectKind: 'edge' })
            }
        }
        for (const groupId of this.session.getGroupIdsSnapshot()) {
            const box = this.readBox('group', groupId)
            if (box && diagramRectangleIntersectsBox(rectangle, box)) {
                identities.push({ objectId: groupId, objectKind: 'group' })
            }
        }

        return identities
    }

    private readBox(objectKind: 'group' | 'node', objectId: string): DiagramRectangle | null {
        const getField = objectKind === 'node'
            ? this.geometry.getNodeGeometryFieldSnapshot
            : this.geometry.getGroupGeometryFieldSnapshot
        const height = getField(objectId, 'height')
        const width = getField(objectId, 'width')
        const x = getField(objectId, 'x')
        const y = getField(objectId, 'y')
        if (height === null || width === null || x === null || y === null) return null

        return { height, width, x, y }
    }

    private requireSelectableIdentity(identity: DiagramSelectionIdentity) {
        if (!this.session.getSessionSnapshot()) throw new Error('Cannot select a diagram object without an active edit session')
        if (identity.objectKind === 'edge' && this.session.getEdgeSnapshot(identity.objectId)) return
        if (identity.objectKind === 'group' && this.session.getGroupSnapshot(identity.objectId)) return
        if (identity.objectKind === 'node' && this.session.getNodeSnapshot(identity.objectId)) return

        throw new Error(`Diagram ${identity.objectKind} ${identity.objectId} does not exist`)
    }

    private clearRectangle() {
        if (!this.rectangleStart && !this.rectangle) return false

        this.rectangleStart = null
        this.rectangle = null
        this.dispatchEvent(new Event(SELECTION_RECTANGLE_CHANGED_EVENT))

        return true
    }

    private setRectangle(rectangle: DiagramRectangle) {
        const current = this.rectangle
        if (current && current.height === rectangle.height && current.width === rectangle.width
            && current.x === rectangle.x && current.y === rectangle.y) return false

        this.rectangle = rectangle
        this.dispatchEvent(new Event(SELECTION_RECTANGLE_CHANGED_EVENT))

        return true
    }

    private publish(changedIdentities: readonly DiagramSelectionIdentity[]) {
        for (const identity of changedIdentities) this.dispatchEvent(new Event(selectedChangedEvent(identity)))
        this.dispatchEvent(new Event(SELECTION_MEMBERSHIP_CHANGED_EVENT))
    }

    private subscribe(eventType: string, listener: () => void) {
        this.addEventListener(eventType, listener)

        return () => this.removeEventListener(eventType, listener)
    }
}

export const diagramSelectionService = register('diagramSelectionService', new DiagramSelectionService())
