import { register } from '../service_injector'
import type {
    DiagramData,
    DiagramEdge,
    DiagramGroup,
    DiagramNode,
    DiagramSequenceFragment,
    DiagramWaypoint,
} from './diagram_data'
import {
    diagramEditSessionService,
    type DiagramConnectionEndpoint,
    type DiagramEditSessionService,
} from './diagram_edit_session_service'
import {
    edgeGeometry,
    groupBox,
    layout,
    nodeActivations,
    nodeFanIn,
    nodeGeometry,
    sequenceFragmentBox,
    surfaceSize,
    type PositionedDiagramEdge,
    type PositionedDiagramGroup,
    type PositionedDiagramLabel,
    type PositionedDiagramNode,
    type PositionedSequenceActivation,
    type PositionedSequenceFragment,
} from './diagram_layout'

const GEOMETRY_SESSION_EVENT = 'geometry:session'
const SURFACE_ID = 'surface'
const ACTIVATION_BOTTOM_MARGIN = 24
const MAXIMUM_FRAGMENT_REGION_COUNT = 2
const EMPTY_IDS: readonly string[] = Object.freeze([])
const EMPTY_ROUTE: readonly DiagramWaypoint[] = Object.freeze([])
const EMPTY_GUARDS: readonly { guard: string, y: number }[] = Object.freeze([])
const NODE_GEOMETRY_FIELDS = ['fanIn', 'height', 'width', 'x', 'y'] as const
const BOX_FIELDS = ['height', 'width', 'x', 'y'] as const
const GEOMETRY_NODE_FIELDS = ['height', 'width', 'x', 'y'] as const
const GEOMETRY_EDGE_FIELDS = ['from', 'kind', 'label', 'to', 'waypoints'] as const
const CONNECTION_POINT_FIELDS = ['nodeId', 'offset', 'side'] as const
const CONNECTION_ENDPOINTS: readonly DiagramConnectionEndpoint[] = ['sourceAttachment', 'targetAttachment']

export type DiagramGeometryObjectKind = 'activation' | 'edge' | 'fragment' | 'group' | 'node' | 'surface'
export type PositionedNodeField = typeof NODE_GEOMETRY_FIELDS[number]
export type PositionedBoxField = typeof BOX_FIELDS[number]
export type PositionedEdgeField = 'labelPlacement' | 'points'
export type PositionedFragmentField = 'dividerY' | 'guardPositions' | PositionedBoxField

export interface DiagramSurfaceSize {
    height: number
    width: number
}

function eventScope(value: string) {
    return encodeURIComponent(value)
}

export function diagramGeometryFieldChangedEvent(
    objectKind: DiagramGeometryObjectKind,
    objectId: string,
    field: string,
) {
    return `geometry:${objectKind}:${eventScope(objectId)}:${field}`
}

export function diagramGeometryMembershipChangedEvent(objectKind: DiagramGeometryObjectKind) {
    return `geometry:${objectKind}:membership`
}

function sameRoute(left: readonly DiagramWaypoint[], right: readonly DiagramWaypoint[]) {
    return left.length === right.length && left.every((point, index) => point.x === right[index].x && point.y === right[index].y)
}

function sameLabelPlacement(left: PositionedDiagramLabel | undefined, right: PositionedDiagramLabel | undefined) {
    if (!left || !right) return left === right

    return left.height === right.height && left.textX === right.textX && left.textY === right.textY
        && left.width === right.width && left.x === right.x && left.y === right.y
}

function sameGuardPositions(
    left: readonly { guard: string, y: number }[],
    right: readonly { guard: string, y: number }[],
) {
    return left.length === right.length && left.every((entry, index) => entry.guard === right[index].guard && entry.y === right[index].y)
}

function activationOwnerId(activationId: string) {
    return activationId.slice(0, activationId.indexOf(':'))
}

/**
 * Owns the derived geometry of the active edit session. `layout` builds the first positioned view when a session
 * starts; every later edit updates only the objects whose dependencies changed and dispatches one scoped event per
 * field that actually changed value.
 */
export class DiagramGeometryService extends EventTarget {
    private activationIds: readonly string[] = EMPTY_IDS
    private readonly activationsById = new Map<string, PositionedSequenceActivation>()
    private diagram: DiagramData | null = null
    private edgeIds: readonly string[] = EMPTY_IDS
    private readonly edgesById = new Map<string, PositionedDiagramEdge>()
    private readonly editSession: DiagramEditSessionService
    private readonly fragmentsById = new Map<string, PositionedSequenceFragment>()
    private fragmentIds: readonly string[] = EMPTY_IDS
    private readonly groupsById = new Map<string, PositionedDiagramGroup>()
    private readonly nodesById = new Map<string, PositionedDiagramNode>()
    private objectUnsubscribes: (() => void)[] = []
    private surface: DiagramSurfaceSize = { height: 0, width: 0 }

    constructor(editSession: DiagramEditSessionService = diagramEditSessionService) {
        super()
        this.editSession = editSession
        this.editSession.subscribeSession(this.handleSessionChanged)
        this.editSession.subscribeCollectionMembership('node', this.handleNodeMembershipChanged)
        this.editSession.subscribeCollectionMembership('edge', this.handleEdgeMembershipChanged)
        this.editSession.subscribeCollectionMembership('group', this.handleGroupMembershipChanged)
        this.editSession.subscribeCollectionMembership('fragment', this.handleFragmentMembershipChanged)
        this.handleSessionChanged()
    }

    getNodeGeometryFieldSnapshot = (nodeId: string, field: PositionedNodeField): number | null => (
        this.nodesById.get(nodeId)?.[field] ?? null
    )

    getEdgeRouteSnapshot = (edgeId: string): readonly DiagramWaypoint[] => (
        this.edgesById.get(edgeId)?.points ?? EMPTY_ROUTE
    )

    getEdgeLabelPlacementSnapshot = (edgeId: string): PositionedDiagramLabel | null => (
        this.edgesById.get(edgeId)?.labelPlacement ?? null
    )

    getGroupGeometryFieldSnapshot = (groupId: string, field: PositionedBoxField): number | null => (
        this.groupsById.get(groupId)?.[field] ?? null
    )

    getActivationIdsSnapshot = () => this.activationIds

    getActivationFieldSnapshot = (activationId: string, field: PositionedBoxField): number | null => (
        this.activationsById.get(activationId)?.[field] ?? null
    )

    getFragmentIdsSnapshot = () => this.fragmentIds

    getFragmentGeometryFieldSnapshot = (fragmentId: string, field: PositionedBoxField): number | null => (
        this.fragmentsById.get(fragmentId)?.[field] ?? null
    )

    getFragmentDividerSnapshot = (fragmentId: string): number | null => this.fragmentsById.get(fragmentId)?.dividerY ?? null

    getFragmentGuardPositionsSnapshot = (fragmentId: string): readonly { guard: string, y: number }[] => (
        this.fragmentsById.get(fragmentId)?.guardPositions ?? EMPTY_GUARDS
    )

    getSurfaceFieldSnapshot = (field: keyof DiagramSurfaceSize) => this.surface[field]

    subscribeNodeGeometryField = (nodeId: string, field: PositionedNodeField, listener: () => void) => (
        this.subscribe(diagramGeometryFieldChangedEvent('node', nodeId, field), listener)
    )

    subscribeEdgeGeometryField = (edgeId: string, field: PositionedEdgeField, listener: () => void) => (
        this.subscribe(diagramGeometryFieldChangedEvent('edge', edgeId, field), listener)
    )

    subscribeGroupGeometryField = (groupId: string, field: PositionedBoxField, listener: () => void) => (
        this.subscribe(diagramGeometryFieldChangedEvent('group', groupId, field), listener)
    )

    subscribeActivationField = (activationId: string, field: PositionedBoxField, listener: () => void) => (
        this.subscribe(diagramGeometryFieldChangedEvent('activation', activationId, field), listener)
    )

    subscribeFragmentGeometryField = (fragmentId: string, field: PositionedFragmentField, listener: () => void) => (
        this.subscribe(diagramGeometryFieldChangedEvent('fragment', fragmentId, field), listener)
    )

    subscribeSurfaceField = (field: keyof DiagramSurfaceSize, listener: () => void) => (
        this.subscribe(diagramGeometryFieldChangedEvent('surface', SURFACE_ID, field), listener)
    )

    subscribeActivationIds = (listener: () => void) => (
        this.subscribe(diagramGeometryMembershipChangedEvent('activation'), listener)
    )

    subscribeFragmentIds = (listener: () => void) => (
        this.subscribe(diagramGeometryMembershipChangedEvent('fragment'), listener)
    )

    /** Wakes every subscriber once when a session starts or ends and the whole positioned view is replaced. */
    subscribeGeometrySession = (listener: () => void) => this.subscribe(GEOMETRY_SESSION_EVENT, listener)

    /** Rebuilds the positioned view from one full layout. This is the load path, never the edit path. */
    private readonly handleSessionChanged = () => {
        this.releaseObjectSubscriptions()
        this.activationsById.clear()
        this.edgesById.clear()
        this.fragmentsById.clear()
        this.groupsById.clear()
        this.nodesById.clear()
        this.activationIds = EMPTY_IDS
        this.fragmentIds = EMPTY_IDS
        this.edgeIds = EMPTY_IDS
        // Derived geometry reads model data and never writes it, so the session's read boundary is safe to narrow here.
        const diagram = this.editSession.getEditableDiagram() as DiagramData | null
        this.diagram = diagram
        if (!diagram) {
            this.surface = { height: 0, width: 0 }
            this.dispatchEvent(new Event(diagramGeometryMembershipChangedEvent('activation')))
            this.dispatchEvent(new Event(diagramGeometryMembershipChangedEvent('fragment')))
            this.dispatchEvent(new Event(GEOMETRY_SESSION_EVENT))

            return
        }

        const positioned = layout(diagram)
        for (const node of positioned.nodes) this.nodesById.set(node.id, node)
        for (const edge of positioned.edges) this.edgesById.set(edge.id, edge)
        for (const group of positioned.groups) this.groupsById.set(group.id, group)
        for (const activation of positioned.activations) this.activationsById.set(activation.id, activation)
        for (const fragment of positioned.fragments) this.fragmentsById.set(fragment.id, fragment)
        this.activationIds = Object.freeze(positioned.activations.map(({ id }) => id))
        this.edgeIds = Object.freeze(positioned.edges.map(({ id }) => id))
        this.fragmentIds = Object.freeze(positioned.fragments.map(({ id }) => id))
        this.surface = { height: positioned.height, width: positioned.width }
        this.subscribeDiagramObjects()
        this.dispatchEvent(new Event(diagramGeometryMembershipChangedEvent('activation')))
        this.dispatchEvent(new Event(diagramGeometryMembershipChangedEvent('fragment')))
        this.dispatchEvent(new Event(GEOMETRY_SESSION_EVENT))
    }

    private subscribeDiagramObjects() {
        const diagram = this.requireDiagram()
        for (const node of diagram.nodes) this.subscribeNode(node)
        for (const edge of diagram.edges) this.subscribeEdge(edge)
        for (const group of diagram.groups) this.subscribeGroup(group)
        for (const fragment of diagram.fragments ?? []) this.subscribeFragment(fragment)
    }

    private subscribeNode(node: DiagramNode) {
        for (const field of GEOMETRY_NODE_FIELDS) {
            this.objectUnsubscribes.push(this.editSession.subscribeNodeField(node.id, field, () => this.applyNodeChange(node.id)))
        }
        this.objectUnsubscribes.push(this.editSession.subscribeEntityFieldMembership(node.id, () => this.applyNodeChange(node.id)))
    }

    private subscribeEdge(edge: DiagramEdge) {
        for (const field of GEOMETRY_EDGE_FIELDS) {
            this.objectUnsubscribes.push(this.editSession.subscribeEdgeField(edge.id, field, () => this.applyEdgeChange(edge.id)))
        }
        for (const endpoint of CONNECTION_ENDPOINTS) {
            for (const field of CONNECTION_POINT_FIELDS) {
                this.objectUnsubscribes.push(this.editSession.subscribeConnectionPointField(
                    edge.id,
                    endpoint,
                    field,
                    () => this.applyEdgeChange(edge.id),
                ))
            }
        }
    }

    private subscribeGroup(group: DiagramGroup) {
        for (const field of GEOMETRY_NODE_FIELDS) {
            this.objectUnsubscribes.push(this.editSession.subscribeGroupField(group.id, field, () => this.applyGroupChange(group.id)))
        }
    }

    private subscribeFragment(fragment: DiagramSequenceFragment) {
        const refresh = () => this.applyFragmentChange(fragment.id)
        this.objectUnsubscribes.push(this.editSession.subscribeFragmentField(fragment.id, 'operator', refresh))
        for (let regionIndex = 0; regionIndex < MAXIMUM_FRAGMENT_REGION_COUNT; regionIndex += 1) {
            this.objectUnsubscribes.push(this.editSession.subscribeFragmentRegionField(fragment.id, regionIndex, 'guard', refresh))
            this.objectUnsubscribes.push(this.editSession.subscribeFragmentRegionMembership(fragment.id, regionIndex, refresh))
        }
    }

    private releaseObjectSubscriptions() {
        for (const unsubscribe of this.objectUnsubscribes) unsubscribe()
        this.objectUnsubscribes = []
    }

    /** Re-derives one node, then only the objects that depend on it: incident routes, its activations, the surface. */
    private applyNodeChange(nodeId: string) {
        const diagram = this.requireDiagram()
        const model = diagram.nodes.find(({ id }) => id === nodeId)
        const positioned = this.nodesById.get(nodeId)
        if (!model || !positioned) return

        const next = nodeGeometry(diagram, model, positioned.x, positioned.y)
        const changedFields = NODE_GEOMETRY_FIELDS
            .filter((field) => this.assignField('node', nodeId, positioned, field, next[field]))
        if (changedFields.length === 0) return

        for (const edge of diagram.edges) {
            if (edge.from === nodeId || edge.to === nodeId) this.rerouteEdge(edge)
        }
        this.refreshSequenceDependents([nodeId])
        this.refreshSurface()
    }

    /** Re-derives one edge route and label, plus endpoint fan-in and the sequence objects that read its row. */
    private applyEdgeChange(edgeId: string) {
        const diagram = this.requireDiagram()
        const model = diagram.edges.find(({ id }) => id === edgeId)
        if (!model) return

        const { changed, endpointIds } = this.rerouteEdge(model)
        for (const endpointId of endpointIds) this.refreshFanIn(endpointId)
        if (!changed) return

        this.refreshSequenceDependents(endpointIds)
        this.refreshSurface()
    }

    private applyGroupChange(groupId: string) {
        const diagram = this.requireDiagram()
        const model = diagram.groups.find(({ id }) => id === groupId)
        const positioned = this.groupsById.get(groupId)
        if (!model || !positioned) return

        const next = groupBox(model, this.nodesById)
        const changedFields = BOX_FIELDS.filter((field) => this.assignField('group', groupId, positioned, field, next[field]))
        if (changedFields.length === 0) return

        this.refreshSurface()
    }

    private applyFragmentChange(fragmentId: string) {
        const fragment = (this.requireDiagram().fragments ?? []).find(({ id }) => id === fragmentId)
        if (!fragment) return

        this.refreshFragment(fragment)
        this.refreshSurface()
    }

    /** Routes one edge against current node positions and reports the endpoints it touches and whether it changed. */
    private rerouteEdge(model: DiagramEdge): { changed: boolean, endpointIds: string[] } {
        const diagram = this.requireDiagram()
        const positioned = this.edgesById.get(model.id)
        if (!positioned) return { changed: false, endpointIds: [] }

        const priorEdges = this.positionedEdgesInModelOrder(diagram).filter(({ id }) => id !== model.id)
        const { labelPlacement, points } = edgeGeometry(diagram, model, this.nodesById, priorEdges)
        const previousEndpoints = [positioned.from, positioned.to]
        const routeChanged = !sameRoute(positioned.points, points)
        const labelChanged = !sameLabelPlacement(positioned.labelPlacement, labelPlacement)
        positioned.from = model.from
        positioned.to = model.to
        positioned.kind = model.kind
        positioned.label = model.label
        if (routeChanged) {
            positioned.points = points
            this.dispatchEvent(new Event(diagramGeometryFieldChangedEvent('edge', model.id, 'points')))
        }
        if (labelChanged) {
            positioned.labelPlacement = labelPlacement
            this.dispatchEvent(new Event(diagramGeometryFieldChangedEvent('edge', model.id, 'labelPlacement')))
        }

        return {
            changed: routeChanged || labelChanged,
            endpointIds: [...new Set([...previousEndpoints, model.from, model.to])],
        }
    }

    private refreshFanIn(nodeId: string) {
        const positioned = this.nodesById.get(nodeId)
        if (!positioned) return

        this.assignField('node', nodeId, positioned, 'fanIn', nodeFanIn(this.requireDiagram().edges, nodeId))
    }

    /** Updates the sequence objects whose coordinates read the affected participants' rows. */
    private refreshSequenceDependents(participantIds: readonly string[]) {
        const diagram = this.requireDiagram()
        if (diagram.meta.type !== 'sequence') return

        for (const participantId of participantIds) this.refreshActivations(participantId)
        for (const fragment of diagram.fragments ?? []) this.refreshFragment(fragment)
    }

    private refreshActivations(participantId: string) {
        const node = this.nodesById.get(participantId)
        const diagram = this.requireDiagram()
        const bottom = this.surface.height - ACTIVATION_BOTTOM_MARGIN
        const previousIds = [...this.activationsById.keys()].filter((id) => activationOwnerId(id) === participantId)
        const rows = this.positionedEdgesInModelOrder(diagram)
        const next = node ? nodeActivations(node, rows, bottom) : []
        for (const activation of next) {
            const positioned = this.activationsById.get(activation.id)
            if (!positioned) {
                this.activationsById.set(activation.id, activation)

                continue
            }
            for (const field of BOX_FIELDS) this.assignField('activation', activation.id, positioned, field, activation[field])
        }
        const nextIds = new Set(next.map(({ id }) => id))
        for (const activationId of previousIds) {
            if (!nextIds.has(activationId)) this.activationsById.delete(activationId)
        }
        this.refreshActivationIds(previousIds, nextIds)
    }

    private refreshActivationIds(previousIds: readonly string[], nextIds: Set<string>) {
        const unchanged = previousIds.length === nextIds.size && previousIds.every((id) => nextIds.has(id))
        if (unchanged) return

        this.activationIds = Object.freeze([...this.activationsById.keys()])
        this.dispatchEvent(new Event(diagramGeometryMembershipChangedEvent('activation')))
    }

    private refreshFragment(fragment: DiagramSequenceFragment) {
        const positioned = this.fragmentsById.get(fragment.id)
        if (!positioned) return
        if (fragment.regions.some(({ edgeIds }) => edgeIds.length === 0)) return

        const edges = fragment.regions.flatMap(({ edgeIds }) => edgeIds)
            .map((edgeId) => this.edgesById.get(edgeId))
            .filter((edge): edge is PositionedDiagramEdge => !!edge)
        if (edges.length === 0) return

        const next = sequenceFragmentBox(fragment, edges, this.nodesById)
        for (const field of BOX_FIELDS) this.assignField('fragment', fragment.id, positioned, field, next[field])
        this.assignField('fragment', fragment.id, positioned, 'dividerY', next.dividerY)
        if (sameGuardPositions(positioned.guardPositions, next.guardPositions)) return

        positioned.guardPositions = next.guardPositions
        this.dispatchEvent(new Event(diagramGeometryFieldChangedEvent('fragment', fragment.id, 'guardPositions')))
    }

    /**
     * Measures the surface from the positioned objects the service already owns and assigns `width` and `height`
     * only when they actually change, so an edit inside the current bounds notifies nothing.
     */
    private refreshSurface() {
        const { height, width } = surfaceSize(
            [...this.nodesById.values()],
            [...this.edgesById.values()],
            [...this.groupsById.values()],
            [...this.fragmentsById.values()],
            [...this.activationsById.values()],
        )
        if (height !== this.surface.height) {
            this.surface.height = height
            this.dispatchEvent(new Event(diagramGeometryFieldChangedEvent('surface', SURFACE_ID, 'height')))
        }
        if (width === this.surface.width) return

        this.surface.width = width
        this.dispatchEvent(new Event(diagramGeometryFieldChangedEvent('surface', SURFACE_ID, 'width')))
    }

    private readonly handleNodeMembershipChanged = () => {
        const diagram = this.requireDiagram()
        const modelIds = new Set(diagram.nodes.map(({ id }) => id))
        for (const nodeId of [...this.nodesById.keys()]) {
            if (!modelIds.has(nodeId)) this.removeNodeGeometry(nodeId)
        }
        for (const node of diagram.nodes) {
            if (!this.nodesById.has(node.id)) this.addNodeGeometry(node)
        }
        this.refreshSurface()
    }

    private addNodeGeometry(node: DiagramNode) {
        const diagram = this.requireDiagram()
        this.nodesById.set(node.id, nodeGeometry(diagram, node, this.surface.width, this.surface.height))
        this.subscribeNode(node)
    }

    private removeNodeGeometry(nodeId: string) {
        this.nodesById.delete(nodeId)
        const removedIds = [...this.activationsById.keys()].filter((id) => activationOwnerId(id) === nodeId)
        for (const activationId of removedIds) this.activationsById.delete(activationId)
        this.refreshActivationIds(removedIds, new Set())
    }

    private readonly handleEdgeMembershipChanged = () => {
        const diagram = this.requireDiagram()
        const nextEdgeIds = diagram.edges.map(({ id }) => id)
        const maximumEdgeCount = Math.max(this.edgeIds.length, nextEdgeIds.length)
        const firstChangedRow = Array.from({ length: maximumEdgeCount })
            .findIndex((_value, index) => this.edgeIds[index] !== nextEdgeIds[index])
        const modelIds = new Set(diagram.edges.map(({ id }) => id))
        for (const edgeId of [...this.edgesById.keys()]) {
            if (!modelIds.has(edgeId)) this.edgesById.delete(edgeId)
        }
        const addedEdges = diagram.edges.filter(({ id }) => !this.edgesById.has(id))
        for (const edge of addedEdges) this.addEdgeGeometry(edge)
        this.edgeIds = Object.freeze(nextEdgeIds)
        this.refreshSequenceRows(firstChangedRow)
        for (const node of diagram.nodes) this.refreshFanIn(node.id)
        this.refreshSequenceDependents(diagram.nodes.map(({ id }) => id))
        this.refreshSurface()
    }

    private addEdgeGeometry(edge: DiagramEdge) {
        const diagram = this.requireDiagram()
        const priorEdges = [...this.edgesById.values()]
        const { labelPlacement, points } = edgeGeometry(diagram, edge, this.nodesById, priorEdges)
        this.edgesById.set(edge.id, { ...edge, ...(labelPlacement ? { labelPlacement } : {}), points })
        this.subscribeEdge(edge)
    }

    /** A sequence row is its message index, so adding or removing a message moves only the rows below it. */
    private refreshSequenceRows(firstChangedRow: number) {
        const diagram = this.requireDiagram()
        if (diagram.meta.type !== 'sequence' || firstChangedRow < 0) return

        for (const edge of diagram.edges.slice(firstChangedRow)) this.rerouteEdge(edge)
    }

    private readonly handleGroupMembershipChanged = () => {
        const diagram = this.requireDiagram()
        const modelIds = new Set(diagram.groups.map(({ id }) => id))
        for (const groupId of [...this.groupsById.keys()]) {
            if (!modelIds.has(groupId)) this.groupsById.delete(groupId)
        }
        for (const group of diagram.groups) {
            if (this.groupsById.has(group.id)) continue
            this.groupsById.set(group.id, groupBox(group, this.nodesById))
            this.subscribeGroup(group)
        }
        this.refreshSurface()
    }

    private readonly handleFragmentMembershipChanged = () => {
        const diagram = this.requireDiagram()
        const fragments = diagram.fragments ?? []
        const modelIds = new Set(fragments.map(({ id }) => id))
        for (const fragmentId of [...this.fragmentsById.keys()]) {
            if (!modelIds.has(fragmentId)) this.fragmentsById.delete(fragmentId)
        }
        for (const fragment of fragments) {
            if (this.fragmentsById.has(fragment.id)) continue
            const edges = fragment.regions.flatMap(({ edgeIds }) => edgeIds)
                .map((edgeId) => this.edgesById.get(edgeId))
                .filter((edge): edge is PositionedDiagramEdge => !!edge)
            if (edges.length > 0) {
                this.fragmentsById.set(fragment.id, sequenceFragmentBox(fragment, edges, this.nodesById))
                this.subscribeFragment(fragment)
            }
        }
        this.fragmentIds = Object.freeze([...this.fragmentsById.keys()])
        this.dispatchEvent(new Event(diagramGeometryMembershipChangedEvent('fragment')))
        this.refreshSurface()
    }

    /** Assigns one derived field and reports whether it actually changed, so callers can skip dependent work. */
    private assignField<Target extends object, Field extends Extract<keyof Target, string>>(
        objectKind: DiagramGeometryObjectKind,
        objectId: string,
        target: Target,
        field: Field,
        value: Target[Field],
    ) {
        if (Object.is(target[field], value)) return false

        target[field] = value
        this.dispatchEvent(new Event(diagramGeometryFieldChangedEvent(objectKind, objectId, field)))

        return true
    }

    /** Lists the positioned edges in model order, which is also the sequence row order. */
    private positionedEdgesInModelOrder(diagram: DiagramData) {
        return diagram.edges.map(({ id }) => this.edgesById.get(id))
            .filter((edge): edge is PositionedDiagramEdge => !!edge)
    }

    private requireDiagram() {
        if (!this.diagram) throw new Error('Diagram geometry has no active edit session')

        return this.diagram
    }

    private subscribe(eventType: string, listener: () => void) {
        this.addEventListener(eventType, listener)

        return () => this.removeEventListener(eventType, listener)
    }
}

export const diagramGeometryService = register('diagramGeometryService', new DiagramGeometryService())
