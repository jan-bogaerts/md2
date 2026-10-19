import { register } from '../service_injector'
import {
    diagramEditSessionService,
    type DiagramEditSessionAccess,
} from './diagram_edit_session_service'
import type {
    DiagramCollectionKind,
    DiagramMembershipChangeDetail,
} from './diagram_edit_types'
import { diagramGeometryService, type DiagramGeometryService } from './diagram_geometry_service'
import {
    diagramRectangleBetween,
    diagramRectangleIntersectsBox,
    diagramRectangleIntersectsQuadraticCurve,
    diagramRectangleIntersectsRoute,
    type DiagramPoint,
    type DiagramRectangle,
} from './diagram_rectangle_selection'

const SELECTION_MEMBERSHIP_CHANGED_EVENT = 'selection:membership'
const SELECTION_RECTANGLE_CHANGED_EVENT = 'selection:rectangle'
const SELECTION_BOUNDARY_CHANGED_EVENT = 'selection:boundary'
const EMPTY_SELECTION: readonly DiagramSelectionIdentity[] = Object.freeze([])

export type DiagramSelectableObjectKind = Extract<DiagramCollectionKind, 'edge' | 'group' | 'node'>

export interface DiagramSelectionIdentity {
    objectId: string
    objectKind: DiagramSelectableObjectKind
}

type DiagramSelectionSession = DiagramEditSessionAccess<'getEdgeSnapshot' | 'getEdgeIdsSnapshot' | 'getGroupSnapshot' | 'getGroupIdsSnapshot' | 'getNodeSnapshot' | 'getNodeIdsSnapshot' | 'getSessionSnapshot' | 'getMetadataFieldSnapshot' | 'getActiveToolSnapshot' | 'subscribeActiveTool' | 'subscribeCollectionMembershipWillChange' | 'subscribeSession', 'removeObjects'>

type DiagramSelectionGeometry = Pick<
    DiagramGeometryService,
    | 'getEdgeControlPointSnapshot' | 'getEdgeRouteSnapshot' | 'getGroupGeometryFieldSnapshot' | 'getNodeGeometryFieldSnapshot'
    | 'subscribeEdgeGeometryField' | 'subscribeGroupGeometryField' | 'subscribeNodeGeometryField' | 'subscribeGeometrySession'
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
    private boundary: DiagramRectangle | null = null
    private boundaryUnsubscribes: (() => void)[] = []
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
        this.session.read.subscribeActiveTool(this.handleActiveToolChange)
        this.session.read.subscribeSession(this.handleSessionChange)
        this.session.read.subscribeCollectionMembershipWillChange('edge', this.handleCollectionMembershipWillChange)
        this.session.read.subscribeCollectionMembershipWillChange('group', this.handleCollectionMembershipWillChange)
        this.session.read.subscribeCollectionMembershipWillChange('node', this.handleCollectionMembershipWillChange)
        this.geometry.subscribeGeometrySession(this.updateBoundary)
    }

    getSelectionSnapshot = () => this.selection

    getRectangleSnapshot = () => this.rectangle

    getBoundarySnapshot = () => this.boundary

    getSelectedSnapshot = (identity: DiagramSelectionIdentity) => this.isSelected(identity)

    isSelected(identity: DiagramSelectionIdentity) {
        return this.selectedKeys.has(selectionKey(identity))
    }

    subscribeSelection = (listener: () => void) => this.subscribe(SELECTION_MEMBERSHIP_CHANGED_EVENT, listener)

    subscribeRectangle = (listener: () => void) => this.subscribe(SELECTION_RECTANGLE_CHANGED_EVENT, listener)

    subscribeBoundary = (listener: () => void) => this.subscribe(SELECTION_BOUNDARY_CHANGED_EVENT, listener)

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

    /** Deletes complete current selection through one edit-session mutation batch. */
    deleteSelection() {
        if (this.selection.length === 0) return false

        return this.session.removeObjects(this.selection)
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
        if (this.session.read.getActiveToolSnapshot() !== 'select') this.clearRectangle()
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
        for (const nodeId of this.session.read.getNodeIdsSnapshot()) {
            const box = this.readBox('node', nodeId)
            if (box && diagramRectangleIntersectsBox(rectangle, box)) {
                identities.push({ objectId: nodeId, objectKind: 'node' })
            }
        }
        const isMindmap = this.session.read.getMetadataFieldSnapshot('type') === 'mindmap'
        for (const edgeId of this.session.read.getEdgeIdsSnapshot()) {
            const route = this.geometry.getEdgeRouteSnapshot(edgeId)
            const controlPoint = isMindmap ? this.geometry.getEdgeControlPointSnapshot(edgeId) : null
            const intersects = isMindmap
                ? !!controlPoint && route.length === 2
                    && diagramRectangleIntersectsQuadraticCurve(rectangle, route[0], controlPoint, route[1])
                : diagramRectangleIntersectsRoute(rectangle, route)
            if (intersects) {
                identities.push({ objectId: edgeId, objectKind: 'edge' })
            }
        }
        for (const groupId of this.session.read.getGroupIdsSnapshot()) {
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
        if (!this.session.read.getSessionSnapshot()) throw new Error('Cannot select a diagram object without an active edit session')
        if (identity.objectKind === 'edge' && this.session.read.getEdgeSnapshot(identity.objectId)) return
        if (identity.objectKind === 'group' && this.session.read.getGroupSnapshot(identity.objectId)) return
        if (identity.objectKind === 'node' && this.session.read.getNodeSnapshot(identity.objectId)) return

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
        this.bindBoundaryGeometry()
        this.updateBoundary()
        for (const identity of changedIdentities) this.dispatchEvent(new Event(selectedChangedEvent(identity)))
        this.dispatchEvent(new Event(SELECTION_MEMBERSHIP_CHANGED_EVENT))
    }

    private bindBoundaryGeometry() {
        this.boundaryUnsubscribes.forEach((unsubscribe) => unsubscribe())
        this.boundaryUnsubscribes = []
        if (this.selection.length < 2) return
        for (const { objectId, objectKind } of this.selection) {
            if (objectKind === 'edge') {
                this.boundaryUnsubscribes.push(this.geometry.subscribeEdgeGeometryField(objectId, 'points', this.updateBoundary))
                this.boundaryUnsubscribes.push(this.geometry.subscribeEdgeGeometryField(objectId, 'controlPoint', this.updateBoundary))
                continue
            }
            for (const field of ['x', 'y', 'width', 'height'] as const) {
                const subscribe = objectKind === 'node'
                    ? this.geometry.subscribeNodeGeometryField
                    : this.geometry.subscribeGroupGeometryField
                this.boundaryUnsubscribes.push(subscribe(objectId, field, this.updateBoundary))
            }
        }
    }

    private updateBoundary = () => {
        let left = Infinity
        let top = Infinity
        let right = -Infinity
        let bottom = -Infinity
        if (this.selection.length > 1) {
            for (const { objectId, objectKind } of this.selection) {
                if (objectKind === 'edge') {
                    const route = this.geometry.getEdgeRouteSnapshot(objectId)
                    const controlPoint = this.geometry.getEdgeControlPointSnapshot(objectId)
                    for (const point of controlPoint ? [...route, controlPoint] : route) {
                        left = Math.min(left, point.x)
                        top = Math.min(top, point.y)
                        right = Math.max(right, point.x)
                        bottom = Math.max(bottom, point.y)
                    }
                    continue
                }
                const box = this.readBox(objectKind, objectId)
                if (!box) continue
                left = Math.min(left, box.x)
                top = Math.min(top, box.y)
                right = Math.max(right, box.x + box.width)
                bottom = Math.max(bottom, box.y + box.height)
            }
        }
        const next = Number.isFinite(left) ? { x: left, y: top, width: right - left, height: bottom - top } : null
        const current = this.boundary
        if (current?.x === next?.x && current?.y === next?.y
            && current?.width === next?.width && current?.height === next?.height) return
        this.boundary = next
        this.dispatchEvent(new Event(SELECTION_BOUNDARY_CHANGED_EVENT))
    }

    private subscribe(eventType: string, listener: () => void) {
        this.addEventListener(eventType, listener)

        return () => this.removeEventListener(eventType, listener)
    }
}

export const diagramSelectionService = register('diagramSelectionService', new DiagramSelectionService())
