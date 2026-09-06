import type { ProjectReference } from '../../data/data_types'
import { generateUuid } from '../../data/uuid'
import { dialogService } from '../dialog_service'
import { register } from '../service_injector'
import {
    DIAGRAM_CARDINALITIES,
    DIAGRAM_CONNECTION_SIDES,
    DIAGRAM_EDGE_KINDS,
    DIAGRAM_ROLES,
    optionalDiagramBoolean,
    optionalDiagramEnum,
    optionalDiagramString,
    requireDiagramEdgeKind,
    requireDiagramEdgeLabel,
    requireDiagramEnum,
    requireDiagramFragmentRegionCount,
    requireDiagramGridNumber,
    requireDiagramNodeKind,
    requireDiagramRelativeOffset,
    requireDiagramString,
    type DiagramConnectionPoint,
    type DiagramData,
    type DiagramEdge,
    type DiagramEntityField,
    type DiagramGroup,
    type DiagramLegendEntryData,
    type DiagramMeta,
    type DiagramNode,
    type DiagramNodeKind,
    type DiagramEdgeKind,
    type DiagramRole,
    type DiagramSequenceFragment,
    type DiagramSequenceFragmentRegion,
    type DiagramSequenceOperator,
} from './diagram_data'
import type { DiagramRecord } from './diagram_index'
import { diagramViewService, type DiagramViewSourceSnapshot } from './diagram_view_service'

const DIRTY_CHANGED_EVENT = 'dirtyChanged'
const CHANGE_IDS_CHANGED_EVENT = 'changeIdsChanged'
const ORIGINAL_DIAGRAM_CHANGED_EVENT = 'originalDiagramChanged'
const SAVED_RECORD_CHANGED_EVENT = 'savedRecordChanged'
const SESSION_CHANGED_EVENT = 'sessionChanged'
const TOOLBOX_SECTION_CHANGED_EVENT = 'toolboxSectionChanged'
const ACTIVE_TOOL_CHANGED_EVENT = 'activeToolChanged'
const TRANSIENT_GESTURE_CHANGED_EVENT = 'transientGestureChanged'
const VIEWPORT_SCALE_CHANGED_EVENT = 'viewportScaleChanged'
const EMPTY_IDS: readonly string[] = Object.freeze([])
const MAX_ID_GENERATION_ATTEMPTS = 100

export const DEFAULT_DIAGRAM_ZOOM = 1
export const DIAGRAM_ZOOM_STEP = 0.25
export const MINIMUM_DIAGRAM_ZOOM = 0.5
export const MAXIMUM_DIAGRAM_ZOOM = 2

export type DiagramCollectionKind = 'edge' | 'fragment' | 'group' | 'node'
export type DiagramObjectKind = DiagramCollectionKind | 'connectionPoint' | 'entityField' | 'legendEntry' | 'meta'
export type DiagramRemovableObjectKind = Extract<DiagramCollectionKind, 'edge' | 'group' | 'node'>
export type DiagramConnectionEndpoint = 'sourceAttachment' | 'targetAttachment'
export type DiagramToolboxSection = 'edit' | 'nodes' | 'edges' | 'groups' | 'others'
export type DiagramPersistentTool = 'select' | 'group' | `node:${DiagramNodeKind}` | `edge:${DiagramEdgeKind}`
export type DiagramTransientGesture = 'placement' | 'edge' | 'group' | 'move' | 'resize'
export type MutableDiagramMetaField = 'description' | 'title'
export type MutableDiagramLegendEntryField = 'label'
export type MutableDiagramNodeField = Exclude<keyof DiagramNode, 'fields' | 'id'>
export type MutableDiagramEdgeField = Exclude<keyof DiagramEdge, 'id' | 'sourceAttachment' | 'targetAttachment' | 'waypoints'>
export type MutableDiagramGroupField = Exclude<keyof DiagramGroup, 'id' | 'nodeIds'>
export type MutableDiagramFragmentField = 'operator'
export type MutableDiagramFragmentRegionField = 'guard'
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
export type NewDiagramLegendEntry = { label?: string, role: DiagramRole } | { kind: DiagramEdgeKind, label?: string }

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

/** Describes one legend membership transaction: which entry keys entered or left the explicit legend. */
export interface DiagramLegendMembershipChangeDetail {
    addedKeys: readonly string[]
    removedKeys: readonly string[]
}

export interface DiagramEntityFieldMembershipChangeDetail {
    addedIndexes: readonly number[]
    nodeId: string
    removedIndexes: readonly number[]
}

export interface DiagramRemovalIdentity {
    objectId: string
    objectKind: DiagramRemovableObjectKind
}

export interface DiagramPasteFragment {
    edges: readonly (ReadonlyDiagramData['edges'][number])[]
    fragments: readonly (NonNullable<ReadonlyDiagramData['fragments']>[number])[]
    groups: readonly (ReadonlyDiagramData['groups'][number])[]
    nodes: readonly (ReadonlyDiagramData['nodes'][number])[]
}

export interface DiagramPasteResult {
    identities: readonly DiagramRemovalIdentity[]
}

export interface DiagramFieldChangeDetail {
    field: string
    objectId: string
    objectKind: DiagramObjectKind
    previousValue: unknown
    value: unknown
}

export type DiagramChangeCategory = 'collection' | 'field' | 'membership'

/** One net semantic difference between original and editable diagram state. */
export interface DiagramChange {
    category: DiagramChangeCategory
    field: string | null
    id: string
    objectId: string
    objectKind: DiagramObjectKind
    originalValue: unknown
    ownerId: string | null
    regionIndex: number | null
    value: unknown
}

export type DiagramChangeField = keyof DiagramChange

interface DiagramSourceService {
    getSourceSnapshot(): DiagramViewSourceSnapshot | null
    subscribeSource(listener: () => void): () => void
}

type DiagramEditErrorReporter = (message: string) => void

function reportDiagramEditError(message: string) {
    dialogService.displayError(message, { title: 'Diagram edit rejected' })
}

function invalidDiagramField(field: string, reason: string): never {
    throw new Error(`Malformed diagram data: ${field} has ${reason}`)
}

function validationMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)

    return message.replace(/^Malformed diagram data: /u, '')
}

function requireOptionalGridNumber(value: unknown, field: string, positive = false) {
    if (value !== undefined) requireDiagramGridNumber(value, field, positive)
}

function requireEntityFieldValue(field: keyof DiagramEntityField, value: unknown, fieldPath: string) {
    if (field === 'key') optionalDiagramEnum(value, ['primary', 'foreign'], fieldPath)
    if (field === 'name') requireDiagramString(value, fieldPath)
    if (field === 'type') optionalDiagramString(value, fieldPath)
}

function validateConnectionPointValue(
    edge: DiagramEdge,
    endpoint: DiagramConnectionEndpoint,
    field: MutableDiagramConnectionPointField,
    value: unknown,
) {
    const fieldPath = `edges.${edge.id}.${endpoint}.${field}`
    if (field === 'nodeId') {
        const nodeId = requireDiagramString(value, fieldPath)
        const expectedNodeId = endpoint === 'sourceAttachment' ? edge.from : edge.to
        if (nodeId !== expectedNodeId) invalidDiagramField(fieldPath, `node ${nodeId} does not match endpoint ${expectedNodeId}`)
    }
    if (field === 'offset') requireDiagramRelativeOffset(value, fieldPath)
    if (field === 'side') requireDiagramEnum(value, DIAGRAM_CONNECTION_SIDES, fieldPath)
}

function validateNewGroup(group: NewDiagramGroup) {
    requireDiagramString(group.label, 'groups.new.label')
    requireOptionalGridNumber(group.height, 'groups.new.height', true)
    requireOptionalGridNumber(group.width, 'groups.new.width', true)
    requireOptionalGridNumber(group.x, 'groups.new.x')
    requireOptionalGridNumber(group.y, 'groups.new.y')
}

function validateNewLegendEntry(entry: NewDiagramLegendEntry) {
    if ('role' in entry) requireDiagramEnum(entry.role, DIAGRAM_ROLES, 'meta.legend.new.role')
    else requireDiagramEnum(entry.kind, DIAGRAM_EDGE_KINDS, 'meta.legend.new.kind')
    if (entry.label !== undefined) requireDiagramString(entry.label, 'meta.legend.new.label')
}

function canonicalLegendLabel(entry: NewDiagramLegendEntry) {
    return entry.label?.trim() || ('role' in entry ? entry.role : entry.kind)
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

export function diagramEntityFieldMembershipChangedEvent(nodeId: string) {
    return `diagram:entityField:${eventScope(nodeId)}:membership`
}

export function diagramConnectionPointFieldChangedEvent(
    edgeId: string,
    endpoint: DiagramConnectionEndpoint,
    field: keyof DiagramConnectionPoint,
) {
    return `diagram:connectionPoint:${eventScope(edgeId)}:${endpoint}:${field}`
}

/** Stable identity of one legend entry: its semantic, because the file format gives entries no ID. */
export function diagramLegendEntryKey(entry: DiagramLegendEntryData) {
    return 'role' in entry ? `node:${entry.role}` : `connection:${entry.kind}`
}

export function diagramLegendMembershipChangedEvent() {
    return 'diagram:legendEntry:membership'
}

export function diagramLegendEntryFieldChangedEvent(entryKey: string, field: keyof DiagramLegendEntryData | 'order') {
    return `diagram:legendEntry:${eventScope(entryKey)}:${field}`
}

export function diagramCollectionMembershipChangedEvent(objectKind: DiagramCollectionKind) {
    return `diagram:${objectKind}:membership`
}

export function diagramCollectionMembershipWillChangeEvent(objectKind: DiagramCollectionKind) {
    return `diagram:${objectKind}:membership:willChange`
}

export function diagramGroupMembershipChangedEvent(groupId: string) {
    return `diagram:group:${eventScope(groupId)}:nodeIds`
}

export function diagramFragmentRegionMembershipChangedEvent(fragmentId: string, regionIndex: number) {
    return `diagram:fragment:${eventScope(fragmentId)}:regions:${regionIndex}:edgeIds`
}

export function diagramFragmentRegionFieldChangedEvent(
    fragmentId: string,
    regionIndex: number,
    field: keyof DiagramSequenceFragmentRegion,
) {
    return `diagram:fragment:${eventScope(fragmentId)}:regions:${regionIndex}:${field}`
}

export function diagramChangeFieldChangedEvent(changeId: string, field: DiagramChangeField) {
    return `diagram:change:${eventScope(changeId)}:${field}`
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

function sameOrderedValues<Value>(left: readonly Value[], right: readonly Value[]) {
    return left.length === right.length && left.every((value, index) => value === right[index])
}

function requireFragmentRegion(fragment: DiagramSequenceFragment, regionIndex: number) {
    const region = fragment.regions[regionIndex]
    if (!region) throw new Error(`Diagram fragment region ${fragment.id}[${regionIndex}] does not exist`)

    return region
}

/** Owns original and editable model data for one project's active diagram edit session. */
export class DiagramEditSessionService extends EventTarget {
    private activeTool: DiagramPersistentTool = 'select'
    private activeToolboxSection: DiagramToolboxSection = 'edit'
    private changeIds: readonly string[] = EMPTY_IDS
    private readonly changeIdsByOwner = new Map<string, Set<string>>()
    private changeIdsChangedPending = false
    private changeBaselineDiagram: DiagramData | null = null
    private readonly changeOwnerById = new Map<string, string>()
    private readonly changesById = new Map<string, DiagramChange>()
    private readonly createId: () => string
    private dirty = false
    private edgesById = new Map<string, DiagramEdge>()
    private edgeIds: readonly string[] = EMPTY_IDS
    private editableDiagram: DiagramData | null = null
    private entityFieldIndexesByNodeId = new Map<string, readonly number[]>()
    private fragmentsById = new Map<string, DiagramSequenceFragment>()
    private fragmentIds: readonly string[] = EMPTY_IDS
    private fragmentRegionEdgeIdsByKey = new Map<string, readonly string[]>()
    private groupsById = new Map<string, DiagramGroup>()
    private legendEntryKeys: readonly string[] = EMPTY_IDS
    private originalLegendEntryKeys: readonly string[] = EMPTY_IDS
    private groupIds: readonly string[] = EMPTY_IDS
    private groupNodeIdsById = new Map<string, readonly string[]>()
    private nodesById = new Map<string, DiagramNode>()
    private nodeIds: readonly string[] = EMPTY_IDS
    private originalDiagram: OriginalDiagramSnapshot | null = null
    private originalEdgesById = new Map<string, DiagramEdge>()
    private originalFragmentsById = new Map<string, DiagramSequenceFragment>()
    private originalGroupsById = new Map<string, DiagramGroup>()
    private originalNodesById = new Map<string, DiagramNode>()
    private readonly pendingChangeFieldEvents = new Map<string, Set<DiagramChangeField>>()
    private projectKey: string | null = null
    private readonly reportValidationError: DiagramEditErrorReporter
    private session: DiagramEditSessionSnapshot | null = null
    private savedRecord: DiagramRecord | null = null
    private readonly sourceService: DiagramSourceService
    private transientGesture: DiagramTransientGesture | null = null
    private unsubscribeSource: (() => void) | null = null
    private viewportScale = DEFAULT_DIAGRAM_ZOOM

    constructor(
        sourceService: DiagramSourceService = diagramViewService,
        createId: () => string = generateUuid,
        reportValidationError: DiagramEditErrorReporter = reportDiagramEditError,
    ) {
        super()
        this.createId = createId
        this.reportValidationError = reportValidationError
        this.sourceService = sourceService
    }

    getDirtySnapshot = () => this.dirty

    getActiveToolSnapshot = () => this.activeTool

    getActiveToolboxSectionSnapshot = () => this.activeToolboxSection

    getTransientGestureSnapshot = () => this.transientGesture

    getViewportScaleSnapshot = () => this.viewportScale

    getChangeIdsSnapshot = () => this.changeIds

    /** Complete change read boundary for review generation; React must use granular change-field snapshots. */
    getChange = (changeId: string): DeepReadonly<DiagramChange> | null => {
        const change = this.changesById.get(changeId)

        return change ? asDeepReadonly(change) : null
    }

    getChangeFieldSnapshot = <Field extends DiagramChangeField>(
        changeId: string,
        field: Field,
    ): DeepReadonly<DiagramChange[Field]> | null => {
        const change = this.changesById.get(changeId)

        return change ? asDeepReadonly(change[field]) : null
    }

    /** Complete read boundary for persistence and agent processing; React must use granular snapshots. */
    getEditableDiagram = (): ReadonlyDiagramData | null => this.editableDiagram

    getOriginalDiagramSnapshot = () => this.originalDiagram

    getSavedRecordSnapshot = () => this.savedRecord

    getSessionSnapshot = () => this.session

    getEdgeIdsSnapshot = () => this.edgeIds

    getFragmentIdsSnapshot = () => this.fragmentIds

    getGroupIdsSnapshot = () => this.groupIds

    getNodeIdsSnapshot = () => this.nodeIds

    /** Ordered legend membership view; entries themselves are read one field at a time. */
    getLegendEntryKeysSnapshot = () => this.legendEntryKeys

    getLegendEntryFieldSnapshot = <Field extends 'kind' | 'label' | 'role'>(
        entryKey: string,
        field: Field,
    ): string | null => {
        const entry = this.findLegendEntry(entryKey)
        if (!entry) return null

        return (entry as Record<string, string | undefined>)[field] ?? null
    }

    getOriginalLegendEntryFieldSnapshot = <Field extends 'kind' | 'label' | 'role'>(
        entryKey: string,
        field: Field,
    ): string | null => {
        const entry = this.findOriginalLegendEntry(entryKey)
        if (!entry) return null

        return (entry as Record<string, string | undefined>)[field] ?? null
    }

    getGroupNodeIdsSnapshot = (groupId: string): readonly string[] | null => this.groupNodeIdsById.get(groupId) ?? null

    getFragmentRegionEdgeIdsSnapshot = (fragmentId: string, regionIndex: number): readonly string[] | null => (
        this.fragmentRegionEdgeIdsByKey.get(fragmentRegionKey(fragmentId, regionIndex)) ?? null
    )

    getEntityFieldIndexesSnapshot = (nodeId: string): readonly number[] | null => (
        this.entityFieldIndexesByNodeId.get(nodeId) ?? null
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

    getFragmentRegionFieldSnapshot = <Field extends keyof DiagramSequenceFragmentRegion>(
        fragmentId: string,
        regionIndex: number,
        field: Field,
    ): DeepReadonly<DiagramSequenceFragmentRegion[Field]> | null => {
        const region = this.findFragment(fragmentId)?.regions[regionIndex]

        return region ? asDeepReadonly(region[field]) : null
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

    subscribeActiveTool = (listener: () => void) => this.subscribe(ACTIVE_TOOL_CHANGED_EVENT, listener)

    subscribeActiveToolboxSection = (listener: () => void) => this.subscribe(TOOLBOX_SECTION_CHANGED_EVENT, listener)

    subscribeTransientGesture = (listener: () => void) => this.subscribe(TRANSIENT_GESTURE_CHANGED_EVENT, listener)

    subscribeViewportScale = (listener: () => void) => this.subscribe(VIEWPORT_SCALE_CHANGED_EVENT, listener)

    subscribeChangeIds = (listener: () => void) => this.subscribe(CHANGE_IDS_CHANGED_EVENT, listener)

    subscribeChangeField = (changeId: string, field: DiagramChangeField, listener: () => void) => (
        this.subscribe(diagramChangeFieldChangedEvent(changeId, field), listener)
    )

    subscribeOriginalDiagram = (listener: () => void) => this.subscribe(ORIGINAL_DIAGRAM_CHANGED_EVENT, listener)

    subscribeSavedRecord = (listener: () => void) => this.subscribe(SAVED_RECORD_CHANGED_EVENT, listener)

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

    subscribeFragmentRegionField = (
        fragmentId: string,
        regionIndex: number,
        field: keyof DiagramSequenceFragmentRegion,
        listener: () => void,
    ) => this.subscribe(diagramFragmentRegionFieldChangedEvent(fragmentId, regionIndex, field), listener)

    subscribeEntityField = (
        nodeId: string,
        fieldIndex: number,
        field: keyof DiagramEntityField,
        listener: () => void,
    ) => this.subscribe(diagramEntityFieldChangedEvent(nodeId, fieldIndex, field), listener)

    subscribeEntityFieldMembership = (nodeId: string, listener: () => void) => (
        this.subscribe(diagramEntityFieldMembershipChangedEvent(nodeId), listener)
    )

    subscribeConnectionPointField = (
        edgeId: string,
        endpoint: DiagramConnectionEndpoint,
        field: keyof DiagramConnectionPoint,
        listener: () => void,
    ) => this.subscribe(diagramConnectionPointFieldChangedEvent(edgeId, endpoint, field), listener)

    subscribeLegendMembership = (listener: () => void) => this.subscribe(diagramLegendMembershipChangedEvent(), listener)

    subscribeLegendEntryField = (entryKey: string, field: MutableDiagramLegendEntryField, listener: () => void) => (
        this.subscribe(diagramLegendEntryFieldChangedEvent(entryKey, field), listener)
    )

    subscribeCollectionMembership = (objectKind: DiagramCollectionKind, listener: () => void) => (
        this.subscribe(diagramCollectionMembershipChangedEvent(objectKind), listener)
    )

    subscribeCollectionMembershipWillChange = (objectKind: DiagramCollectionKind, listener: EventListener) => (
        this.subscribe(diagramCollectionMembershipWillChangeEvent(objectKind), listener)
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
        this.clearChangeRegistry()
        this.resetActiveToolboxSection()
        this.resetActiveInteraction()
        this.resetViewportScale()
        this.edgesById = indexById(editableDiagram.edges)
        this.fragmentsById = indexById(editableDiagram.fragments ?? [])
        this.groupsById = indexById(editableDiagram.groups)
        this.nodesById = indexById(editableDiagram.nodes)
        this.entityFieldIndexesByNodeId = new Map(editableDiagram.nodes.map((node) => (
            [node.id, DiagramEditSessionService.entityFieldIndexes(node)]
        )))
        this.legendEntryKeys = Object.freeze((editableDiagram.meta.legend ?? []).map(diagramLegendEntryKey))
        this.setChangeBaseline(source.diagram)
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
        this.setSavedRecord(null)
        this.publish({ dirty: false, editableDiagram, originalDiagram, session })
        this.publishPendingChangeEvents()
    }

    /** Ends the session and releases every session-owned reference. */
    discard() {
        this.clearChangeRegistry()
        this.resetActiveToolboxSection()
        this.resetActiveInteraction()
        this.resetViewportScale()
        this.edgesById.clear()
        this.fragmentsById.clear()
        this.groupsById.clear()
        this.nodesById.clear()
        this.entityFieldIndexesByNodeId.clear()
        this.originalEdgesById.clear()
        this.originalFragmentsById.clear()
        this.originalGroupsById.clear()
        this.originalNodesById.clear()
        this.changeBaselineDiagram = null
        this.edgeIds = EMPTY_IDS
        this.fragmentIds = EMPTY_IDS
        this.groupIds = EMPTY_IDS
        this.nodeIds = EMPTY_IDS
        this.legendEntryKeys = EMPTY_IDS
        this.originalLegendEntryKeys = EMPTY_IDS
        this.groupNodeIdsById.clear()
        this.fragmentRegionEdgeIdsByKey.clear()
        this.setSavedRecord(null)
        this.publish({ dirty: false, editableDiagram: null, originalDiagram: null, session: null })
        this.publishPendingChangeEvents()
    }

    /** Binds later saves to one record and clears changes only when saved data is still current. */
    acknowledgeSavedCopy(record: DiagramRecord, savedDiagram: DiagramData, savedDataIsCurrent: boolean) {
        const session = this.session
        if (!session || record.sourceDiagramId !== session.sourceDiagramId) return false

        this.setSavedRecord(record)
        if (!savedDataIsCurrent) return true

        this.setChangeBaseline(savedDiagram)
        this.clearChangeRegistry()
        this.publish({
            dirty: false,
            editableDiagram: this.editableDiagram,
            originalDiagram: this.originalDiagram,
            session: this.session,
        })
        this.publishPendingChangeEvents()

        return true
    }

    setActiveToolboxSection(section: DiagramToolboxSection) {
        if (!this.session) throw new Error('Cannot select a diagram toolbox section without an active edit session')
        if (section === this.activeToolboxSection) return

        this.activeToolboxSection = section
        this.dispatchEvent(new Event(TOOLBOX_SECTION_CHANGED_EVENT))
    }

    setActiveTool(tool: DiagramPersistentTool) {
        if (!this.session) throw new Error('Cannot select a diagram tool without an active edit session')
        const gestureChanged = this.transientGesture !== null
        const toolChanged = tool !== this.activeTool
        if (!gestureChanged && !toolChanged) return

        this.activeTool = tool
        this.transientGesture = null
        if (gestureChanged) this.dispatchEvent(new Event(TRANSIENT_GESTURE_CHANGED_EVENT))
        if (toolChanged) this.dispatchEvent(new Event(ACTIVE_TOOL_CHANGED_EVENT))
    }

    beginTransientGesture(gesture: DiagramTransientGesture) {
        if (!this.session) throw new Error('Cannot begin a diagram gesture without an active edit session')
        if (gesture === this.transientGesture) return

        this.transientGesture = gesture
        this.dispatchEvent(new Event(TRANSIENT_GESTURE_CHANGED_EVENT))
    }

    completeTransientGesture() {
        if (!this.transientGesture) return

        this.transientGesture = null
        this.dispatchEvent(new Event(TRANSIENT_GESTURE_CHANGED_EVENT))
    }

    cancelActiveInteraction() {
        if (!this.session) return false

        return this.resetActiveInteraction()
    }

    zoomIn() {
        if (!this.session) throw new Error('Cannot zoom diagram without an active edit session')
        const scale = Math.min(this.viewportScale + DIAGRAM_ZOOM_STEP, MAXIMUM_DIAGRAM_ZOOM)
        if (scale === this.viewportScale) return false

        this.viewportScale = scale
        this.dispatchEvent(new Event(VIEWPORT_SCALE_CHANGED_EVENT))

        return true
    }

    zoomOut() {
        if (!this.session) throw new Error('Cannot zoom diagram without an active edit session')
        const scale = Math.max(this.viewportScale - DIAGRAM_ZOOM_STEP, MINIMUM_DIAGRAM_ZOOM)
        if (scale === this.viewportScale) return false

        this.viewportScale = scale
        this.dispatchEvent(new Event(VIEWPORT_SCALE_CHANGED_EVENT))

        return true
    }

    setMetadataField<Field extends MutableDiagramMetaField>(field: Field, value: DiagramMeta[Field]) {
        const diagram = this.requireEditableDiagram()
        const previousValue = diagram.meta[field]
        const trimmedValue = value.trim()
        if (Object.is(previousValue, trimmedValue)) return false
        if (!this.validateOperation('Set diagram metadata field', () => requireDiagramString(trimmedValue, `meta.${field}`))) return false

        diagram.meta[field] = trimmedValue
        const originalValue = this.changeBaselineDiagram?.meta[field]
        const eventName = diagramMetadataFieldChangedEvent(field)
        this.finishFieldChange(eventName, 'meta:diagram', 'meta', 'diagram', field, originalValue, previousValue, trimmedValue)

        return true
    }

    /** Appends one explicit legend entry. The first added entry replaces the derived legend for this diagram. */
    addLegendEntry(entry: NewDiagramLegendEntry) {
        const diagram = this.requireEditableDiagram()
        if (!this.validateOperation('Add legend entry', () => {
            validateNewLegendEntry(entry)
            const entryKey = diagramLegendEntryKey(entry as DiagramLegendEntryData)
            if (this.legendEntryKeys.includes(entryKey)) {
                invalidDiagramField('meta.legend', `duplicate entry for ${entryKey}`)
            }
        })) return null

        const label = canonicalLegendLabel(entry)
        const added = ('role' in entry ? { label, role: entry.role } : { kind: entry.kind, label }) as DiagramLegendEntryData
        const entryKey = diagramLegendEntryKey(added)
        diagram.meta.legend = [...diagram.meta.legend ?? [], added]
        this.finishLegendMembershipChange([entryKey], [])

        return entryKey
    }

    /** Removes one legend entry. Nodes and edges keep their own role and kind fields. */
    removeLegendEntry(entryKey: string) {
        const diagram = this.requireEditableDiagram()
        if (!this.legendEntryKeys.includes(entryKey)) return false

        const legend = (diagram.meta.legend ?? []).filter((entry) => diagramLegendEntryKey(entry) !== entryKey)
        if (legend.length > 0) diagram.meta.legend = legend
        else delete diagram.meta.legend
        this.finishLegendMembershipChange([], [entryKey])

        return true
    }

    setLegendEntryLabel(entryKey: string, label: string) {
        const entry = this.requireLegendEntry(entryKey)
        const previousValue = entry.label
        const trimmedValue = label.trim()
        if (Object.is(previousValue, trimmedValue)) return false
        if (!this.validateOperation(
            'Set legend entry label',
            () => requireDiagramString(trimmedValue, `meta.legend.${entryKey}.label`),
        )) return false

        entry.label = trimmedValue
        const originalValue = this.findBaselineLegendEntry(entryKey)?.label
        const eventName = diagramLegendEntryFieldChangedEvent(entryKey, 'label')
        this.finishFieldChange(
            eventName, `legendEntry:${entryKey}`, 'legendEntry', entryKey, 'label', originalValue, previousValue, trimmedValue,
        )

        return true
    }

    /** Moves one entry to a new position, changing only legend membership order. */
    moveLegendEntry(entryKey: string, targetIndex: number) {
        const diagram = this.requireEditableDiagram()
        const legend = [...diagram.meta.legend ?? []]
        const sourceIndex = legend.findIndex((entry) => diagramLegendEntryKey(entry) === entryKey)
        if (sourceIndex < 0) throw new Error(`Diagram legend entry ${entryKey} does not exist`)
        if (!this.validateOperation('Move legend entry', () => {
            if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= legend.length) {
                invalidDiagramField('meta.legend', `index ${targetIndex} outside the legend`)
            }
        })) return false
        if (sourceIndex === targetIndex) return false

        const [moved] = legend.splice(sourceIndex, 1)
        legend.splice(targetIndex, 0, moved)
        diagram.meta.legend = legend
        this.legendEntryKeys = Object.freeze(legend.map(diagramLegendEntryKey))
        this.markLegendOrderChanges()
        this.commitTransaction([])
        const detail: DiagramLegendMembershipChangeDetail = { addedKeys: EMPTY_IDS, removedKeys: EMPTY_IDS }
        this.dispatchEvent(new CustomEvent<DiagramLegendMembershipChangeDetail>(
            diagramLegendMembershipChangedEvent(),
            { detail },
        ))

        return true
    }

    setNodeField<Field extends MutableDiagramNodeField>(nodeId: string, field: Field, value: DiagramNode[Field]) {
        const node = this.requireNode(nodeId)
        const previousValue = node[field]
        if (Object.is(previousValue, value)) return false
        if (!this.validateOperation('Set node field', () => this.validateNodeFieldValue(nodeId, field, value))) return false

        node[field] = value
        const originalValue = this.originalNodesById.get(nodeId)?.[field]
        const eventName = diagramObjectFieldChangedEvent('node', nodeId, field)
        this.finishFieldChange(eventName, `node:${nodeId}`, 'node', nodeId, field, originalValue, previousValue, value)

        return true
    }

    setEdgeField<Field extends MutableDiagramEdgeField>(edgeId: string, field: Field, value: DiagramEdge[Field]) {
        const edge = this.requireEdge(edgeId)
        const previousValue = edge[field]
        if (Object.is(previousValue, value)) return false
        if (!this.validateOperation('Set edge field', () => this.validateEdgeFieldValue(edge, field, value))) return false

        edge[field] = value
        const originalValue = this.originalEdgesById.get(edgeId)?.[field]
        const eventName = diagramObjectFieldChangedEvent('edge', edgeId, field)
        this.finishFieldChange(eventName, `edge:${edgeId}`, 'edge', edgeId, field, originalValue, previousValue, value)

        return true
    }

    /** Reassigns one edge endpoint and its explicit attachment in one validated transaction. */
    reconnectEdgeEndpoint(edgeId: string, endpoint: DiagramConnectionEndpoint, nodeId: string) {
        const edge = this.requireEdge(edgeId)
        const edgeField = endpoint === 'sourceAttachment' ? 'from' : 'to'
        const previousNodeId = edge[edgeField]
        if (previousNodeId === nodeId) return false

        const attachment = edge[endpoint]
        const candidate: DiagramEdge = {
            ...edge,
            [edgeField]: nodeId,
            ...(attachment ? { [endpoint]: { ...attachment, nodeId } } : {}),
        }
        if (!this.validateOperation('Reconnect edge endpoint', () => {
            this.validateEdgeFieldValue(candidate, edgeField, nodeId)
            if (attachment) validateConnectionPointValue(candidate, endpoint, 'nodeId', nodeId)
        })) return false

        edge[edgeField] = nodeId
        if (attachment) attachment.nodeId = nodeId

        const originalEdge = this.originalEdgesById.get(edgeId)
        const edgeEventName = diagramObjectFieldChangedEvent('edge', edgeId, edgeField)
        const edgeChange: DiagramChange = {
            category: 'field',
            field: edgeField,
            id: edgeEventName,
            objectId: edgeId,
            objectKind: 'edge',
            originalValue: originalEdge?.[edgeField],
            ownerId: null,
            regionIndex: null,
            value: nodeId,
        }
        this.setChange(edgeChange, `edge:${edgeId}`, Object.is(originalEdge?.[edgeField], nodeId))

        const connectionEventName = attachment
            ? diagramConnectionPointFieldChangedEvent(edgeId, endpoint, 'nodeId')
            : null
        if (attachment && connectionEventName) {
            const connectionChange: DiagramChange = {
                category: 'field',
                field: 'nodeId',
                id: connectionEventName,
                objectId: `${edgeId}:${endpoint}`,
                objectKind: 'connectionPoint',
                originalValue: originalEdge?.[endpoint]?.nodeId,
                ownerId: null,
                regionIndex: null,
                value: nodeId,
            }
            this.setChange(
                connectionChange,
                `edge:${edgeId}`,
                Object.is(originalEdge?.[endpoint]?.nodeId, nodeId),
            )
        }

        this.commitTransaction([])
        const edgeDetail: DiagramFieldChangeDetail = {
            field: edgeField,
            objectId: edgeId,
            objectKind: 'edge',
            previousValue: previousNodeId,
            value: nodeId,
        }
        this.dispatchEvent(new CustomEvent<DiagramFieldChangeDetail>(edgeEventName, { detail: edgeDetail }))
        if (attachment && connectionEventName) {
            const connectionDetail: DiagramFieldChangeDetail = {
                field: 'nodeId',
                objectId: `${edgeId}:${endpoint}`,
                objectKind: 'connectionPoint',
                previousValue: previousNodeId,
                value: nodeId,
            }
            this.dispatchEvent(new CustomEvent<DiagramFieldChangeDetail>(connectionEventName, { detail: connectionDetail }))
        }

        return true
    }

    setGroupField<Field extends MutableDiagramGroupField>(groupId: string, field: Field, value: DiagramGroup[Field]) {
        const group = this.requireGroup(groupId)
        const previousValue = group[field]
        if (Object.is(previousValue, value)) return false
        if (!this.validateOperation('Set group field', () => {
            const fieldPath = `groups.${groupId}.${field}`
            if (field === 'label') requireDiagramString(value, fieldPath)
            if (field === 'height' || field === 'width') requireOptionalGridNumber(value, fieldPath, true)
            if (field === 'x' || field === 'y') requireOptionalGridNumber(value, fieldPath)
        })) return false

        group[field] = value
        const originalValue = this.originalGroupsById.get(groupId)?.[field]
        const eventName = diagramObjectFieldChangedEvent('group', groupId, field)
        this.finishFieldChange(eventName, `group:${groupId}`, 'group', groupId, field, originalValue, previousValue, value)

        return true
    }

    setFragmentField<Field extends MutableDiagramFragmentField>(
        fragmentId: string,
        field: Field,
        value: DiagramSequenceFragment[Field],
    ) {
        const fragment = this.requireFragment(fragmentId)
        const previousValue = fragment[field]
        if (Object.is(previousValue, value)) return false
        if (!this.validateOperation('Set fragment field', () => {
            requireDiagramFragmentRegionCount(value, fragment.regions, `fragments.${fragmentId}`)
        })) return false

        fragment[field] = value
        const originalValue = this.originalFragmentsById.get(fragmentId)?.[field]
        const eventName = diagramObjectFieldChangedEvent('fragment', fragmentId, field)
        this.finishFieldChange(
            eventName,
            `fragment:${fragmentId}`,
            'fragment',
            fragmentId,
            field,
            originalValue,
            previousValue,
            value,
        )

        return true
    }

    setFragmentRegionField<Field extends MutableDiagramFragmentRegionField>(
        fragmentId: string,
        regionIndex: number,
        field: Field,
        value: DiagramSequenceFragmentRegion[Field],
    ) {
        const fragment = this.requireFragment(fragmentId)
        requireFragmentRegion(fragment, regionIndex)
        const regions = fragment.regions.map((region, index) => ({
            edgeIds: [...region.edgeIds],
            guard: index === regionIndex && field === 'guard' ? value : region.guard,
        }))

        return this.updateFragment(fragmentId, { operator: fragment.operator, regions })
    }

    /** Validates one complete fragment edit before applying its field and ordered-membership changes atomically. */
    updateFragment(fragmentId: string, candidate: NewDiagramSequenceFragment): boolean {
        const fragment = this.requireFragment(fragmentId)
        let regions: DiagramSequenceFragmentRegion[] = []
        if (!this.validateOperation('Update fragment', () => {
            this.validateFragment(candidate, `fragments.${fragmentId}`)
            regions = this.requireOwnedRegions(candidate.operator, candidate.regions, `fragments.${fragmentId}.regions`)
        })) return false
        const operatorChanged = fragment.operator !== candidate.operator
        const maximumRegionCount = Math.max(fragment.regions.length, regions.length)
        const changedRegionIndexes = Array.from({ length: maximumRegionCount }, (_value, index) => index).filter((index) => {
            const previousRegion = fragment.regions[index]
            const region = regions[index]

            return previousRegion?.guard !== region?.guard || !sameOrderedValues(previousRegion?.edgeIds ?? [], region?.edgeIds ?? [])
        })
        if (!operatorChanged && changedRegionIndexes.length === 0) return false

        const previousOperator = fragment.operator
        const previousRegions = fragment.regions.map((region) => ({ edgeIds: [...region.edgeIds], guard: region.guard }))
        fragment.operator = candidate.operator
        for (let index = 0; index < regions.length; index += 1) {
            const region = regions[index]
            const existingRegion = fragment.regions[index]
            if (!existingRegion) {
                fragment.regions.push(region)
                continue
            }
            existingRegion.guard = region.guard
            existingRegion.edgeIds.splice(0, existingRegion.edgeIds.length, ...region.edgeIds)
        }
        if (fragment.regions.length > regions.length) fragment.regions.splice(regions.length)

        const events: PendingMembershipEvent[] = []
        if (operatorChanged) this.markFragmentFieldChange(fragmentId, 'operator', candidate.operator)
        for (const regionIndex of changedRegionIndexes) {
            const previousRegion = previousRegions[regionIndex]
            const region = fragment.regions[regionIndex]
            const previousEdgeIds = previousRegion?.edgeIds ?? []
            const edgeIds = region?.edgeIds ?? []
            const addedIds = edgeIds.filter((edgeId) => !previousEdgeIds.includes(edgeId))
            const removedIds = previousEdgeIds.filter((edgeId) => !edgeIds.includes(edgeId))
            if (previousRegion?.guard !== region?.guard) {
                this.markFragmentRegionFieldChange(fragmentId, regionIndex, 'guard', region?.guard)
            }
            if (!sameOrderedValues(previousEdgeIds, edgeIds)) {
                this.fragmentRegionEdgeIdsByKey.set(fragmentRegionKey(fragmentId, regionIndex), Object.freeze([...edgeIds]))
                for (const edgeId of addedIds) this.markFragmentRegionMembership(fragmentId, regionIndex, edgeId, true)
                for (const edgeId of removedIds) this.markFragmentRegionMembership(fragmentId, regionIndex, edgeId, false)
                this.markFragmentRegionFieldChange(fragmentId, regionIndex, 'edgeIds', edgeIds)
                events.push(fragmentRegionMembershipEvent(fragmentId, regionIndex, addedIds, removedIds))
            }
            if (!region) this.fragmentRegionEdgeIdsByKey.delete(fragmentRegionKey(fragmentId, regionIndex))
        }
        this.commitTransaction(events)
        if (operatorChanged) this.publishFragmentFieldChange(fragmentId, 'operator', previousOperator, candidate.operator)
        for (const regionIndex of changedRegionIndexes) {
            const previousRegion = previousRegions[regionIndex]
            const region = fragment.regions[regionIndex]
            if (previousRegion?.guard !== region?.guard) {
                this.publishFragmentRegionFieldChange(fragmentId, regionIndex, 'guard', previousRegion?.guard, region?.guard)
            }
        }

        return true
    }

    setEntityField<Field extends MutableDiagramEntityField>(
        nodeId: string,
        fieldIndex: number,
        field: Field,
        value: DiagramEntityField[Field],
    ) {
        const entityField = this.requireEntityField(nodeId, fieldIndex)
        const previousValue = entityField[field]
        if (Object.is(previousValue, value)) return false
        if (!this.validateOperation('Set entity field', () => {
            const diagram = this.requireEditableDiagram()
            if (diagram.meta.type !== 'entity') {
                invalidDiagramField(`nodes.${nodeId}.fields`, 'value only allowed for entity diagrams')
            }
            requireEntityFieldValue(field, value, `nodes.${nodeId}.fields[${fieldIndex}].${field}`)
        })) return false

        entityField[field] = value
        const originalValue = this.originalNodesById.get(nodeId)?.fields?.[fieldIndex]?.[field]
        const objectId = `${nodeId}[${fieldIndex}]`
        const eventName = diagramEntityFieldChangedEvent(nodeId, fieldIndex, field)
        this.finishFieldChange(
            eventName,
            `node:${nodeId}`,
            'entityField',
            objectId,
            field,
            originalValue,
            previousValue,
            value,
        )

        return true
    }

    /** Adds one position-addressed field without replacing its owning field array. */
    addEntityField(nodeId: string, field: DiagramEntityField, fieldIndex?: number) {
        const node = this.requireEntityNode(nodeId)
        const fields = node.fields ?? []
        const index = fieldIndex ?? fields.length
        if (!this.validateOperation('Add entity field', () => {
            if (!Number.isInteger(index) || index < 0 || index > fields.length) {
                invalidDiagramField(`nodes.${nodeId}.fields`, `invalid insertion index ${index}`)
            }
            requireEntityFieldValue('key', field.key, `nodes.${nodeId}.fields[${index}].key`)
            requireEntityFieldValue('name', field.name, `nodes.${nodeId}.fields[${index}].name`)
            requireEntityFieldValue('type', field.type, `nodes.${nodeId}.fields[${index}].type`)
        })) return false

        if (!node.fields) node.fields = fields
        fields.splice(index, 0, { ...field })
        this.finishEntityFieldMembershipChange(nodeId, [index], [])

        return true
    }

    /** Removes one position-addressed field without replacing its owning field array. */
    removeEntityField(nodeId: string, fieldIndex: number) {
        const node = this.requireEntityNode(nodeId)
        const fields = node.fields ?? []
        if (!fields[fieldIndex]) return false

        fields.splice(fieldIndex, 1)
        this.finishEntityFieldMembershipChange(nodeId, [], [fieldIndex])

        return true
    }

    /** Reorders one position-addressed field within its owning array. */
    moveEntityField(nodeId: string, fieldIndex: number, targetIndex: number) {
        const node = this.requireEntityNode(nodeId)
        const fields = node.fields ?? []
        const field = fields[fieldIndex]
        if (!field || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= fields.length) return false
        if (fieldIndex === targetIndex) return false

        fields.splice(fieldIndex, 1)
        fields.splice(targetIndex, 0, field)
        this.finishEntityFieldMembershipChange(nodeId, [targetIndex], [fieldIndex])

        return true
    }

    setConnectionPointField<Field extends MutableDiagramConnectionPointField>(
        edgeId: string,
        endpoint: DiagramConnectionEndpoint,
        field: Field,
        value: DiagramConnectionPoint[Field],
    ) {
        const connectionPoint = this.requireConnectionPoint(edgeId, endpoint)
        const previousValue = connectionPoint[field]
        if (Object.is(previousValue, value)) return false
        const edge = this.requireEdge(edgeId)
        if (!this.validateOperation('Set connection point field', () => {
            validateConnectionPointValue(edge, endpoint, field, value)
        })) return false

        connectionPoint[field] = value
        const originalValue = this.originalEdgesById.get(edgeId)?.[endpoint]?.[field]
        const objectId = `${edgeId}:${endpoint}`
        const eventName = diagramConnectionPointFieldChangedEvent(edgeId, endpoint, field)
        this.finishFieldChange(
            eventName,
            `edge:${edgeId}`,
            'connectionPoint',
            objectId,
            field,
            originalValue,
            previousValue,
            value,
        )

        return true
    }


    /** Appends a new node and publishes a fresh node ID list; every existing object keeps its reference. */
    createNode(node: NewDiagramNode): string | null {
        const diagram = this.requireEditableDiagram()
        if (!this.validateOperation('Create node', () => this.validateNewNode(node))) return null
        const id = this.generateSelectableId()
        const created: DiagramNode = { ...node, id }
        if (node.fields) created.fields = node.fields.map((field) => ({ ...field }))
        diagram.nodes.push(created)
        this.nodesById.set(id, created)
        this.entityFieldIndexesByNodeId.set(id, DiagramEditSessionService.entityFieldIndexes(created))
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
        if (!this.validateOperation('Remove node', () => this.validateNodeRemoval(nodeId))) return false

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
        this.entityFieldIndexesByNodeId.delete(nodeId)
        this.nodeIds = frozenIds(diagram.nodes)
        this.purgeChangesOwnedBy(`node:${nodeId}`)
        this.markCollectionMembership('node', nodeId, false)
        events.unshift(collectionMembershipEvent('node', [], [nodeId]))
        this.commitTransaction(events)

        return true
    }

    createEdge(edge: NewDiagramEdge): string | null {
        const diagram = this.requireEditableDiagram()
        if (!this.validateOperation('Create edge', () => this.validateNewEdge(edge))) return null

        return this.insertEdge(edge, diagram.edges.length)
    }

    /** Creates one sequence message at its persisted row index. */
    createSequenceEdge(edge: NewDiagramEdge, rowIndex: number): string | null {
        const diagram = this.requireEditableDiagram()
        if (!this.validateOperation('Create sequence edge', () => {
            if (diagram.meta.type !== 'sequence') invalidDiagramField('edges.new.row', 'value only allowed for sequence diagrams')
            if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex > diagram.edges.length) {
                invalidDiagramField('edges.new.row', `index ${rowIndex} outside the 0..${diagram.edges.length} range`)
            }
            this.validateNewEdge(edge)
        })) return null

        return this.insertEdge(edge, rowIndex)
    }

    /** Moves one existing sequence message to another persisted row without changing its identity. */
    moveSequenceEdge(edgeId: string, rowIndex: number): boolean {
        const diagram = this.requireEditableDiagram()
        const edge = this.requireEdge(edgeId)
        const previousRowIndex = diagram.edges.indexOf(edge)
        if (!this.validateOperation('Move sequence edge', () => {
            if (diagram.meta.type !== 'sequence') invalidDiagramField(`edges.${edgeId}.row`, 'value only allowed for sequence diagrams')
            if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= diagram.edges.length) {
                invalidDiagramField(`edges.${edgeId}.row`, `index ${rowIndex} outside the 0..${diagram.edges.length - 1} range`)
            }
        })) return false
        if (rowIndex === previousRowIndex) return false

        diagram.edges.splice(previousRowIndex, 1)
        diagram.edges.splice(rowIndex, 0, edge)
        this.edgeIds = frozenIds(diagram.edges)
        this.markSequenceEdgeOrderChanges()
        this.commitTransaction([collectionMembershipEvent('edge', [], [])])

        return true
    }

    private insertEdge(edge: NewDiagramEdge, rowIndex: number) {
        const diagram = this.requireEditableDiagram()
        const id = this.generateSelectableId()
        const created: DiagramEdge = { ...edge, id }
        if (edge.sourceAttachment) created.sourceAttachment = { ...edge.sourceAttachment }
        if (edge.targetAttachment) created.targetAttachment = { ...edge.targetAttachment }
        if (edge.waypoints) created.waypoints = edge.waypoints.map((waypoint) => ({ ...waypoint }))
        diagram.edges.splice(rowIndex, 0, created)
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
        const emptiedRegionPaths = (diagram.fragments ?? []).flatMap((fragment) => (
            fragment.regions.flatMap((region, regionIndex) => (
                region.edgeIds.includes(edgeId) && region.edgeIds.length === 1
                    ? [`fragments.${fragment.id}.regions[${regionIndex}].edgeIds`]
                    : []
            ))
        ))

        const events: PendingMembershipEvent[] = []
        this.detachEdge(edgeId, events)
        this.edgeIds = frozenIds(diagram.edges)
        events.unshift(collectionMembershipEvent('edge', [], [edgeId]))
        this.commitTransaction(events)
        for (const fieldPath of emptiedRegionPaths) {
            this.reportValidationError(`Remove edge validation problem: ${fieldPath} has empty array`)
        }

        return true
    }

    createGroup(group: NewDiagramGroup): string | null {
        const diagram = this.requireEditableDiagram()
        let nodeIds: string[] = []
        if (!this.validateOperation('Create group', () => {
            validateNewGroup(group)
            nodeIds = this.requireOwnedNodeIds(group.nodeIds)
        })) return null
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
        this.purgeChangesOwnedBy(`group:${groupId}`)
        this.markCollectionMembership('group', groupId, false)
        this.commitTransaction([collectionMembershipEvent('group', [], [groupId])])

        return true
    }

    createFragment(fragment: NewDiagramSequenceFragment): string | null {
        const diagram = this.requireEditableDiagram()
        let regions: DiagramSequenceFragmentRegion[] = []
        if (!this.validateOperation('Create fragment', () => {
            this.validateNewFragment(fragment)
            regions = this.requireOwnedRegions(fragment.operator, fragment.regions)
        })) return null
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

    /** Validates and inserts one self-contained fragment through one collection-membership transaction. */
    pasteFragment(fragment: DiagramPasteFragment, offset: number): DiagramPasteResult | null {
        const diagram = this.requireEditableDiagram()
        const pasted = this.validateOperationResult('Paste diagram fragment', () => {
            requireDiagramGridNumber(offset, 'paste.offset', true)
            return this.preparePastedFragment(fragment, offset)
        })
        if (!pasted) return null

        diagram.nodes.push(...pasted.nodes)
        diagram.edges.push(...pasted.edges)
        diagram.groups.push(...pasted.groups)
        if (pasted.fragments.length > 0) {
            if (!diagram.fragments) diagram.fragments = []
            diagram.fragments.push(...pasted.fragments)
        }
        for (const node of pasted.nodes) {
            this.nodesById.set(node.id, node)
            this.entityFieldIndexesByNodeId.set(node.id, DiagramEditSessionService.entityFieldIndexes(node))
        }
        for (const edge of pasted.edges) this.edgesById.set(edge.id, edge)
        for (const group of pasted.groups) {
            this.groupsById.set(group.id, group)
            this.groupNodeIdsById.set(group.id, Object.freeze([...group.nodeIds]))
        }
        for (const pastedFragment of pasted.fragments) {
            this.fragmentsById.set(pastedFragment.id, pastedFragment)
            pastedFragment.regions.forEach((region, index) => {
                this.fragmentRegionEdgeIdsByKey.set(
                    fragmentRegionKey(pastedFragment.id, index),
                    Object.freeze([...region.edgeIds]),
                )
            })
        }
        this.nodeIds = frozenIds(diagram.nodes)
        this.edgeIds = frozenIds(diagram.edges)
        this.groupIds = frozenIds(diagram.groups)
        this.fragmentIds = frozenIds(diagram.fragments ?? [])
        const events: PendingMembershipEvent[] = []
        this.markPastedCollection('node', pasted.nodes, events)
        this.markPastedCollection('edge', pasted.edges, events)
        this.markPastedCollection('group', pasted.groups, events)
        this.markPastedCollection('fragment', pasted.fragments, events)
        this.commitTransaction(events)
        const identities: DiagramRemovalIdentity[] = [
            ...pasted.nodes.map(({ id }) => ({ objectId: id, objectKind: 'node' as const })),
            ...pasted.edges.map(({ id }) => ({ objectId: id, objectKind: 'edge' as const })),
            ...pasted.groups.map(({ id }) => ({ objectId: id, objectKind: 'group' as const })),
        ]

        return { identities: Object.freeze(identities) }
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
        this.purgeChangesOwnedBy(`fragment:${fragmentId}`)
        this.markCollectionMembership('fragment', fragmentId, false)
        this.commitTransaction([collectionMembershipEvent('fragment', [], [fragmentId])])

        return true
    }

    /** Deletes selected objects and every invalidated reference host through one mutation transaction. */
    removeObjects(identities: readonly DiagramRemovalIdentity[]): boolean {
        const diagram = this.requireEditableDiagram()
        const nodeIds = new Set<string>()
        const edgeIds = new Set<string>()
        const groupIds = new Set<string>()
        for (const { objectId, objectKind } of identities) {
            if (objectKind === 'node' && this.nodesById.has(objectId)) nodeIds.add(objectId)
            if (objectKind === 'edge' && this.edgesById.has(objectId)) edgeIds.add(objectId)
            if (objectKind === 'group' && this.groupsById.has(objectId)) groupIds.add(objectId)
        }
        if (nodeIds.size === 0 && edgeIds.size === 0 && groupIds.size === 0) return false
        if (!this.validateOperation('Delete selection', () => {
            if (nodeIds.size === diagram.nodes.length) invalidDiagramField('nodes', 'empty array after deleting selection')
        })) return false

        for (const edge of diagram.edges) {
            if (nodeIds.has(edge.from) || nodeIds.has(edge.to)) edgeIds.add(edge.id)
        }
        const emptiedRegionPaths = (diagram.fragments ?? []).flatMap((fragment) => (
            fragment.regions.flatMap((region, regionIndex) => (
                region.edgeIds.length > 0 && region.edgeIds.every((edgeId) => edgeIds.has(edgeId))
                    ? [`fragments.${fragment.id}.regions[${regionIndex}].edgeIds`]
                    : []
            ))
        ))
        const removedNodeIds = diagram.nodes.filter(({ id }) => nodeIds.has(id)).map(({ id }) => id)
        const removedEdgeIds = diagram.edges.filter(({ id }) => edgeIds.has(id)).map(({ id }) => id)
        const removedGroupIds = diagram.groups.filter(({ id }) => groupIds.has(id)).map(({ id }) => id)
        const events: PendingMembershipEvent[] = []
        for (const group of diagram.groups) {
            if (groupIds.has(group.id)) continue

            this.detachGroupMembers(group, nodeIds, events)
        }
        for (const fragment of diagram.fragments ?? []) {
            for (let index = 0; index < fragment.regions.length; index += 1) {
                this.detachFragmentRegionEdges(fragment, index, edgeIds, events)
            }
        }
        this.removeGroups(groupIds)
        this.removeEdges(edgeIds)
        this.removeNodes(nodeIds)
        if (nodeIds.size > 0) {
            this.nodeIds = frozenIds(diagram.nodes)
            events.unshift(collectionMembershipEvent('node', [], removedNodeIds))
        }
        if (edgeIds.size > 0) {
            this.edgeIds = frozenIds(diagram.edges)
            events.unshift(collectionMembershipEvent('edge', [], removedEdgeIds))
        }
        if (groupIds.size > 0) {
            this.groupIds = frozenIds(diagram.groups)
            events.unshift(collectionMembershipEvent('group', [], removedGroupIds))
        }
        this.commitTransaction(events)
        for (const fieldPath of emptiedRegionPaths) {
            this.reportValidationError(`Delete selection validation problem: ${fieldPath} has empty array`)
        }

        return true
    }

    /** Adds one node to one group; the node object and every other collection keep their references. */
    addGroupMember(groupId: string, nodeId: string): boolean {
        const group = this.requireGroup(groupId)
        if (group.nodeIds.includes(nodeId)) return false
        if (!this.validateOperation('Add group member', () => {
            if (!this.nodesById.has(nodeId)) invalidDiagramField(`groups.${groupId}.nodeIds`, `unknown node ${nodeId}`)
        })) return false

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
        if (fragment.regions.some((item) => item.edgeIds.includes(edgeId))) return false
        if (!this.validateOperation('Add fragment region edge', () => {
            if (!this.edgesById.has(edgeId)) {
                invalidDiagramField(`fragments.${fragmentId}.regions[${regionIndex}].edgeIds`, `unknown edge ${edgeId}`)
            }
        })) return false

        region.edgeIds.push(edgeId)
        this.fragmentRegionEdgeIdsByKey.set(fragmentRegionKey(fragmentId, regionIndex), Object.freeze([...region.edgeIds]))
        this.markFragmentRegionMembership(fragmentId, regionIndex, edgeId, true)
        this.markFragmentRegionFieldChange(fragmentId, regionIndex, 'edgeIds', region.edgeIds)
        this.commitTransaction([fragmentRegionMembershipEvent(fragmentId, regionIndex, [edgeId], [])])

        return true
    }

    removeFragmentRegionEdge(fragmentId: string, regionIndex: number, edgeId: string): boolean {
        const fragment = this.requireFragment(fragmentId)
        const region = requireFragmentRegion(fragment, regionIndex)
        if (region.edgeIds.includes(edgeId) && region.edgeIds.length === 1) {
            if (!this.validateOperation('Remove fragment region edge', () => {
                invalidDiagramField(`fragments.${fragmentId}.regions[${regionIndex}].edgeIds`, 'empty array after removing edge')
            })) return false
        }
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

    private findLegendEntry(entryKey: string) {
        return this.editableDiagram?.meta.legend?.find((entry) => diagramLegendEntryKey(entry) === entryKey) ?? null
    }

    private findOriginalLegendEntry(entryKey: string) {
        return this.originalDiagram?.diagram.meta.legend?.find((entry) => diagramLegendEntryKey(entry) === entryKey) ?? null
    }

    private findBaselineLegendEntry(entryKey: string) {
        return this.changeBaselineDiagram?.meta.legend?.find((entry) => diagramLegendEntryKey(entry) === entryKey) ?? null
    }

    private requireLegendEntry(entryKey: string) {
        this.requireEditableDiagram()
        const entry = this.findLegendEntry(entryKey)
        if (!entry) throw new Error(`Diagram legend entry ${entryKey} does not exist`)

        return entry
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

    private requireEntityNode(nodeId: string) {
        const node = this.requireNode(nodeId)
        const diagram = this.requireEditableDiagram()
        if (diagram.meta.type !== 'entity') throw new Error(`Diagram node ${nodeId} does not belong to an entity diagram`)

        return node
    }

    private requireConnectionPoint(edgeId: string, endpoint: DiagramConnectionEndpoint) {
        const edge = this.requireEdge(edgeId)
        const connectionPoint = edge[endpoint]
        if (!connectionPoint) throw new Error(`Diagram connection point ${edgeId}:${endpoint} does not exist`)

        return connectionPoint
    }

    private validateOperation(operation: string, validation: () => void) {
        try {
            validation()

            return true
        } catch (error) {
            this.reportValidationError(`${operation} rejected: ${validationMessage(error)}`)

            return false
        }
    }

    private validateOperationResult<Value>(operation: string, validation: () => Value): Value | null {
        try {
            return validation()
        } catch (error) {
            this.reportValidationError(`${operation} rejected: ${validationMessage(error)}`)

            return null
        }
    }

    private validateNodeFieldValue(nodeId: string, field: MutableDiagramNodeField, value: unknown) {
        const diagram = this.requireEditableDiagram()
        const fieldPath = `nodes.${nodeId}.${field}`
        if (field === 'drilldown') optionalDiagramBoolean(value, fieldPath)
        if (field === 'height' || field === 'width') requireOptionalGridNumber(value, fieldPath, true)
        if (field === 'kind') {
            requireDiagramNodeKind(value, diagram.meta.type, diagram.meta.preset, fieldPath)
            for (const edge of diagram.edges) {
                if (edge.from === nodeId) {
                    requireDiagramEdgeLabel(edge.label, diagram.meta.type, diagram.meta.preset, value as DiagramNode['kind'], `edges.${edge.id}.label`)
                }
            }
        }
        if (field === 'label') requireDiagramString(value, fieldPath)
        if (field === 'role') requireDiagramEnum(value, DIAGRAM_ROLES, fieldPath)
        if (field === 'sublabel' || field === 'tag') optionalDiagramString(value, fieldPath)
        if (field === 'x' || field === 'y') requireOptionalGridNumber(value, fieldPath)
    }

    private validateEdgeFieldValue(edge: DiagramEdge, field: MutableDiagramEdgeField, value: unknown) {
        const diagram = this.requireEditableDiagram()
        const fieldPath = `edges.${edge.id}.${field}`
        if (field === 'from' || field === 'to') {
            const nodeId = requireDiagramString(value, fieldPath)
            if (!this.nodesById.has(nodeId)) invalidDiagramField(fieldPath, `unknown node ${nodeId}`)
            const attachment = field === 'from' ? edge.sourceAttachment : edge.targetAttachment
            if (attachment && attachment.nodeId !== nodeId) {
                invalidDiagramField(`${fieldPath === `edges.${edge.id}.from` ? `edges.${edge.id}.sourceAttachment` : `edges.${edge.id}.targetAttachment`}.nodeId`, `node ${attachment.nodeId} does not match ${field} ${nodeId}`)
            }
            if (field === 'from') {
                const source = this.findNode(nodeId)
                requireDiagramEdgeLabel(edge.label, diagram.meta.type, diagram.meta.preset, source?.kind, `edges.${edge.id}.label`)
            }
        }
        if (field === 'kind') requireDiagramEdgeKind(value, diagram.meta.type, fieldPath)
        if (field === 'label') {
            const source = this.findNode(edge.from)
            requireDiagramEdgeLabel(value, diagram.meta.type, diagram.meta.preset, source?.kind, fieldPath)
        }
        if (field === 'fromCardinality' || field === 'toCardinality') {
            optionalDiagramEnum(value, DIAGRAM_CARDINALITIES, fieldPath)
            if (value !== undefined && diagram.meta.type !== 'entity') {
                invalidDiagramField(fieldPath, 'value only allowed for entity diagrams')
            }
        }
    }

    private validateNewNode(node: NewDiagramNode) {
        this.validateNodeFieldValue('new', 'label', node.label)
        this.validateNodeFieldValue('new', 'role', node.role)
        this.validateNodeFieldValue('new', 'kind', node.kind)
        this.validateNodeFieldValue('new', 'drilldown', node.drilldown)
        this.validateNodeFieldValue('new', 'height', node.height)
        this.validateNodeFieldValue('new', 'sublabel', node.sublabel)
        this.validateNodeFieldValue('new', 'tag', node.tag)
        this.validateNodeFieldValue('new', 'width', node.width)
        this.validateNodeFieldValue('new', 'x', node.x)
        this.validateNodeFieldValue('new', 'y', node.y)
        const diagram = this.requireEditableDiagram()
        if (node.fields !== undefined && diagram.meta.type !== 'entity') {
            invalidDiagramField('nodes.new.fields', 'value only allowed for entity diagrams')
        }
        for (let index = 0; index < (node.fields?.length ?? 0); index += 1) {
            const entityField = node.fields?.[index] as DiagramEntityField
            requireEntityFieldValue('key', entityField.key, `nodes.new.fields[${index}].key`)
            requireEntityFieldValue('name', entityField.name, `nodes.new.fields[${index}].name`)
            requireEntityFieldValue('type', entityField.type, `nodes.new.fields[${index}].type`)
        }
    }

    private validateNewEdge(edge: NewDiagramEdge) {
        const candidate = { ...edge, id: 'new' }
        this.validateEdgeFieldValue(candidate, 'from', edge.from)
        this.validateEdgeFieldValue(candidate, 'to', edge.to)
        this.validateEdgeFieldValue(candidate, 'kind', edge.kind)
        this.validateEdgeFieldValue(candidate, 'label', edge.label)
        this.validateEdgeFieldValue(candidate, 'fromCardinality', edge.fromCardinality)
        this.validateEdgeFieldValue(candidate, 'toCardinality', edge.toCardinality)
        if (edge.sourceAttachment) {
            validateConnectionPointValue(candidate, 'sourceAttachment', 'nodeId', edge.sourceAttachment.nodeId)
            validateConnectionPointValue(candidate, 'sourceAttachment', 'offset', edge.sourceAttachment.offset)
            validateConnectionPointValue(candidate, 'sourceAttachment', 'side', edge.sourceAttachment.side)
        }
        if (edge.targetAttachment) {
            validateConnectionPointValue(candidate, 'targetAttachment', 'nodeId', edge.targetAttachment.nodeId)
            validateConnectionPointValue(candidate, 'targetAttachment', 'offset', edge.targetAttachment.offset)
            validateConnectionPointValue(candidate, 'targetAttachment', 'side', edge.targetAttachment.side)
        }
        for (let index = 0; index < (edge.waypoints?.length ?? 0); index += 1) {
            const waypoint = edge.waypoints?.[index]
            if (!waypoint) continue
            requireDiagramGridNumber(waypoint.x, `edges.new.waypoints[${index}].x`)
            requireDiagramGridNumber(waypoint.y, `edges.new.waypoints[${index}].y`)
            const previous = edge.waypoints?.[index - 1]
            if (previous && previous.x !== waypoint.x && previous.y !== waypoint.y) {
                invalidDiagramField(`edges.new.waypoints[${index}]`, 'diagonal segment')
            }
        }
        if (edge.waypoints && edge.waypoints.length < 2) invalidDiagramField('edges.new.waypoints', 'fewer than two points')
    }

    private validateNewFragment(fragment: NewDiagramSequenceFragment) {
        this.validateFragment(fragment, 'fragments.new')
    }

    private validateFragment(fragment: NewDiagramSequenceFragment, fieldPath: string) {
        const diagram = this.requireEditableDiagram()
        if (diagram.meta.type !== 'sequence') invalidDiagramField('fragments', 'value only allowed for sequence diagrams')
        requireDiagramFragmentRegionCount(fragment.operator, fragment.regions, fieldPath)
        for (let index = 0; index < fragment.regions.length; index += 1) {
            const region = fragment.regions[index]
            requireDiagramString(region.guard, `${fieldPath}.regions[${index}].guard`)
            if (region.edgeIds.length === 0) invalidDiagramField(`${fieldPath}.regions[${index}].edgeIds`, 'empty array')
        }
    }

    private preparePastedFragment(fragment: DiagramPasteFragment, offset: number) {
        const nodeIds = new Map<string, string>()
        const edgeIds = new Map<string, string>()
        const groupIds = new Map<string, string>()
        const fragmentIds = new Map<string, string>()
        const reservedSelectableIds = new Set([...this.nodeIds, ...this.edgeIds])
        for (const node of fragment.nodes) nodeIds.set(node.id, this.generateReservedObjectId(reservedSelectableIds))
        for (const edge of fragment.edges) edgeIds.set(edge.id, this.generateReservedObjectId(reservedSelectableIds))
        const reservedGroupIds = new Set(this.groupIds)
        for (const group of fragment.groups) {
            groupIds.set(group.id, this.generateReservedObjectId(reservedGroupIds))
        }
        const reservedFragmentIds = new Set(this.fragmentIds)
        for (const sourceFragment of fragment.fragments) {
            fragmentIds.set(sourceFragment.id, this.generateReservedObjectId(reservedFragmentIds))
        }
        const nodes = fragment.nodes.map((node) => this.createPastedNode(node, nodeIds, offset))
        const pastedNodesById = indexById(nodes)
        const edges = fragment.edges.map((edge) => this.createPastedEdge(edge, nodeIds, edgeIds, pastedNodesById, offset))
        const groups = fragment.groups.map((group) => DiagramEditSessionService.createPastedGroup(group, nodeIds, groupIds, offset))
        const fragments = fragment.fragments.map((sourceFragment) => (
            this.createPastedSequenceFragment(sourceFragment, edgeIds, fragmentIds)
        ))

        return { edges, fragments, groups, nodes }
    }

    private createPastedNode(
        source: ReadonlyDiagramData['nodes'][number],
        nodeIds: ReadonlyMap<string, string>,
        offset: number,
    ) {
        const id = nodeIds.get(source.id)
        if (!id) invalidDiagramField('paste.nodes', `missing ID mapping for node ${source.id}`)
        const node: DiagramNode = {
            ...source,
            fields: source.fields?.map((field) => ({ ...field })),
            id,
            ...(source.x === undefined ? {} : { x: source.x + offset }),
            ...(source.y === undefined ? {} : { y: source.y + offset }),
        }
        this.validateNewNode(node)

        return node
    }

    private createPastedEdge(
        source: ReadonlyDiagramData['edges'][number],
        nodeIds: ReadonlyMap<string, string>,
        edgeIds: ReadonlyMap<string, string>,
        pastedNodesById: ReadonlyMap<string, DiagramNode>,
        offset: number,
    ) {
        const id = edgeIds.get(source.id)
        const from = nodeIds.get(source.from)
        const to = nodeIds.get(source.to)
        if (!id || !from || !to) invalidDiagramField('paste.edges', `missing internal ID mapping for edge ${source.id}`)
        const edge: DiagramEdge = {
            ...source,
            from,
            id,
            to,
            ...(source.sourceAttachment ? {sourceAttachment: { ...source.sourceAttachment, nodeId: from }} : {}),
            ...(source.targetAttachment ? {targetAttachment: { ...source.targetAttachment, nodeId: to }} : {}),
            waypoints: source.waypoints?.map(({ x, y }) => ({ x: x + offset, y: y + offset })),
        }
        this.validatePastedEdge(edge, pastedNodesById)

        return edge
    }

    private validatePastedEdge(edge: DiagramEdge, pastedNodesById: ReadonlyMap<string, DiagramNode>) {
        const diagram = this.requireEditableDiagram()
        const source = pastedNodesById.get(edge.from)
        if (!source || !pastedNodesById.has(edge.to)) invalidDiagramField(`paste.edges.${edge.id}`, 'unknown endpoint')
        requireDiagramEdgeKind(edge.kind, diagram.meta.type, `paste.edges.${edge.id}.kind`)
        requireDiagramEdgeLabel(edge.label, diagram.meta.type, diagram.meta.preset, source.kind, `paste.edges.${edge.id}.label`)
        if ((edge.fromCardinality !== undefined || edge.toCardinality !== undefined) && diagram.meta.type !== 'entity') {
            invalidDiagramField(`paste.edges.${edge.id}.cardinality`, 'value only allowed for entity diagrams')
        }
    }

    private static createPastedGroup(
        source: ReadonlyDiagramData['groups'][number],
        nodeIds: ReadonlyMap<string, string>,
        groupIds: ReadonlyMap<string, string>,
        offset: number,
    ) {
        const id = groupIds.get(source.id)
        if (!id) invalidDiagramField('paste.groups', `missing ID mapping for group ${source.id}`)
        const mappedNodeIds = source.nodeIds.map((nodeId) => {
            const mappedId = nodeIds.get(nodeId)
            if (!mappedId) invalidDiagramField(`paste.groups.${source.id}.nodeIds`, `unknown node ${nodeId}`)

            return mappedId
        })
        const group: DiagramGroup = {
            ...source,
            id,
            nodeIds: mappedNodeIds,
            ...(source.x === undefined ? {} : { x: source.x + offset }),
            ...(source.y === undefined ? {} : { y: source.y + offset }),
        }
        validateNewGroup(group)

        return group
    }

    private createPastedSequenceFragment(
        source: NonNullable<ReadonlyDiagramData['fragments']>[number],
        edgeIds: ReadonlyMap<string, string>,
        fragmentIds: ReadonlyMap<string, string>,
    ) {
        const id = fragmentIds.get(source.id)
        if (!id) invalidDiagramField('paste.fragments', `missing ID mapping for fragment ${source.id}`)
        const regions = source.regions.map((region) => ({
            edgeIds: region.edgeIds.map((edgeId) => {
                const mappedId = edgeIds.get(edgeId)
                if (!mappedId) invalidDiagramField(`paste.fragments.${source.id}.regions.edgeIds`, `unknown edge ${edgeId}`)

                return mappedId
            }),
            guard: region.guard,
        }))
        const fragment: DiagramSequenceFragment = { id, operator: source.operator, regions }
        this.validateNewFragment(fragment)

        return fragment
    }

    private validateNodeRemoval(nodeId: string) {
        const diagram = this.requireEditableDiagram()
        if (diagram.nodes.length === 1) invalidDiagramField('nodes', 'empty array after removing node')
        for (const edge of diagram.edges) {
            if (edge.from === nodeId || edge.to === nodeId) this.validateEdgeRemoval(edge.id)
        }
    }

    private validateEdgeRemoval(edgeId: string) {
        const diagram = this.requireEditableDiagram()
        for (const fragment of diagram.fragments ?? []) {
            for (let index = 0; index < fragment.regions.length; index += 1) {
                const region = fragment.regions[index]
                if (region.edgeIds.includes(edgeId) && region.edgeIds.length === 1) {
                    invalidDiagramField(`fragments.${fragment.id}.regions[${index}].edgeIds`, 'empty array after removing edge')
                }
            }
        }
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

    private generateReservedObjectId(reservedIds: Set<string>) {
        const id = this.generateObjectId((candidate) => reservedIds.has(candidate))
        reservedIds.add(id)

        return id
    }

    private requireOwnedNodeIds(nodeIds: readonly string[]) {
        const owned: string[] = []
        for (const nodeId of nodeIds) {
            if (!this.nodesById.has(nodeId)) invalidDiagramField('groups.new.nodeIds', `unknown node ${nodeId}`)
            if (owned.includes(nodeId)) invalidDiagramField('groups.new.nodeIds', `duplicate node ${nodeId}`)
            owned.push(nodeId)
        }

        return owned
    }

    private requireOwnedRegions(
        operator: DiagramSequenceOperator,
        regions: readonly DiagramSequenceFragmentRegion[],
        fieldPath = 'fragments.new.regions',
    ) {
        const requiredRegionCount = operator === 'alt' ? 2 : 1
        if (regions.length !== requiredRegionCount) invalidDiagramField(fieldPath, `expected ${requiredRegionCount} regions`)
        const seenEdgeIds = new Set<string>()

        return regions.map((region, regionIndex): DiagramSequenceFragmentRegion => ({
            edgeIds: region.edgeIds.map((edgeId) => {
                if (!this.edgesById.has(edgeId)) invalidDiagramField(`${fieldPath}[${regionIndex}].edgeIds`, `unknown edge ${edgeId}`)
                if (seenEdgeIds.has(edgeId)) invalidDiagramField(fieldPath, `duplicate edge ${edgeId}`)
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
        this.purgeChangesOwnedBy(`edge:${edgeId}`)
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
        this.markFragmentRegionFieldChange(fragment.id, regionIndex, 'edgeIds', region.edgeIds)
        events.push(fragmentRegionMembershipEvent(fragment.id, regionIndex, [], [edgeId]))

        return true
    }

    private detachGroupMembers(group: DiagramGroup, nodeIds: ReadonlySet<string>, events: PendingMembershipEvent[]) {
        const removedIds = group.nodeIds.filter((nodeId) => nodeIds.has(nodeId))
        if (removedIds.length === 0) return

        for (let index = group.nodeIds.length - 1; index >= 0; index -= 1) {
            if (nodeIds.has(group.nodeIds[index])) group.nodeIds.splice(index, 1)
        }
        this.groupNodeIdsById.set(group.id, Object.freeze([...group.nodeIds]))
        for (const nodeId of removedIds) this.markGroupMembership(group.id, nodeId, false)
        events.push(groupMembershipEvent(group.id, [], removedIds))
    }

    private detachFragmentRegionEdges(
        fragment: DiagramSequenceFragment,
        regionIndex: number,
        edgeIds: ReadonlySet<string>,
        events: PendingMembershipEvent[],
    ) {
        const region = fragment.regions[regionIndex]
        const removedIds = region.edgeIds.filter((edgeId) => edgeIds.has(edgeId))
        if (removedIds.length === 0) return

        for (let index = region.edgeIds.length - 1; index >= 0; index -= 1) {
            if (edgeIds.has(region.edgeIds[index])) region.edgeIds.splice(index, 1)
        }
        this.fragmentRegionEdgeIdsByKey.set(
            fragmentRegionKey(fragment.id, regionIndex),
            Object.freeze([...region.edgeIds]),
        )
        for (const edgeId of removedIds) this.markFragmentRegionMembership(fragment.id, regionIndex, edgeId, false)
        this.markFragmentRegionFieldChange(fragment.id, regionIndex, 'edgeIds', region.edgeIds)
        events.push(fragmentRegionMembershipEvent(fragment.id, regionIndex, [], removedIds))
    }

    private removeGroups(groupIds: ReadonlySet<string>) {
        const diagram = this.requireEditableDiagram()
        const removedGroups = diagram.groups.filter(({ id }) => groupIds.has(id))
        for (const group of removedGroups) {
            const index = diagram.groups.indexOf(group)

            diagram.groups.splice(index, 1)
            this.groupsById.delete(group.id)
            this.groupNodeIdsById.delete(group.id)
            this.purgeChangesOwnedBy(`group:${group.id}`)
            this.markCollectionMembership('group', group.id, false)
        }
    }

    private removeEdges(edgeIds: ReadonlySet<string>) {
        const diagram = this.requireEditableDiagram()
        const removedEdges = diagram.edges.filter(({ id }) => edgeIds.has(id))
        for (const edge of removedEdges) {
            const index = diagram.edges.indexOf(edge)

            diagram.edges.splice(index, 1)
            this.edgesById.delete(edge.id)
            this.purgeChangesOwnedBy(`edge:${edge.id}`)
            this.markCollectionMembership('edge', edge.id, false)
        }
    }

    private removeNodes(nodeIds: ReadonlySet<string>) {
        const diagram = this.requireEditableDiagram()
        const removedNodes = diagram.nodes.filter(({ id }) => nodeIds.has(id))
        for (const node of removedNodes) {
            const index = diagram.nodes.indexOf(node)

            diagram.nodes.splice(index, 1)
            this.nodesById.delete(node.id)
            this.entityFieldIndexesByNodeId.delete(node.id)
            this.purgeChangesOwnedBy(`node:${node.id}`)
            this.markCollectionMembership('node', node.id, false)
        }
    }

    private originalCollectionObjects(objectKind: DiagramCollectionKind) {
        if (objectKind === 'edge') return this.originalEdgesById
        if (objectKind === 'fragment') return this.originalFragmentsById
        if (objectKind === 'group') return this.originalGroupsById

        return this.originalNodesById
    }

    private currentCollectionObjects(objectKind: DiagramCollectionKind) {
        if (objectKind === 'edge') return this.edgesById
        if (objectKind === 'fragment') return this.fragmentsById
        if (objectKind === 'group') return this.groupsById

        return this.nodesById
    }

    private markCollectionMembership(objectKind: DiagramCollectionKind, objectId: string, present: boolean) {
        const id = `${diagramCollectionMembershipChangedEvent(objectKind)}:${eventScope(objectId)}`
        const originalValue = this.originalCollectionObjects(objectKind).get(objectId) ?? null
        const value = present ? this.currentCollectionObjects(objectKind).get(objectId) ?? null : null
        const change: DiagramChange = {
            category: 'collection',
            field: null,
            id,
            objectId,
            objectKind,
            originalValue,
            ownerId: null,
            regionIndex: null,
            value,
        }
        this.setChange(change, `${objectKind}:${objectId}`, (originalValue === null) === (value === null))
    }

    /** Tracks row changes by relative order of original messages; created messages own their order through their addition. */
    private markSequenceEdgeOrderChanges() {
        const diagram = this.requireEditableDiagram()
        const originalIds = this.changeBaselineDiagram?.edges.map(({ id }) => id) ?? []
        const currentOriginalIds = diagram.edges.filter(({ id }) => this.originalEdgesById.has(id)).map(({ id }) => id)
        for (const edgeId of currentOriginalIds) {
            const originalValue = originalIds.indexOf(edgeId)
            const value = currentOriginalIds.indexOf(edgeId)
            const id = diagramObjectFieldChangedEvent('edge', edgeId, 'row')
            const change: DiagramChange = {
                category: 'field',
                field: 'row',
                id,
                objectId: edgeId,
                objectKind: 'edge',
                originalValue,
                ownerId: null,
                regionIndex: null,
                value,
            }
            this.setChange(change, `edge:${edgeId}`, originalValue === value)
        }
    }

    private markPastedCollection(
        objectKind: DiagramCollectionKind,
        objects: readonly { id: string }[],
        events: PendingMembershipEvent[],
    ) {
        if (objects.length === 0) return

        const addedIds = objects.map(({ id }) => id)
        for (const id of addedIds) this.markCollectionMembership(objectKind, id, true)
        events.push(collectionMembershipEvent(objectKind, addedIds, []))
    }

    private markGroupMembership(groupId: string, nodeId: string, present: boolean) {
        const id = `${diagramGroupMembershipChangedEvent(groupId)}:${eventScope(nodeId)}`
        const originalValue = this.originalGroupsById.get(groupId)?.nodeIds.includes(nodeId) ?? false
        const change: DiagramChange = {
            category: 'membership',
            field: 'nodeIds',
            id,
            objectId: nodeId,
            objectKind: 'node',
            originalValue,
            ownerId: groupId,
            regionIndex: null,
            value: present,
        }
        this.setChange(change, `group:${groupId}`, present === originalValue)
    }

    private markFragmentRegionMembership(fragmentId: string, regionIndex: number, edgeId: string, present: boolean) {
        const id = `${diagramFragmentRegionMembershipChangedEvent(fragmentId, regionIndex)}:${eventScope(edgeId)}`
        const originalRegion = this.originalFragmentsById.get(fragmentId)?.regions[regionIndex]
        const originalValue = originalRegion?.edgeIds.includes(edgeId) ?? false
        const change: DiagramChange = {
            category: 'membership',
            field: 'edgeIds',
            id,
            objectId: edgeId,
            objectKind: 'edge',
            originalValue,
            ownerId: fragmentId,
            regionIndex,
            value: present,
        }
        this.setChange(change, `fragment:${fragmentId}`, present === originalValue)
    }

    private markFragmentFieldChange<Field extends MutableDiagramFragmentField>(
        fragmentId: string,
        field: Field,
        value: DiagramSequenceFragment[Field],
    ) {
        const originalValue = this.originalFragmentsById.get(fragmentId)?.[field]
        const id = diagramObjectFieldChangedEvent('fragment', fragmentId, field)
        const change: DiagramChange = {
            category: 'field',
            field,
            id,
            objectId: fragmentId,
            objectKind: 'fragment',
            originalValue,
            ownerId: null,
            regionIndex: null,
            value,
        }
        this.setChange(change, `fragment:${fragmentId}`, Object.is(originalValue, value))
    }

    private markFragmentRegionFieldChange(
        fragmentId: string,
        regionIndex: number,
        field: keyof DiagramSequenceFragmentRegion,
        value: unknown,
    ) {
        const originalValue = this.originalFragmentsById.get(fragmentId)?.regions[regionIndex]?.[field]
        const matchesOriginal = Array.isArray(originalValue) && Array.isArray(value)
            ? sameOrderedValues(originalValue, value)
            : Object.is(originalValue, value)
        const id = diagramFragmentRegionFieldChangedEvent(fragmentId, regionIndex, field)
        const change: DiagramChange = {
            category: 'field',
            field,
            id,
            objectId: fragmentId,
            objectKind: 'fragment',
            originalValue: Array.isArray(originalValue) ? Object.freeze([...originalValue]) : originalValue,
            ownerId: fragmentId,
            regionIndex,
            value: Array.isArray(value) ? Object.freeze([...value]) : value,
        }
        this.setChange(change, `fragment:${fragmentId}`, matchesOriginal)
    }

    private publishFragmentFieldChange<Field extends MutableDiagramFragmentField>(
        fragmentId: string,
        field: Field,
        previousValue: DiagramSequenceFragment[Field],
        value: DiagramSequenceFragment[Field],
    ) {
        const eventName = diagramObjectFieldChangedEvent('fragment', fragmentId, field)
        const detail = { field, objectId: fragmentId, objectKind: 'fragment' as const, previousValue, value }
        this.dispatchEvent(new CustomEvent<DiagramFieldChangeDetail>(eventName, { detail }))
    }

    private publishFragmentRegionFieldChange(
        fragmentId: string,
        regionIndex: number,
        field: keyof DiagramSequenceFragmentRegion,
        previousValue: unknown,
        value: unknown,
    ) {
        const eventName = diagramFragmentRegionFieldChangedEvent(fragmentId, regionIndex, field)
        const objectId = `${fragmentId}[${regionIndex}]`
        const detail = { field, objectId, objectKind: 'fragment' as const, previousValue, value }
        this.dispatchEvent(new CustomEvent<DiagramFieldChangeDetail>(eventName, { detail }))
    }

    private markEntityFieldMembership(nodeId: string) {
        const originalValue = this.originalNodesById.get(nodeId)?.fields ?? []
        const value = this.requireNode(nodeId).fields ?? []
        const id = diagramEntityFieldMembershipChangedEvent(nodeId)
        const change: DiagramChange = {
            category: 'membership',
            field: 'fields',
            id,
            objectId: nodeId,
            objectKind: 'entityField',
            originalValue,
            ownerId: nodeId,
            regionIndex: null,
            value: value.map((field) => ({ ...field })),
        }
        this.setChange(change, `node:${nodeId}`, DiagramEditSessionService.sameEntityFields(originalValue, value))
    }

    private setChange(change: DiagramChange, ownerKey: string, matchesOriginal: boolean) {
        const existing = this.changesById.get(change.id)
        if (matchesOriginal) {
            if (existing) this.removeChange(change.id)

            return
        }
        if (!existing) {
            this.changesById.set(change.id, change)
            this.changeOwnerById.set(change.id, ownerKey)
            const ownedChangeIds = this.changeIdsByOwner.get(ownerKey) ?? new Set<string>()
            ownedChangeIds.add(change.id)
            this.changeIdsByOwner.set(ownerKey, ownedChangeIds)
            this.changeIdsChangedPending = true

            return
        }
        if (Object.is(existing.value, change.value)) return

        existing.value = change.value
        const changedFields = this.pendingChangeFieldEvents.get(change.id) ?? new Set<DiagramChangeField>()
        changedFields.add('value')
        this.pendingChangeFieldEvents.set(change.id, changedFields)
    }

    private removeChange(changeId: string) {
        if (!this.changesById.delete(changeId)) return
        const ownerKey = this.changeOwnerById.get(changeId)
        if (!ownerKey) throw new Error(`Diagram change ${changeId} has no owner`)

        this.changeOwnerById.delete(changeId)
        const ownedChangeIds = this.changeIdsByOwner.get(ownerKey)
        if (!ownedChangeIds) throw new Error(`Diagram change owner ${ownerKey} has no index`)
        ownedChangeIds.delete(changeId)
        if (ownedChangeIds.size === 0) this.changeIdsByOwner.delete(ownerKey)
        this.pendingChangeFieldEvents.delete(changeId)
        this.changeIdsChangedPending = true
    }

    /** Drops entries for one removed object without inspecting unrelated changes. */
    private purgeChangesOwnedBy(ownerKey: string) {
        const ownedChangeIds = this.changeIdsByOwner.get(ownerKey)
        if (!ownedChangeIds) return

        for (const changeId of [...ownedChangeIds]) this.removeChange(changeId)
    }

    private clearChangeRegistry() {
        if (this.changesById.size > 0) {
            this.changeIds = EMPTY_IDS
            this.changeIdsChangedPending = true
        }
        this.changesById.clear()
        this.changeIdsByOwner.clear()
        this.changeOwnerById.clear()
        this.pendingChangeFieldEvents.clear()
    }

    private refreshChangeIdsSnapshot() {
        if (!this.changeIdsChangedPending) return

        this.changeIds = this.changesById.size > 0 ? Object.freeze([...this.changesById.keys()]) : EMPTY_IDS
    }

    private publishPendingChangeEvents() {
        if (this.changeIdsChangedPending) {
            this.refreshChangeIdsSnapshot()
            this.changeIdsChangedPending = false
            this.dispatchEvent(new Event(CHANGE_IDS_CHANGED_EVENT))
        }
        for (const [changeId, fields] of this.pendingChangeFieldEvents) {
            for (const field of fields) this.dispatchEvent(new Event(diagramChangeFieldChangedEvent(changeId, field)))
        }
        this.pendingChangeFieldEvents.clear()
    }

    /** Publishes one mutation transaction: dirty, change registry, then mutation membership events. */
    private commitTransaction(events: readonly PendingMembershipEvent[]) {
        for (const { detail } of events) {
            if (detail.ownerId !== null || detail.removedIds.length === 0) continue

            const eventName = diagramCollectionMembershipWillChangeEvent(detail.memberKind)
            this.dispatchEvent(new CustomEvent<DiagramMembershipChangeDetail>(eventName, { detail }))
        }
        this.refreshChangeIdsSnapshot()
        const dirty = this.changesById.size > 0
        if (dirty !== this.dirty) {
            this.dirty = dirty
            this.dispatchEvent(new Event(DIRTY_CHANGED_EVENT))
        }
        this.publishPendingChangeEvents()
        for (const { detail, eventName } of events) {
            this.dispatchEvent(new CustomEvent<DiagramMembershipChangeDetail>(eventName, { detail }))
        }
    }

    private finishFieldChange(
        changeId: string,
        ownerKey: string,
        objectKind: DiagramObjectKind,
        objectId: string,
        field: string,
        originalValue: unknown,
        previousValue: unknown,
        value: unknown,
    ) {
        const change: DiagramChange = {
            category: 'field',
            field,
            id: changeId,
            objectId,
            objectKind,
            originalValue,
            ownerId: null,
            regionIndex: null,
            value,
        }
        this.setChange(change, ownerKey, Object.is(originalValue, value))
        this.commitTransaction([])
        const detail = { field, objectId, objectKind, previousValue, value }
        this.dispatchEvent(new CustomEvent<DiagramFieldChangeDetail>(changeId, { detail }))
    }

    /** Republishes only the legend key-list view, then dispatches one legend membership event. */
    private finishLegendMembershipChange(addedKeys: readonly string[], removedKeys: readonly string[]) {
        const diagram = this.requireEditableDiagram()
        this.legendEntryKeys = Object.freeze((diagram.meta.legend ?? []).map(diagramLegendEntryKey))
        for (const entryKey of removedKeys) this.purgeChangesOwnedBy(`legendEntry:${entryKey}`)
        for (const entryKey of [...addedKeys, ...removedKeys]) this.markLegendMembership(entryKey)
        for (const entryKey of addedKeys) {
            if (this.originalLegendEntryKeys.includes(entryKey)) this.markLegendEntryLabelChange(entryKey)
        }
        this.markLegendOrderChanges()
        this.commitTransaction([])
        const detail: DiagramLegendMembershipChangeDetail = { addedKeys, removedKeys }
        this.dispatchEvent(new CustomEvent<DiagramLegendMembershipChangeDetail>(
            diagramLegendMembershipChangedEvent(),
            { detail },
        ))
    }

    private markLegendMembership(entryKey: string) {
        const id = `${diagramLegendMembershipChangedEvent()}:${eventScope(entryKey)}`
        const originalValue = this.originalLegendEntryKeys.includes(entryKey)
        const value = this.legendEntryKeys.includes(entryKey)
        const change: DiagramChange = {
            category: 'membership',
            field: 'legend',
            id,
            objectId: entryKey,
            objectKind: 'legendEntry',
            originalValue,
            ownerId: 'diagram',
            regionIndex: null,
            value,
        }
        this.setChange(change, `legendEntry:${entryKey}`, originalValue === value)
    }

    private markLegendEntryLabelChange(entryKey: string) {
        const originalValue = this.findBaselineLegendEntry(entryKey)?.label
        const value = this.findLegendEntry(entryKey)?.label
        const change: DiagramChange = {
            category: 'field',
            field: 'label',
            id: diagramLegendEntryFieldChangedEvent(entryKey, 'label'),
            objectId: entryKey,
            objectKind: 'legendEntry',
            originalValue,
            ownerId: null,
            regionIndex: null,
            value,
        }
        this.setChange(change, `legendEntry:${entryKey}`, Object.is(originalValue, value))
    }

    /** Tracks reordering by relative order of retained entries, so adding or removing one entry is not a move. */
    private markLegendOrderChanges() {
        const originalRetainedKeys = this.originalLegendEntryKeys.filter((entryKey) => this.legendEntryKeys.includes(entryKey))
        const retainedKeys = this.legendEntryKeys.filter((entryKey) => this.originalLegendEntryKeys.includes(entryKey))
        for (const entryKey of this.originalLegendEntryKeys) {
            const originalValue = originalRetainedKeys.indexOf(entryKey)
            const value = retainedKeys.indexOf(entryKey)
            const change: DiagramChange = {
                category: 'field',
                field: 'order',
                id: diagramLegendEntryFieldChangedEvent(entryKey, 'order'),
                objectId: entryKey,
                objectKind: 'legendEntry',
                originalValue,
                ownerId: null,
                regionIndex: null,
                value,
            }
            this.setChange(change, `legendEntry:${entryKey}`, originalValue === value)
        }
    }

    private finishEntityFieldMembershipChange(
        nodeId: string,
        addedIndexes: readonly number[],
        removedIndexes: readonly number[],
    ) {
        const node = this.requireNode(nodeId)
        this.entityFieldIndexesByNodeId.set(nodeId, DiagramEditSessionService.entityFieldIndexes(node))
        this.markEntityFieldMembership(nodeId)
        this.commitTransaction([])
        const detail = { addedIndexes, nodeId, removedIndexes }
        this.dispatchEvent(new CustomEvent<DiagramEntityFieldMembershipChangeDetail>(
            diagramEntityFieldMembershipChangedEvent(nodeId),
            { detail },
        ))
    }

    private static entityFieldIndexes(node: DiagramNode) {
        return Object.freeze((node.fields ?? []).map((_field, index) => index))
    }

    private static sameEntityFields(left: readonly DiagramEntityField[], right: readonly DiagramEntityField[]) {
        return left.length === right.length && left.every((field, index) => {
            const other = right[index]

            return field.key === other?.key && field.name === other.name && field.type === other.type
        })
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

    private setChangeBaseline(diagram: DiagramData) {
        this.changeBaselineDiagram = diagram
        this.originalLegendEntryKeys = Object.freeze((diagram.meta.legend ?? []).map(diagramLegendEntryKey))
        this.originalEdgesById = indexById(diagram.edges)
        this.originalFragmentsById = indexById(diagram.fragments ?? [])
        this.originalGroupsById = indexById(diagram.groups)
        this.originalNodesById = indexById(diagram.nodes)
    }

    private setSavedRecord(record: DiagramRecord | null) {
        if (record === this.savedRecord) return

        this.savedRecord = record
        this.dispatchEvent(new Event(SAVED_RECORD_CHANGED_EVENT))
    }

    private resetActiveToolboxSection() {
        if (this.activeToolboxSection === 'edit') return

        this.activeToolboxSection = 'edit'
        this.dispatchEvent(new Event(TOOLBOX_SECTION_CHANGED_EVENT))
    }

    private resetActiveInteraction() {
        const gestureChanged = this.transientGesture !== null
        const toolChanged = this.activeTool !== 'select'
        this.activeTool = 'select'
        this.transientGesture = null
        if (gestureChanged) this.dispatchEvent(new Event(TRANSIENT_GESTURE_CHANGED_EVENT))
        if (toolChanged) this.dispatchEvent(new Event(ACTIVE_TOOL_CHANGED_EVENT))

        return gestureChanged || toolChanged
    }

    private resetViewportScale() {
        if (this.viewportScale === DEFAULT_DIAGRAM_ZOOM) return

        this.viewportScale = DEFAULT_DIAGRAM_ZOOM
        this.dispatchEvent(new Event(VIEWPORT_SCALE_CHANGED_EVENT))
    }

    private subscribe(eventType: string, listener: EventListener) {
        this.addEventListener(eventType, listener)

        return () => this.removeEventListener(eventType, listener)
    }
}

export const diagramEditSessionService = register('diagramEditSessionService', new DiagramEditSessionService())
