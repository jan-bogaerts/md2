import type { ProjectReference } from '../../data/data_types'
import { generateUuid } from '../../data/uuid'
import { register } from '../service_injector'
import type {
    DiagramConnectionPoint,
    DiagramData,
    DiagramEdge,
    DiagramEntityField,
    DiagramGroup,
    DiagramMeta,
    DiagramNode,
    DiagramSequenceFragment,
    DiagramSequenceFragmentRegion,
    DiagramSequenceOperator,
} from './diagram_data'
import type { DiagramRecord } from './diagram_index'
import { diagramViewService, type DiagramViewSourceSnapshot } from './diagram_view_service'

const DIRTY_CHANGED_EVENT = 'dirtyChanged'
const ORIGINAL_DIAGRAM_CHANGED_EVENT = 'originalDiagramChanged'
const SESSION_CHANGED_EVENT = 'sessionChanged'
const EMPTY_IDS: readonly string[] = Object.freeze([])
const MAX_ID_GENERATION_ATTEMPTS = 100

export type DiagramCollectionKind = 'edge' | 'fragment' | 'group' | 'node'
export type DiagramObjectKind = DiagramCollectionKind | 'connectionPoint' | 'entityField' | 'meta'
export type DiagramConnectionEndpoint = 'sourceAttachment' | 'targetAttachment'
export type MutableDiagramMetaField = 'description' | 'title'
export type MutableDiagramNodeField = Exclude<keyof DiagramNode, 'fields' | 'id'>
export type MutableDiagramEdgeField = Exclude<keyof DiagramEdge, 'id' | 'sourceAttachment' | 'targetAttachment' | 'waypoints'>
export type MutableDiagramGroupField = 'label'
export type MutableDiagramFragmentField = 'operator'
export type MutableDiagramEntityField = keyof DiagramEntityField
export type MutableDiagramConnectionPointField = keyof DiagramConnectionPoint

type DeepReadonly<Value> = Value extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : Value extends object
        ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
        : Value

export type ReadonlyDiagramData = DeepReadonly<DiagramData>

export type NewDiagramNode = Omit<DiagramNode, 'id'>
export type NewDiagramEdge = Omit<DiagramEdge, 'id'>
export type NewDiagramGroup = Omit<DiagramGroup, 'id'>
export type NewDiagramSequenceFragment = Omit<DiagramSequenceFragment, 'id'>

export interface DiagramEditSessionSnapshot {
    sourceDiagramId: string
}

export interface OriginalDiagramSnapshot {
    diagram: DiagramData
    record: DiagramRecord
}

/** Describes one collection-membership transaction: which member IDs entered or left which collection. */
export interface DiagramMembershipChangeDetail {
    addedIds: readonly string[]
    memberKind: DiagramCollectionKind
    ownerId: string | null
    regionIndex: number | null
    removedIds: readonly string[]
}

export interface DiagramFieldChangeDetail {
    field: string
    objectId: string
    objectKind: DiagramObjectKind
    previousValue: unknown
    value: unknown
}

interface DiagramSourceService {
    getSourceSnapshot(): DiagramViewSourceSnapshot | null
    subscribeSource(listener: () => void): () => void
}

function eventScope(value: string) {
    return encodeURIComponent(value)
}

function indexById<Item extends { id: string }>(items: Item[]) {
    return new Map(items.map((item) => [item.id, item]))
}

function asDeepReadonly<Value>(value: Value) {
    return value as DeepReadonly<Value>
}

export function diagramMetadataFieldChangedEvent(field: keyof DiagramMeta) {
    return `diagram:meta:diagram:${field}`
}

export function diagramObjectFieldChangedEvent(
    objectKind: DiagramCollectionKind,
    objectId: string,
    field: string,
) {
    return `diagram:${objectKind}:${eventScope(objectId)}:${field}`
}

export function diagramEntityFieldChangedEvent(nodeId: string, fieldIndex: number, field: keyof DiagramEntityField) {
    return `diagram:entityField:${eventScope(nodeId)}:${fieldIndex}:${field}`
}

export function diagramConnectionPointFieldChangedEvent(
    edgeId: string,
    endpoint: DiagramConnectionEndpoint,
    field: keyof DiagramConnectionPoint,
) {
    return `diagram:connectionPoint:${eventScope(edgeId)}:${endpoint}:${field}`
}

export function diagramCollectionMembershipChangedEvent(objectKind: DiagramCollectionKind) {
    return `diagram:${objectKind}:membership`
}

export function diagramGroupMembershipChangedEvent(groupId: string) {
    return `diagram:group:${eventScope(groupId)}:nodeIds`
}

export function diagramFragmentRegionMembershipChangedEvent(fragmentId: string, regionIndex: number) {
    return `diagram:fragment:${eventScope(fragmentId)}:regions:${regionIndex}:edgeIds`
}

interface PendingMembershipEvent {
    detail: DiagramMembershipChangeDetail
    eventName: string
}

function collectionMembershipEvent(
    memberKind: DiagramCollectionKind,
    addedIds: readonly string[],
    removedIds: readonly string[],
): PendingMembershipEvent {
    return {
        detail: { addedIds, memberKind, ownerId: null, regionIndex: null, removedIds },
        eventName: diagramCollectionMembershipChangedEvent(memberKind),
    }
}

function groupMembershipEvent(
    groupId: string,
    addedIds: readonly string[],
    removedIds: readonly string[],
): PendingMembershipEvent {
    return {
        detail: { addedIds, memberKind: 'node', ownerId: groupId, regionIndex: null, removedIds },
        eventName: diagramGroupMembershipChangedEvent(groupId),
    }
}

function fragmentRegionMembershipEvent(
    fragmentId: string,
    regionIndex: number,
    addedIds: readonly string[],
    removedIds: readonly string[],
): PendingMembershipEvent {
    return {
        detail: { addedIds, memberKind: 'edge', ownerId: fragmentId, regionIndex, removedIds },
        eventName: diagramFragmentRegionMembershipChangedEvent(fragmentId, regionIndex),
    }
}

function fragmentRegionKey(fragmentId: string, regionIndex: number) {
    return `${eventScope(fragmentId)}:${regionIndex}`
}

function frozenIds<Item extends { id: string }>(items: readonly Item[]) {
    return Object.freeze(items.map(({ id }) => id))
}

function requireLabel(label: string, objectKind: DiagramCollectionKind) {
    if (typeof label !== 'string' || label.trim().length === 0) {
        throw new Error(`Diagram ${objectKind} label must be a non-empty string`)
    }
}

function requireFragmentRegion(fragment: DiagramSequenceFragment, regionIndex: number) {
    const region = fragment.regions[regionIndex]
    if (!region) throw new Error(`Diagram fragment region ${fragment.id}[${regionIndex}] does not exist`)

    return region
}

/** Owns original and editable model data for one project's active diagram edit session. */
export class DiagramEditSessionService extends EventTarget {
    private readonly changedFields = new Set<string>()
    private readonly createId: () => string
    private dirty = false
    private edgesById = new Map<string, DiagramEdge>()
    private edgeIds: readonly string[] = EMPTY_IDS
    private editableDiagram: DiagramData | null = null
    private fragmentsById = new Map<string, DiagramSequenceFragment>()
    private fragmentIds: readonly string[] = EMPTY_IDS
    private fragmentRegionEdgeIdsByKey = new Map<string, readonly string[]>()
    private groupsById = new Map<string, DiagramGroup>()
    private groupIds: readonly string[] = EMPTY_IDS
    private groupNodeIdsById = new Map<string, readonly string[]>()
    private nodesById = new Map<string, DiagramNode>()
    private nodeIds: readonly string[] = EMPTY_IDS
    private originalDiagram: OriginalDiagramSnapshot | null = null
    private originalEdgesById = new Map<string, DiagramEdge>()
    private originalFragmentsById = new Map<string, DiagramSequenceFragment>()
    private originalGroupsById = new Map<string, DiagramGroup>()
    private originalNodesById = new Map<string, DiagramNode>()
    private projectKey: string | null = null
    private session: DiagramEditSessionSnapshot | null = null
    private readonly sourceService: DiagramSourceService
    private unsubscribeSource: (() => void) | null = null

    constructor(sourceService: DiagramSourceService = diagramViewService, createId: () => string = generateUuid) {
        super()
        this.createId = createId
        this.sourceService = sourceService
    }

    getDirtySnapshot = () => this.dirty

    /** Complete read boundary for persistence and agent processing; React must use granular snapshots. */
    getEditableDiagram = (): ReadonlyDiagramData | null => this.editableDiagram

    getOriginalDiagramSnapshot = () => this.originalDiagram

    getSessionSnapshot = () => this.session

    getEdgeIdsSnapshot = () => this.edgeIds

    getFragmentIdsSnapshot = () => this.fragmentIds

    getGroupIdsSnapshot = () => this.groupIds

    getNodeIdsSnapshot = () => this.nodeIds

    getGroupNodeIdsSnapshot = (groupId: string): readonly string[] | null => this.groupNodeIdsById.get(groupId) ?? null

    getFragmentRegionEdgeIdsSnapshot = (fragmentId: string, regionIndex: number): readonly string[] | null => (
        this.fragmentRegionEdgeIdsByKey.get(fragmentRegionKey(fragmentId, regionIndex)) ?? null
    )

    getMetadataFieldSnapshot = <Field extends keyof DiagramMeta>(field: Field): DeepReadonly<DiagramMeta[Field]> | null => (
        this.editableDiagram ? asDeepReadonly(this.editableDiagram.meta[field]) : null
    )

    getNodeSnapshot = (nodeId: string): DeepReadonly<DiagramNode> | null => this.findNode(nodeId)

    getNodeFieldSnapshot = <Field extends keyof DiagramNode>(nodeId: string, field: Field): DeepReadonly<DiagramNode[Field]> | null => {
        const node = this.findNode(nodeId)

        return node ? asDeepReadonly(node[field]) : null
    }

    getEdgeSnapshot = (edgeId: string): DeepReadonly<DiagramEdge> | null => this.findEdge(edgeId)

    getEdgeFieldSnapshot = <Field extends keyof DiagramEdge>(edgeId: string, field: Field): DeepReadonly<DiagramEdge[Field]> | null => {
        const edge = this.findEdge(edgeId)

        return edge ? asDeepReadonly(edge[field]) : null
    }

    getGroupSnapshot = (groupId: string): DeepReadonly<DiagramGroup> | null => this.findGroup(groupId)

    getGroupFieldSnapshot = <Field extends keyof DiagramGroup>(groupId: string, field: Field): DeepReadonly<DiagramGroup[Field]> | null => {
        const group = this.findGroup(groupId)

        return group ? asDeepReadonly(group[field]) : null
    }

    getFragmentSnapshot = (fragmentId: string): DeepReadonly<DiagramSequenceFragment> | null => this.findFragment(fragmentId)

    getFragmentFieldSnapshot = <Field extends keyof DiagramSequenceFragment>(
        fragmentId: string,
        field: Field,
    ): DeepReadonly<DiagramSequenceFragment[Field]> | null => {
        const fragment = this.findFragment(fragmentId)

        return fragment ? asDeepReadonly(fragment[field]) : null
    }

    getEntityFieldSnapshot = (nodeId: string, fieldIndex: number): DeepReadonly<DiagramEntityField> | null => (
        this.findNode(nodeId)?.fields?.[fieldIndex] ?? null
    )

    getEntityFieldValueSnapshot = <Field extends keyof DiagramEntityField>(
        nodeId: string,
        fieldIndex: number,
        field: Field,
    ): DeepReadonly<DiagramEntityField[Field]> | null => {
        const entityField = this.findNode(nodeId)?.fields?.[fieldIndex]

        return entityField ? asDeepReadonly(entityField[field]) : null
    }

    getConnectionPointSnapshot = (
        edgeId: string,
        endpoint: DiagramConnectionEndpoint,
    ): DeepReadonly<DiagramConnectionPoint> | null => this.findEdge(edgeId)?.[endpoint] ?? null

    getConnectionPointFieldSnapshot = <Field extends keyof DiagramConnectionPoint>(
        edgeId: string,
        endpoint: DiagramConnectionEndpoint,
        field: Field,
    ): DeepReadonly<DiagramConnectionPoint[Field]> | null => {
        const connectionPoint = this.findEdge(edgeId)?.[endpoint]

        return connectionPoint ? asDeepReadonly(connectionPoint[field]) : null
    }

    subscribeDirty = (listener: () => void) => this.subscribe(DIRTY_CHANGED_EVENT, listener)

    subscribeOriginalDiagram = (listener: () => void) => this.subscribe(ORIGINAL_DIAGRAM_CHANGED_EVENT, listener)

    subscribeSession = (listener: () => void) => this.subscribe(SESSION_CHANGED_EVENT, listener)

    subscribeMetadataField = (field: keyof DiagramMeta, listener: () => void) => (
        this.subscribe(diagramMetadataFieldChangedEvent(field), listener)
    )

    subscribeNodeField = (nodeId: string, field: keyof DiagramNode, listener: () => void) => (
        this.subscribe(diagramObjectFieldChangedEvent('node', nodeId, field), listener)
    )

    subscribeEdgeField = (edgeId: string, field: keyof DiagramEdge, listener: () => void) => (
        this.subscribe(diagramObjectFieldChangedEvent('edge', edgeId, field), listener)
    )

    subscribeGroupField = (groupId: string, field: keyof DiagramGroup, listener: () => void) => (
        this.subscribe(diagramObjectFieldChangedEvent('group', groupId, field), listener)
    )

    subscribeFragmentField = (fragmentId: string, field: keyof DiagramSequenceFragment, listener: () => void) => (
        this.subscribe(diagramObjectFieldChangedEvent('fragment', fragmentId, field), listener)
    )

    subscribeEntityField = (
        nodeId: string,
        fieldIndex: number,
        field: keyof DiagramEntityField,
        listener: () => void,
    ) => this.subscribe(diagramEntityFieldChangedEvent(nodeId, fieldIndex, field), listener)

    subscribeConnectionPointField = (
        edgeId: string,
        endpoint: DiagramConnectionEndpoint,
        field: keyof DiagramConnectionPoint,
        listener: () => void,
    ) => this.subscribe(diagramConnectionPointFieldChangedEvent(edgeId, endpoint, field), listener)

    subscribeCollectionMembership = (objectKind: DiagramCollectionKind, listener: () => void) => (
        this.subscribe(diagramCollectionMembershipChangedEvent(objectKind), listener)
    )

    subscribeGroupMembership = (groupId: string, listener: () => void) => (
        this.subscribe(diagramGroupMembershipChangedEvent(groupId), listener)
    )

    subscribeFragmentRegionMembership = (fragmentId: string, regionIndex: number, listener: () => void) => (
        this.subscribe(diagramFragmentRegionMembershipChangedEvent(fragmentId, regionIndex), listener)
    )

    bindProject(project: ProjectReference) {
        const projectKey = `${project.id}:${project.branch}`
        if (projectKey === this.projectKey) return

        this.discard()
        this.unsubscribeSource?.()
        this.projectKey = projectKey
        this.unsubscribeSource = this.sourceService.subscribeSource(this.handleSourceChange)
    }

    clear() {
        this.discard()
        this.unsubscribeSource?.()
        this.unsubscribeSource = null
        this.projectKey = null
    }

    /** Starts a fresh session from canonical model data for the active diagram record. */
    start() {
        if (!this.projectKey) throw new Error('Diagram edit session is not bound to a project')
        const source = this.sourceService.getSourceSnapshot()
        if (!source) throw new Error('Cannot start a diagram edit session without an active diagram')

        const originalDiagram = { diagram: source.diagram, record: source.record }
        const editableDiagram = structuredClone(source.diagram)
        const session = { sourceDiagramId: source.record.id }
        this.changedFields.clear()
        this.edgesById = indexById(editableDiagram.edges)
        this.fragmentsById = indexById(editableDiagram.fragments ?? [])
        this.groupsById = indexById(editableDiagram.groups)
        this.nodesById = indexById(editableDiagram.nodes)
        this.originalEdgesById = indexById(source.diagram.edges)
        this.originalFragmentsById = indexById(source.diagram.fragments ?? [])
        this.originalGroupsById = indexById(source.diagram.groups)
        this.originalNodesById = indexById(source.diagram.nodes)
        this.edgeIds = Object.freeze(editableDiagram.edges.map(({ id }) => id))
        this.fragmentIds = Object.freeze((editableDiagram.fragments ?? []).map(({ id }) => id))
        this.groupIds = Object.freeze(editableDiagram.groups.map(({ id }) => id))
        this.nodeIds = Object.freeze(editableDiagram.nodes.map(({ id }) => id))
        this.groupNodeIdsById = new Map(editableDiagram.groups.map((group) => [group.id, Object.freeze([...group.nodeIds])]))
        this.fragmentRegionEdgeIdsByKey = new Map((editableDiagram.fragments ?? []).flatMap((fragment) => (
            fragment.regions.map((region, index): [string, readonly string[]] => (
                [fragmentRegionKey(fragment.id, index), Object.freeze([...region.edgeIds])]
            ))
        )))
        this.publish({ dirty: false, editableDiagram, originalDiagram, session })
    }

    /** Ends the session and releases every session-owned reference. */
    discard() {
        this.changedFields.clear()
        this.edgesById.clear()
        this.fragmentsById.clear()
        this.groupsById.clear()
        this.nodesById.clear()
        this.originalEdgesById.clear()
        this.originalFragmentsById.clear()
        this.originalGroupsById.clear()
        this.originalNodesById.clear()
        this.edgeIds = EMPTY_IDS
        this.fragmentIds = EMPTY_IDS
        this.groupIds = EMPTY_IDS
        this.nodeIds = EMPTY_IDS
        this.groupNodeIdsById.clear()
        this.fragmentRegionEdgeIdsByKey.clear()
        this.publish({ dirty: false, editableDiagram: null, originalDiagram: null, session: null })
    }

    setMetadataField<Field extends MutableDiagramMetaField>(field: Field, value: DiagramMeta[Field]) {
        const diagram = this.requireEditableDiagram()
        const previousValue = diagram.meta[field]
        if (Object.is(previousValue, value)) return

        diagram.meta[field] = value
        const originalValue = this.originalDiagram?.diagram.meta[field]
        const eventName = diagramMetadataFieldChangedEvent(field)
        this.finishFieldChange(eventName, 'meta', 'diagram', field, originalValue, previousValue, value)
    }

    setNodeField<Field extends MutableDiagramNodeField>(nodeId: string, field: Field, value: DiagramNode[Field]) {
        const node = this.requireNode(nodeId)
        const previousValue = node[field]
        if (Object.is(previousValue, value)) return

        node[field] = value
        const originalValue = this.originalNodesById.get(nodeId)?.[field]
        const eventName = diagramObjectFieldChangedEvent('node', nodeId, field)
        this.finishFieldChange(eventName, 'node', nodeId, field, originalValue, previousValue, value)
    }

    setEdgeField<Field extends MutableDiagramEdgeField>(edgeId: string, field: Field, value: DiagramEdge[Field]) {
        const edge = this.requireEdge(edgeId)
        const previousValue = edge[field]
        if (Object.is(previousValue, value)) return

        edge[field] = value
        const originalValue = this.originalEdgesById.get(edgeId)?.[field]
        const eventName = diagramObjectFieldChangedEvent('edge', edgeId, field)
        this.finishFieldChange(eventName, 'edge', edgeId, field, originalValue, previousValue, value)
    }

    setGroupField<Field extends MutableDiagramGroupField>(groupId: string, field: Field, value: DiagramGroup[Field]) {
        const group = this.requireGroup(groupId)
        const previousValue = group[field]
        if (Object.is(previousValue, value)) return

        group[field] = value
        const originalValue = this.originalGroupsById.get(groupId)?.[field]
        const eventName = diagramObjectFieldChangedEvent('group', groupId, field)
        this.finishFieldChange(eventName, 'group', groupId, field, originalValue, previousValue, value)
    }

    setFragmentField<Field extends MutableDiagramFragmentField>(
        fragmentId: string,
        field: Field,
        value: DiagramSequenceFragment[Field],
    ) {
        const fragment = this.requireFragment(fragmentId)
        const previousValue = fragment[field]
        if (Object.is(previousValue, value)) return

        fragment[field] = value
        const originalValue = this.originalFragmentsById.get(fragmentId)?.[field]
        const eventName = diagramObjectFieldChangedEvent('fragment', fragmentId, field)
        this.finishFieldChange(eventName, 'fragment', fragmentId, field, originalValue, previousValue, value)
    }

    setEntityField<Field extends MutableDiagramEntityField>(
        nodeId: string,
        fieldIndex: number,
        field: Field,
        value: DiagramEntityField[Field],
    ) {
        const entityField = this.requireEntityField(nodeId, fieldIndex)
        const previousValue = entityField[field]
        if (Object.is(previousValue, value)) return

        entityField[field] = value
        const originalValue = this.originalNodesById.get(nodeId)?.fields?.[fieldIndex]?.[field]
        const objectId = `${nodeId}[${fieldIndex}]`
        const eventName = diagramEntityFieldChangedEvent(nodeId, fieldIndex, field)
        this.finishFieldChange(eventName, 'entityField', objectId, field, originalValue, previousValue, value)
    }

    setConnectionPointField<Field extends MutableDiagramConnectionPointField>(
        edgeId: string,
        endpoint: DiagramConnectionEndpoint,
        field: Field,
        value: DiagramConnectionPoint[Field],
    ) {
        const connectionPoint = this.requireConnectionPoint(edgeId, endpoint)
        const previousValue = connectionPoint[field]
        if (Object.is(previousValue, value)) return

        connectionPoint[field] = value
        const originalValue = this.originalEdgesById.get(edgeId)?.[endpoint]?.[field]
        const objectId = `${edgeId}:${endpoint}`
        const eventName = diagramConnectionPointFieldChangedEvent(edgeId, endpoint, field)
        this.finishFieldChange(eventName, 'connectionPoint', objectId, field, originalValue, previousValue, value)
    }


    /** Appends a new node and publishes a fresh node ID list; every existing object keeps its reference. */
    createNode(node: NewDiagramNode): string {
        const diagram = this.requireEditableDiagram()
        requireLabel(node.label, 'node')
        const id = this.generateSelectableId()
        const created: DiagramNode = { ...node, id }
        if (node.fields) created.fields = node.fields.map((field) => ({ ...field }))
        diagram.nodes.push(created)
        this.nodesById.set(id, created)
        this.nodeIds = frozenIds(diagram.nodes)
        this.markCollectionMembership('node', id, true)
        this.commitTransaction([collectionMembershipEvent('node', [id], [])])

        return id
    }

    /** Removes a node, its incident edges, and every group and fragment reference to them in one transaction. */
    removeNode(nodeId: string): boolean {
        const diagram = this.requireEditableDiagram()
        const node = this.findNode(nodeId)
        if (!node) return false

        const events: PendingMembershipEvent[] = []
        const removedEdgeIds = diagram.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId).map(({ id }) => id)
        for (const edgeId of removedEdgeIds) this.detachEdge(edgeId, events)
        if (removedEdgeIds.length > 0) {
            this.edgeIds = frozenIds(diagram.edges)
            events.push(collectionMembershipEvent('edge', [], removedEdgeIds))
        }
        for (const group of diagram.groups) this.detachGroupMember(group, nodeId, events)
        diagram.nodes.splice(diagram.nodes.indexOf(node), 1)
        this.nodesById.delete(nodeId)
        this.nodeIds = frozenIds(diagram.nodes)
        this.purgeChangedFields(`diagram:node:${eventScope(nodeId)}:`)
        this.purgeChangedFields(`diagram:entityField:${eventScope(nodeId)}:`)
        this.markCollectionMembership('node', nodeId, false)
        events.unshift(collectionMembershipEvent('node', [], [nodeId]))
        this.commitTransaction(events)

        return true
    }

    createEdge(edge: NewDiagramEdge): string {
        const diagram = this.requireEditableDiagram()
        this.requireNode(edge.from)
        this.requireNode(edge.to)
        const id = this.generateSelectableId()
        const created: DiagramEdge = { ...edge, id }
        if (edge.sourceAttachment) created.sourceAttachment = { ...edge.sourceAttachment }
        if (edge.targetAttachment) created.targetAttachment = { ...edge.targetAttachment }
        if (edge.waypoints) created.waypoints = edge.waypoints.map((waypoint) => ({ ...waypoint }))
        diagram.edges.push(created)
        this.edgesById.set(id, created)
        this.edgeIds = frozenIds(diagram.edges)
        this.markCollectionMembership('edge', id, true)
        this.commitTransaction([collectionMembershipEvent('edge', [id], [])])

        return id
    }

    /** Removes an edge and drops it from every fragment region that referenced it. */
    removeEdge(edgeId: string): boolean {
        const diagram = this.requireEditableDiagram()
        if (!this.findEdge(edgeId)) return false

        const events: PendingMembershipEvent[] = []
        this.detachEdge(edgeId, events)
        this.edgeIds = frozenIds(diagram.edges)
        events.unshift(collectionMembershipEvent('edge', [], [edgeId]))
        this.commitTransaction(events)

        return true
    }

    createGroup(group: NewDiagramGroup): string {
        const diagram = this.requireEditableDiagram()
        requireLabel(group.label, 'group')
        const nodeIds = this.requireOwnedNodeIds(group.nodeIds)
        const id = this.generateObjectId((candidate) => this.groupsById.has(candidate))
        const created: DiagramGroup = { ...group, id, nodeIds }
        diagram.groups.push(created)
        this.groupsById.set(id, created)
        this.groupIds = frozenIds(diagram.groups)
        this.groupNodeIdsById.set(id, Object.freeze([...nodeIds]))
        this.markCollectionMembership('group', id, true)
        this.commitTransaction([collectionMembershipEvent('group', [id], [])])

        return id
    }

    /** Removes a group only; its member nodes and their edges stay untouched. */
    removeGroup(groupId: string): boolean {
        const diagram = this.requireEditableDiagram()
        const group = this.findGroup(groupId)
        if (!group) return false

        diagram.groups.splice(diagram.groups.indexOf(group), 1)
        this.groupsById.delete(groupId)
        this.groupNodeIdsById.delete(groupId)
        this.groupIds = frozenIds(diagram.groups)
        this.purgeChangedFields(`diagram:group:${eventScope(groupId)}:`)
        this.markCollectionMembership('group', groupId, false)
        this.commitTransaction([collectionMembershipEvent('group', [], [groupId])])

        return true
    }

    createFragment(fragment: NewDiagramSequenceFragment): string {
        const diagram = this.requireEditableDiagram()
        if (diagram.meta.type !== 'sequence') throw new Error('Diagram fragments are only allowed on sequence diagrams')
        const regions = this.requireOwnedRegions(fragment.operator, fragment.regions)
        const id = this.generateObjectId((candidate) => this.fragmentsById.has(candidate))
        const created: DiagramSequenceFragment = { id, operator: fragment.operator, regions }
        if (!diagram.fragments) diagram.fragments = []
        diagram.fragments.push(created)
        this.fragmentsById.set(id, created)
        this.fragmentIds = frozenIds(diagram.fragments)
        regions.forEach((region, index) => {
            this.fragmentRegionEdgeIdsByKey.set(fragmentRegionKey(id, index), Object.freeze([...region.edgeIds]))
        })
        this.markCollectionMembership('fragment', id, true)
        this.commitTransaction([collectionMembershipEvent('fragment', [id], [])])

        return id
    }

    /** Removes a fragment only; the edges its regions referenced stay in the diagram. */
    removeFragment(fragmentId: string): boolean {
        const diagram = this.requireEditableDiagram()
        const fragment = this.findFragment(fragmentId)
        if (!fragment || !diagram.fragments) return false

        diagram.fragments.splice(diagram.fragments.indexOf(fragment), 1)
        this.fragmentsById.delete(fragmentId)
        for (let index = 0; index < fragment.regions.length; index += 1) {
            this.fragmentRegionEdgeIdsByKey.delete(fragmentRegionKey(fragmentId, index))
        }
        this.fragmentIds = frozenIds(diagram.fragments)
        this.purgeChangedFields(`diagram:fragment:${eventScope(fragmentId)}:`)
        this.markCollectionMembership('fragment', fragmentId, false)
        this.commitTransaction([collectionMembershipEvent('fragment', [], [fragmentId])])

        return true
    }

    /** Adds one node to one group; the node object and every other collection keep their references. */
    addGroupMember(groupId: string, nodeId: string): boolean {
        const group = this.requireGroup(groupId)
        this.requireNode(nodeId)
        if (group.nodeIds.includes(nodeId)) return false

        group.nodeIds.push(nodeId)
        this.groupNodeIdsById.set(groupId, Object.freeze([...group.nodeIds]))
        this.markGroupMembership(groupId, nodeId, true)
        this.commitTransaction([groupMembershipEvent(groupId, [nodeId], [])])

        return true
    }

    removeGroupMember(groupId: string, nodeId: string): boolean {
        const group = this.requireGroup(groupId)
        const events: PendingMembershipEvent[] = []
        if (!this.detachGroupMember(group, nodeId, events)) return false

        this.commitTransaction(events)

        return true
    }

    addFragmentRegionEdge(fragmentId: string, regionIndex: number, edgeId: string): boolean {
        const fragment = this.requireFragment(fragmentId)
        const region = requireFragmentRegion(fragment, regionIndex)
        this.requireEdge(edgeId)
        if (fragment.regions.some((item) => item.edgeIds.includes(edgeId))) return false

        region.edgeIds.push(edgeId)
        this.fragmentRegionEdgeIdsByKey.set(fragmentRegionKey(fragmentId, regionIndex), Object.freeze([...region.edgeIds]))
        this.markFragmentRegionMembership(fragmentId, regionIndex, edgeId, true)
        this.commitTransaction([fragmentRegionMembershipEvent(fragmentId, regionIndex, [edgeId], [])])

        return true
    }

    removeFragmentRegionEdge(fragmentId: string, regionIndex: number, edgeId: string): boolean {
        const fragment = this.requireFragment(fragmentId)
        requireFragmentRegion(fragment, regionIndex)
        const events: PendingMembershipEvent[] = []
        if (!this.detachFragmentRegionEdge(fragment, regionIndex, edgeId, events)) return false

        this.commitTransaction(events)

        return true
    }

    private readonly handleSourceChange = () => {
        if (!this.session) return
        const sourceDiagramId = this.sourceService.getSourceSnapshot()?.record.id ?? null
        if (sourceDiagramId !== this.session.sourceDiagramId) this.discard()
    }

    private findNode(nodeId: string) {
        return this.nodesById.get(nodeId) ?? null
    }

    private findEdge(edgeId: string) {
        return this.edgesById.get(edgeId) ?? null
    }

    private findGroup(groupId: string) {
        return this.groupsById.get(groupId) ?? null
    }

    private findFragment(fragmentId: string) {
        return this.fragmentsById.get(fragmentId) ?? null
    }

    private requireEditableDiagram() {
        if (!this.editableDiagram) throw new Error('Diagram edit session is not active')

        return this.editableDiagram
    }

    private requireNode(nodeId: string) {
        this.requireEditableDiagram()
        const node = this.findNode(nodeId)
        if (!node) throw new Error(`Diagram node ${nodeId} does not exist`)

        return node
    }

    private requireEdge(edgeId: string) {
        this.requireEditableDiagram()
        const edge = this.findEdge(edgeId)
        if (!edge) throw new Error(`Diagram edge ${edgeId} does not exist`)

        return edge
    }

    private requireGroup(groupId: string) {
        this.requireEditableDiagram()
        const group = this.findGroup(groupId)
        if (!group) throw new Error(`Diagram group ${groupId} does not exist`)

        return group
    }

    private requireFragment(fragmentId: string) {
        this.requireEditableDiagram()
        const fragment = this.findFragment(fragmentId)
        if (!fragment) throw new Error(`Diagram fragment ${fragmentId} does not exist`)

        return fragment
    }

    private requireEntityField(nodeId: string, fieldIndex: number) {
        const node = this.requireNode(nodeId)
        const entityField = node.fields?.[fieldIndex]
        if (!entityField) throw new Error(`Diagram entity field ${nodeId}[${fieldIndex}] does not exist`)

        return entityField
    }

    private requireConnectionPoint(edgeId: string, endpoint: DiagramConnectionEndpoint) {
        const edge = this.requireEdge(edgeId)
        const connectionPoint = edge[endpoint]
        if (!connectionPoint) throw new Error(`Diagram connection point ${edgeId}:${endpoint} does not exist`)

        return connectionPoint
    }


    /** Generates an ID that collides with no node and no edge, because both share one selection namespace. */
    private generateSelectableId() {
        return this.generateObjectId((candidate) => this.nodesById.has(candidate) || this.edgesById.has(candidate))
    }

    private generateObjectId(taken: (candidate: string) => boolean) {
        for (let attempt = 0; attempt < MAX_ID_GENERATION_ATTEMPTS; attempt += 1) {
            const candidate = this.createId()
            if (candidate && !taken(candidate)) return candidate
        }

        throw new Error('Could not generate a collision-free diagram object id')
    }

    private requireOwnedNodeIds(nodeIds: readonly string[]) {
        const owned: string[] = []
        for (const nodeId of nodeIds) {
            this.requireNode(nodeId)
            if (owned.includes(nodeId)) throw new Error(`Diagram group member ${nodeId} is duplicated`)
            owned.push(nodeId)
        }

        return owned
    }

    private requireOwnedRegions(operator: DiagramSequenceOperator, regions: readonly DiagramSequenceFragmentRegion[]) {
        const requiredRegionCount = operator === 'alt' ? 2 : 1
        if (regions.length !== requiredRegionCount) {
            throw new Error(`Diagram fragment operator ${operator} requires ${requiredRegionCount} regions`)
        }
        const seenEdgeIds = new Set<string>()

        return regions.map((region): DiagramSequenceFragmentRegion => ({
            edgeIds: region.edgeIds.map((edgeId) => {
                this.requireEdge(edgeId)
                if (seenEdgeIds.has(edgeId)) throw new Error(`Diagram fragment region edge ${edgeId} is duplicated`)
                seenEdgeIds.add(edgeId)

                return edgeId
            }),
            guard: region.guard,
        }))
    }

    /** Removes one edge, its fragment references, and its change entries without publishing the edge ID list. */
    private detachEdge(edgeId: string, events: PendingMembershipEvent[]) {
        const diagram = this.requireEditableDiagram()
        const edge = this.findEdge(edgeId)
        if (!edge) return false

        for (const fragment of diagram.fragments ?? []) {
            for (let index = 0; index < fragment.regions.length; index += 1) {
                this.detachFragmentRegionEdge(fragment, index, edgeId, events)
            }
        }
        diagram.edges.splice(diagram.edges.indexOf(edge), 1)
        this.edgesById.delete(edgeId)
        this.purgeChangedFields(`diagram:edge:${eventScope(edgeId)}:`)
        this.purgeChangedFields(`diagram:connectionPoint:${eventScope(edgeId)}:`)
        this.markCollectionMembership('edge', edgeId, false)

        return true
    }

    private detachGroupMember(group: DiagramGroup, nodeId: string, events: PendingMembershipEvent[]) {
        const memberIndex = group.nodeIds.indexOf(nodeId)
        if (memberIndex < 0) return false

        group.nodeIds.splice(memberIndex, 1)
        this.groupNodeIdsById.set(group.id, Object.freeze([...group.nodeIds]))
        this.markGroupMembership(group.id, nodeId, false)
        events.push(groupMembershipEvent(group.id, [], [nodeId]))

        return true
    }

    private detachFragmentRegionEdge(
        fragment: DiagramSequenceFragment,
        regionIndex: number,
        edgeId: string,
        events: PendingMembershipEvent[],
    ) {
        const region = fragment.regions[regionIndex]
        const edgeIndex = region?.edgeIds.indexOf(edgeId) ?? -1
        if (!region || edgeIndex < 0) return false

        region.edgeIds.splice(edgeIndex, 1)
        this.fragmentRegionEdgeIdsByKey.set(
            fragmentRegionKey(fragment.id, regionIndex),
            Object.freeze([...region.edgeIds]),
        )
        this.markFragmentRegionMembership(fragment.id, regionIndex, edgeId, false)
        events.push(fragmentRegionMembershipEvent(fragment.id, regionIndex, [], [edgeId]))

        return true
    }

    private originalCollectionIds(objectKind: DiagramCollectionKind) {
        if (objectKind === 'edge') return this.originalEdgesById
        if (objectKind === 'fragment') return this.originalFragmentsById
        if (objectKind === 'group') return this.originalGroupsById

        return this.originalNodesById
    }

    private markCollectionMembership(objectKind: DiagramCollectionKind, objectId: string, present: boolean) {
        const key = `${diagramCollectionMembershipChangedEvent(objectKind)}:${eventScope(objectId)}`
        this.markChange(key, present === this.originalCollectionIds(objectKind).has(objectId))
    }

    private markGroupMembership(groupId: string, nodeId: string, present: boolean) {
        const key = `${diagramGroupMembershipChangedEvent(groupId)}:${eventScope(nodeId)}`
        const originalPresent = this.originalGroupsById.get(groupId)?.nodeIds.includes(nodeId) ?? false
        this.markChange(key, present === originalPresent)
    }

    private markFragmentRegionMembership(fragmentId: string, regionIndex: number, edgeId: string, present: boolean) {
        const key = `${diagramFragmentRegionMembershipChangedEvent(fragmentId, regionIndex)}:${eventScope(edgeId)}`
        const originalRegion = this.originalFragmentsById.get(fragmentId)?.regions[regionIndex]
        this.markChange(key, present === (originalRegion?.edgeIds.includes(edgeId) ?? false))
    }

    private markChange(key: string, matchesOriginal: boolean) {
        if (matchesOriginal) this.changedFields.delete(key)
        else this.changedFields.add(key)
    }

    /** Drops every change entry owned by a removed object, so its identity leaves no dirty residue. */
    private purgeChangedFields(keyPrefix: string) {
        for (const key of this.changedFields) {
            if (key.startsWith(keyPrefix)) this.changedFields.delete(key)
        }
    }

    /** Publishes one mutation transaction: the dirty transition first, then every membership event it caused. */
    private commitTransaction(events: readonly PendingMembershipEvent[]) {
        const dirty = this.changedFields.size > 0
        if (dirty !== this.dirty) {
            this.dirty = dirty
            this.dispatchEvent(new Event(DIRTY_CHANGED_EVENT))
        }
        for (const { detail, eventName } of events) {
            this.dispatchEvent(new CustomEvent<DiagramMembershipChangeDetail>(eventName, { detail }))
        }
    }

    private finishFieldChange(
        eventName: string,
        objectKind: DiagramObjectKind,
        objectId: string,
        field: string,
        originalValue: unknown,
        previousValue: unknown,
        value: unknown,
    ) {
        if (Object.is(originalValue, value)) this.changedFields.delete(eventName)
        else this.changedFields.add(eventName)
        const dirty = this.changedFields.size > 0
        if (dirty !== this.dirty) {
            this.dirty = dirty
            this.dispatchEvent(new Event(DIRTY_CHANGED_EVENT))
        }
        const detail = { field, objectId, objectKind, previousValue, value }
        this.dispatchEvent(new CustomEvent<DiagramFieldChangeDetail>(eventName, { detail }))
    }

    private publish(next: {
        dirty: boolean
        editableDiagram: DiagramData | null
        originalDiagram: OriginalDiagramSnapshot | null
        session: DiagramEditSessionSnapshot | null
    }) {
        const dirtyChanged = next.dirty !== this.dirty
        const originalDiagramChanged = next.originalDiagram !== this.originalDiagram
        const sessionChanged = next.session !== this.session
        this.dirty = next.dirty
        this.editableDiagram = next.editableDiagram
        this.originalDiagram = next.originalDiagram
        this.session = next.session
        if (dirtyChanged) this.dispatchEvent(new Event(DIRTY_CHANGED_EVENT))
        if (originalDiagramChanged) this.dispatchEvent(new Event(ORIGINAL_DIAGRAM_CHANGED_EVENT))
        if (sessionChanged) this.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    }

    private subscribe(eventType: string, listener: () => void) {
        this.addEventListener(eventType, listener)

        return () => this.removeEventListener(eventType, listener)
    }
}

export const diagramEditSessionService = register('diagramEditSessionService', new DiagramEditSessionService())
