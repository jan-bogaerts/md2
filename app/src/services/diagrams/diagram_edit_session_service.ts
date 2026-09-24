import type { ProjectReference } from '../../data/data_types'
import { generateUuid } from '../../data/uuid'
import { dialogService } from '../dialog_service'
import { register } from '../service_injector'
import {
    requireDiagramString,
    type DiagramConnectionPoint,
    type DiagramConnectionKindFormatting,
    type DiagramData,
    type DiagramEdge,
    type DiagramEntityField,
    type DiagramGroup,
    type DiagramLegendEntryData,
    type DiagramMeta,
    type DiagramNode,
    type DiagramEdgeKind,
    type DiagramRole,
    type DiagramFormatting,
    type DiagramNodeRoleFormatting,
    type DiagramSequenceFragment,
    type DiagramSequenceFragmentRegion,
    type DiagramSequenceOperator,
} from './diagram_data'
import {
    diagramScale,
    sameFormattingValue,
    type DiagramScaleField,
    withConnectionKindFormatting,
    withDiagramScale,
    withNodeRoleFormatting,
} from './diagram_formatting'
import type { DiagramRecord } from './diagram_index'
import { CHANGE_IDS_CHANGED_EVENT, DiagramChangeRegistry } from './diagram_change_registry'
import {
    DiagramEditValidation,
    invalidDiagramField,
    requireEntityFieldValue,
    requireOptionalGridNumber,
    validateConnectionPointValue,
    validateNewGroup,
    validateNewLegendEntry,
    validationMessage,
} from './diagram_edit_validation'
import { prepareDiagramPaste } from './diagram_paste_preparation'
import { planFragmentUpdate } from './diagram_fragment_update_plan'
import { planEdgeReconnection } from './diagram_edge_reconnection_plan'
import { planDiagramRemoval } from './diagram_removal_plan'
import { diagramViewService, type DiagramViewSourceSnapshot } from './diagram_view_service'
import { DEFAULT_DIAGRAM_ZOOM } from './diagram_zoom'
import type {
    DeepReadonly,
    DiagramChange,
    DiagramChangeField,
    DiagramCollectionKind,
    DiagramConnectionEndpoint,
    DiagramCreationTool,
    DiagramEditSessionSnapshot,
    DiagramEntityFieldMembershipChangeDetail,
    DiagramFieldChangeDetail,
    DiagramLegendMembershipChangeDetail,
    DiagramMembershipChangeDetail,
    DiagramObjectKind,
    DiagramPasteFragment,
    DiagramPasteResult,
    DiagramPersistentTool,
    DiagramRemovalIdentity,
    DiagramTransientGesture,
    MutableDiagramEdgeField,
    MutableDiagramEntityField,
    MutableDiagramFragmentField,
    MutableDiagramGroupField,
    MutableDiagramLegendEntryField,
    MutableDiagramMetaField,
    MutableDiagramNodeField,
    NewDiagramEdge,
    NewDiagramGroup,
    NewDiagramLegendEntry,
    NewDiagramNode,
    NewDiagramSequenceFragment,
    OriginalDiagramSnapshot,
    ReadonlyDiagramData,
} from './diagram_edit_types'
import {
    diagramChangeFieldChangedEvent,
    diagramCollectionMembershipChangedEvent,
    diagramCollectionMembershipWillChangeEvent,
    diagramConnectionPointFieldChangedEvent,
    diagramEntityFieldChangedEvent,
    diagramEntityFieldMembershipChangedEvent,
    diagramFormattingCategoryChangedEvent,
    diagramFormattingScaleChangedEvent,
    diagramFragmentRegionFieldChangedEvent,
    diagramFragmentRegionMembershipChangedEvent,
    diagramGroupMembershipChangedEvent,
    diagramLegendEntryFieldChangedEvent,
    diagramLegendMembershipChangedEvent,
    diagramMetadataFieldChangedEvent,
    diagramObjectFieldChangedEvent,
} from './diagram_edit_events'
import { diagramLegendEntryKey } from './diagram_legend_entry_key'
const DIRTY_CHANGED_EVENT = 'dirtyChanged'
const ORIGINAL_DIAGRAM_CHANGED_EVENT = 'originalDiagramChanged'
const SESSION_CHANGED_EVENT = 'sessionChanged'
const ACTIVE_TOOL_CHANGED_EVENT = 'activeToolChanged'
const LAST_SELECTED_CREATION_TOOL_CHANGED_EVENT = 'lastSelectedCreationToolChanged'
const TRANSIENT_GESTURE_CHANGED_EVENT = 'transientGestureChanged'
const VIEWPORT_SCALE_CHANGED_EVENT = 'viewportScaleChanged'
const EMPTY_IDS: readonly string[] = Object.freeze([])
const MAX_ID_GENERATION_ATTEMPTS = 100

interface DiagramSourceService {
    getSourceSnapshot(): DiagramViewSourceSnapshot | null
    subscribeSource(listener: () => void): () => void
}

type DiagramEditErrorReporter = (message: string) => void

function reportDiagramEditError(message: string) {
    dialogService.displayError(message, { title: 'Diagram edit rejected' })
}

function canonicalLegendLabel(entry: NewDiagramLegendEntry) {
    return entry.label?.trim() || ('role' in entry ? entry.role : entry.kind)
}

function indexById<Item extends { id: string }>(items: Item[]) {
    return new Map(items.map((item) => [item.id, item]))
}

function asDeepReadonly<Value>(value: Value) {
    return value as DeepReadonly<Value>
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

function frozenIds<Item extends { id: string }>(items: readonly Item[]) {
    return Object.freeze(items.map(({ id }) => id))
}

function sameOrderedValues<Value>(left: readonly Value[], right: readonly Value[]) {
    return left.length === right.length && left.every((value, index) => value === right[index])
}

/** Owns original and editable model data for one project's active diagram edit session. */
export class DiagramEditSessionService extends EventTarget {
    private activeTool: DiagramPersistentTool = 'select'
    private readonly changeRegistry = new DiagramChangeRegistry()
    private readonly createId: () => string
    private dirty = false
    private edgesById = new Map<string, DiagramEdge>()
    private edgeIds: readonly string[] = EMPTY_IDS
    private editableDiagram: DiagramData | null = null
    private entityFieldIndexesByNodeId = new Map<string, readonly number[]>()
    private fragmentsById = new Map<string, DiagramSequenceFragment>()
    private fragmentIds: readonly string[] = EMPTY_IDS
    private groupsById = new Map<string, DiagramGroup>()
    private legendEntryKeys: readonly string[] = EMPTY_IDS
    private lastSelectedCreationTool: DiagramCreationTool | null = null
    private groupIds: readonly string[] = EMPTY_IDS
    private groupNodeIdsById = new Map<string, readonly string[]>()
    private nodesById = new Map<string, DiagramNode>()
    private nodeIds: readonly string[] = EMPTY_IDS
    private originalDiagram: OriginalDiagramSnapshot | null = null
    private projectKey: string | null = null
    private readonly reportValidationError: DiagramEditErrorReporter
    private session: DiagramEditSessionSnapshot | null = null
    private savedRecord: DiagramRecord | null = null
    private readonly sourceService: DiagramSourceService
    private transientGesture: DiagramTransientGesture | null = null
    private unsubscribeSource: (() => void) | null = null
    private validation: DiagramEditValidation | null = null
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

    getLastSelectedCreationToolSnapshot = () => this.lastSelectedCreationTool

    getTransientGestureSnapshot = () => this.transientGesture

    getViewportScaleSnapshot = () => this.viewportScale

    getFormattingSnapshot = (): DeepReadonly<DiagramFormatting> | undefined => this.editableDiagram?.formatting

    getFormattingScaleSnapshot = (field: DiagramScaleField) => diagramScale(this.editableDiagram?.formatting, field)

    getNodeRoleFormattingSnapshot = (role: DiagramRole) => this.editableDiagram?.formatting?.nodeRoles?.[role]

    getConnectionKindFormattingSnapshot = (kind: DiagramEdgeKind) => this.editableDiagram?.formatting?.connectionKinds?.[kind]

    getChangeIdsSnapshot = () => this.changeRegistry.ids

    /** Complete change read boundary for review generation; React must use granular change-field snapshots. */
    getChange = (changeId: string): DeepReadonly<DiagramChange> | null => {
        const change = this.changeRegistry.get(changeId)

        return change ? asDeepReadonly(change) : null
    }

    getChangeFieldSnapshot = <Field extends DiagramChangeField>(
        changeId: string,
        field: Field,
    ): DeepReadonly<DiagramChange[Field]> | null => {
        const change = this.changeRegistry.get(changeId)

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

    getHasExplicitLegendSnapshot = () => this.editableDiagram?.meta.legend !== undefined

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

    subscribeLastSelectedCreationTool = (listener: () => void) => (
        this.subscribe(LAST_SELECTED_CREATION_TOOL_CHANGED_EVENT, listener)
    )

    subscribeTransientGesture = (listener: () => void) => this.subscribe(TRANSIENT_GESTURE_CHANGED_EVENT, listener)

    subscribeViewportScale = (listener: () => void) => this.subscribe(VIEWPORT_SCALE_CHANGED_EVENT, listener)

    subscribeFormattingScale = (field: DiagramScaleField, listener: () => void) => (
        this.subscribe(diagramFormattingScaleChangedEvent(field), listener)
    )

    subscribeNodeRoleFormatting = (role: DiagramRole, listener: () => void) => (
        this.subscribe(diagramFormattingCategoryChangedEvent('nodeRole', role), listener)
    )

    subscribeConnectionKindFormatting = (kind: DiagramEdgeKind, listener: () => void) => (
        this.subscribe(diagramFormattingCategoryChangedEvent('connectionKind', kind), listener)
    )

    subscribeChangeIds = (listener: () => void) => this.subscribe(CHANGE_IDS_CHANGED_EVENT, listener)

    subscribeChangeField = (changeId: string, field: DiagramChangeField, listener: () => void) => (
        this.subscribe(diagramChangeFieldChangedEvent(changeId, field), listener)
    )

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
        this.startSession(null)
    }

    /** Starts editing the source record created by New diagram. */
    startCreation(sourceDiagramId: string) {
        if (!sourceDiagramId) throw new Error('Cannot start a creation session without a source diagram ID')
        this.startSession(sourceDiagramId)
    }

    private startSession(creationSourceDiagramId: string | null) {
        if (!this.projectKey) throw new Error('Diagram edit session is not bound to a project')
        const source = this.sourceService.getSourceSnapshot()
        if (!source) throw new Error('Cannot start a diagram edit session without an active diagram')
        if (creationSourceDiagramId !== null && creationSourceDiagramId !== source.record.id) {
            throw new Error('Cannot start a creation session for a different diagram source')
        }

        const originalDiagram = { diagram: source.diagram, record: source.record }
        const editableDiagram = structuredClone(source.diagram)
        const session = {
            sourceDiagramId: source.record.id,
            ...(creationSourceDiagramId !== null ? { creationSourceDiagramId } : {}),
        }
        this.changeRegistry.clear()
        this.resetLastSelectedCreationTool()
        this.resetActiveInteraction()
        this.resetViewportScale()
        this.edgesById = indexById(editableDiagram.edges)
        this.fragmentsById = indexById(editableDiagram.fragments ?? [])
        this.groupsById = indexById(editableDiagram.groups)
        this.nodesById = indexById(editableDiagram.nodes)
        this.validation = new DiagramEditValidation(editableDiagram, this.nodesById)
        this.entityFieldIndexesByNodeId = new Map(editableDiagram.nodes.map((node) => (
            [node.id, DiagramEditSessionService.entityFieldIndexes(node)]
        )))
        this.legendEntryKeys = Object.freeze((editableDiagram.meta.legend ?? []).map(diagramLegendEntryKey))
        this.changeRegistry.setBaseline(source.diagram)
        this.changeRegistry.setCurrentDiagram(editableDiagram)
        this.edgeIds = Object.freeze(editableDiagram.edges.map(({ id }) => id))
        this.fragmentIds = Object.freeze((editableDiagram.fragments ?? []).map(({ id }) => id))
        this.groupIds = Object.freeze(editableDiagram.groups.map(({ id }) => id))
        this.nodeIds = Object.freeze(editableDiagram.nodes.map(({ id }) => id))
        this.groupNodeIdsById = new Map(editableDiagram.groups.map((group) => [group.id, Object.freeze([...group.nodeIds])]))
        this.savedRecord = null
        this.publish({ dirty: false, editableDiagram, originalDiagram, session })
        this.changeRegistry.publishPendingEvents(this, diagramChangeFieldChangedEvent)
    }

    /** Ends the session and releases every session-owned reference. */
    discard() {
        this.changeRegistry.clear()
        this.resetLastSelectedCreationTool()
        this.resetActiveInteraction()
        this.resetViewportScale()
        this.edgesById.clear()
        this.fragmentsById.clear()
        this.groupsById.clear()
        this.nodesById.clear()
        this.validation = null
        this.entityFieldIndexesByNodeId.clear()
        this.changeRegistry.clearBaseline()
        this.edgeIds = EMPTY_IDS
        this.fragmentIds = EMPTY_IDS
        this.groupIds = EMPTY_IDS
        this.nodeIds = EMPTY_IDS
        this.legendEntryKeys = EMPTY_IDS
        this.groupNodeIdsById.clear()
        this.savedRecord = null
        this.publish({ dirty: false, editableDiagram: null, originalDiagram: null, session: null })
        this.changeRegistry.publishPendingEvents(this, diagramChangeFieldChangedEvent)
    }

    /** Binds later saves to one record and clears changes only when saved data is still current. */
    acknowledgeSavedCopy(record: DiagramRecord, savedDiagram: DiagramData, savedDataIsCurrent: boolean) {
        const session = this.session
        if (!session || record.sourceDiagramId !== session.sourceDiagramId) return false

        this.savedRecord = record
        if (!savedDataIsCurrent) return true

        this.changeRegistry.setBaseline(savedDiagram)
        this.changeRegistry.clear()
        this.publish({
            dirty: false,
            editableDiagram: this.editableDiagram,
            originalDiagram: this.originalDiagram,
            session: this.session,
        })
        this.changeRegistry.publishPendingEvents(this, diagramChangeFieldChangedEvent)

        return true
    }

    setActiveTool(tool: DiagramPersistentTool) {
        if (!this.session) throw new Error('Cannot select a diagram tool without an active edit session')
        if (tool !== 'select' && tool !== 'pan') this.setLastSelectedCreationTool(tool)
        const gestureChanged = this.transientGesture !== null
        const toolChanged = tool !== this.activeTool
        if (!gestureChanged && !toolChanged) return

        this.activeTool = tool
        this.transientGesture = null
        if (gestureChanged) this.dispatchEvent(new Event(TRANSIENT_GESTURE_CHANGED_EVENT))
        if (toolChanged) this.dispatchEvent(new Event(ACTIVE_TOOL_CHANGED_EVENT))
    }

    setLastSelectedCreationTool(tool: DiagramCreationTool) {
        if (!this.session) throw new Error('Cannot select a diagram creation tool without an active edit session')
        if (tool === this.lastSelectedCreationTool) return

        this.lastSelectedCreationTool = tool
        this.dispatchEvent(new Event(LAST_SELECTED_CREATION_TOOL_CHANGED_EVENT))
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
        if (!this.transientGesture) return false

        this.transientGesture = null
        this.dispatchEvent(new Event(TRANSIENT_GESTURE_CHANGED_EVENT))

        return true
    }

    setViewportScale(scale: number) {
        if (!this.session) throw new Error('Cannot zoom diagram without an active edit session')
        if (scale === this.viewportScale) return false

        this.viewportScale = scale
        this.dispatchEvent(new Event(VIEWPORT_SCALE_CHANGED_EVENT))

        return true
    }

    setFormattingScale(field: DiagramScaleField, value: number) {
        const diagram = this.requireEditableDiagram()
        const previousValue = diagramScale(diagram.formatting, field)
        const formatting = withDiagramScale(diagram, field, value)
        if (previousValue === value) return

        diagram.formatting = formatting
        this.finishFormattingChange(
            diagramFormattingScaleChangedEvent(field), 'diagram', field,
            diagramScale(this.changeRegistry.baseline?.formatting, field), previousValue, value,
        )
    }

    setNodeRoleFormatting(role: DiagramRole, value: DiagramNodeRoleFormatting) {
        const diagram = this.requireEditableDiagram()
        const previousValue = diagram.formatting?.nodeRoles?.[role]
        const formatting = withNodeRoleFormatting(diagram, role, value)
        const nextValue = formatting.nodeRoles?.[role]
        if (sameFormattingValue(previousValue, nextValue)) return

        diagram.formatting = formatting
        this.finishFormattingChange(
            diagramFormattingCategoryChangedEvent('nodeRole', role), role, 'nodeRole',
            this.changeRegistry.baseline?.formatting?.nodeRoles?.[role], previousValue, nextValue,
        )
    }

    setConnectionKindFormatting(kind: DiagramEdgeKind, value: DiagramConnectionKindFormatting) {
        const diagram = this.requireEditableDiagram()
        const previousValue = diagram.formatting?.connectionKinds?.[kind]
        const formatting = withConnectionKindFormatting(diagram, kind, value)
        const nextValue = formatting.connectionKinds?.[kind]
        if (sameFormattingValue(previousValue, nextValue)) return

        diagram.formatting = formatting
        this.finishFormattingChange(
            diagramFormattingCategoryChangedEvent('connectionKind', kind), kind, 'connectionKind',
            this.changeRegistry.baseline?.formatting?.connectionKinds?.[kind], previousValue, nextValue,
        )
    }

    setMetadataField<Field extends MutableDiagramMetaField>(field: Field, value: DiagramMeta[Field]) {
        const diagram = this.requireEditableDiagram()
        const previousValue = diagram.meta[field]
        const trimmedValue = value.trim()
        if (Object.is(previousValue, trimmedValue)) return false
        if (!this.validateOperation('Set diagram metadata field', () => requireDiagramString(trimmedValue, `meta.${field}`))) return false

        diagram.meta[field] = trimmedValue
        const originalValue = this.changeRegistry.baseline?.meta[field]
        const eventName = diagramMetadataFieldChangedEvent(field)
        this.finishFieldChange(eventName, 'meta:diagram', 'meta', 'diagram', field, originalValue, previousValue, trimmedValue)

        return true
    }

    /** Turns displayed semantic categories into editable legend entries. */
    materializeDerivedLegend() {
        const diagram = this.requireEditableDiagram()
        if (diagram.meta.legend !== undefined) return false

        const roles = [...new Set(diagram.nodes.map(({ role }) => role))]
        const kinds = [...new Set(diagram.edges.map(({ kind }) => kind))]
        const entries: DiagramLegendEntryData[] = [
            ...roles.map((role) => ({ label: role, role })),
            ...kinds.map((kind) => ({ kind, label: kind })),
        ]
        diagram.meta.legend = entries
        this.finishLegendMembershipChange(entries.map(diagramLegendEntryKey), [])

        return true
    }

    /** Appends one explicit legend entry. */
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
        diagram.meta.legend = legend
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
        this.changeRegistry.markLegendOrderChanges()
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
        if (!this.validateOperation('Set node field', () => {
            this.requireValidation().validateNodeFieldValue(nodeId, field, value)
            this.requireValidation().validateMindmapNode({ ...node, [field]: value }, nodeId)
        })) return false

        node[field] = value
        const originalValue = this.changeRegistry.originalNodes.get(nodeId)?.[field]
        const eventName = diagramObjectFieldChangedEvent('node', nodeId, field)
        this.finishFieldChange(eventName, `node:${nodeId}`, 'node', nodeId, field, originalValue, previousValue, value)

        return true
    }

    /** Writes both node dimensions through one validated transaction for aspect-locked shapes. */
    setNodeSize(nodeId: string, width: number | undefined, height: number | undefined) {
        const node = this.requireNode(nodeId)
        const previousWidth = node.width
        const previousHeight = node.height
        if (Object.is(previousWidth, width) && Object.is(previousHeight, height)) return false
        if (!this.validateOperation('Set node size', () => {
            this.requireValidation().validateNodeFieldValue(nodeId, 'width', width)
            this.requireValidation().validateNodeFieldValue(nodeId, 'height', height)
            this.requireValidation().validateMindmapNode({ ...node, height, width }, nodeId)
        })) return false

        node.width = width
        node.height = height
        const original = this.changeRegistry.originalNodes.get(nodeId)
        const changes = [
            { field: 'width' as const, originalValue: original?.width, previousValue: previousWidth, value: width },
            { field: 'height' as const, originalValue: original?.height, previousValue: previousHeight, value: height },
        ].filter(({ previousValue, value }) => !Object.is(previousValue, value))
        for (const change of changes) {
            const eventName = diagramObjectFieldChangedEvent('node', nodeId, change.field)
            const diagramChange: DiagramChange = {
                category: 'field', field: change.field, id: eventName, objectId: nodeId, objectKind: 'node',
                originalValue: change.originalValue, ownerId: null, regionIndex: null, value: change.value,
            }
            this.changeRegistry.set(diagramChange, `node:${nodeId}`, Object.is(change.originalValue, change.value))
        }
        this.commitTransaction([])
        for (const change of changes) {
            const eventName = diagramObjectFieldChangedEvent('node', nodeId, change.field)
            const detail: DiagramFieldChangeDetail = {
                field: change.field, objectId: nodeId, objectKind: 'node',
                previousValue: change.previousValue, value: change.value,
            }
            this.dispatchEvent(new CustomEvent<DiagramFieldChangeDetail>(eventName, { detail }))
        }

        return true
    }

    setEdgeField<Field extends MutableDiagramEdgeField>(edgeId: string, field: Field, value: DiagramEdge[Field]) {
        const edge = this.requireEdge(edgeId)
        const previousValue = edge[field]
        if (Object.is(previousValue, value)) return false
        if (!this.validateOperation('Set edge field', () => this.requireValidation().validateEdgeFieldValue(edge, field, value))) return false

        edge[field] = value
        const originalValue = this.changeRegistry.originalEdges.get(edgeId)?.[field]
        const eventName = diagramObjectFieldChangedEvent('edge', edgeId, field)
        this.finishFieldChange(eventName, `edge:${edgeId}`, 'edge', edgeId, field, originalValue, previousValue, value)

        return true
    }

    /** Reassigns one edge endpoint and its explicit attachment in one validated transaction. */
    reconnectEdgeEndpoint(edgeId: string, endpoint: DiagramConnectionEndpoint, nodeId: string) {
        const edge = this.requireEdge(edgeId)
        const plan = planEdgeReconnection(edge, endpoint, nodeId)
        if (!plan) return false

        const { attachment, candidate, edgeField, previousNodeId } = plan
        if (!this.validateOperation('Reconnect edge endpoint', () => {
            this.requireValidation().validateEdgeFieldValue(candidate, edgeField, nodeId)
            if (attachment) validateConnectionPointValue(candidate, endpoint, 'nodeId', nodeId)
        })) return false

        edge[edgeField] = nodeId
        if (attachment) attachment.nodeId = nodeId

        const originalEdge = this.changeRegistry.originalEdges.get(edgeId)
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
        this.changeRegistry.set(edgeChange, `edge:${edgeId}`, Object.is(originalEdge?.[edgeField], nodeId))

        const connectionEventName = attachment
            ? diagramConnectionPointFieldChangedEvent(edgeId, endpoint, 'nodeId')
            : null
        if (connectionEventName) {
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
            this.changeRegistry.set(
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
        if (connectionEventName) {
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
        const originalValue = this.changeRegistry.originalGroups.get(groupId)?.[field]
        const eventName = diagramObjectFieldChangedEvent('group', groupId, field)
        this.finishFieldChange(eventName, `group:${groupId}`, 'group', groupId, field, originalValue, previousValue, value)

        return true
    }

    /** Validates one complete fragment edit before applying its field and ordered-membership changes atomically. */
    updateFragment(fragmentId: string, candidate: NewDiagramSequenceFragment): boolean {
        const fragment = this.requireFragment(fragmentId)
        let regions: DiagramSequenceFragmentRegion[] = []
        if (!this.validateOperation('Update fragment', () => {
            this.requireValidation().validateFragment(candidate, `fragments.${fragmentId}`)
            regions = this.requireOwnedRegions(candidate.operator, candidate.regions, `fragments.${fragmentId}.regions`)
        })) return false
        const plan = planFragmentUpdate(fragment, candidate.operator, regions)
        if (!plan) return false

        const { operatorChanged, changedRegionIndexes, previousOperator, previousRegions } = plan
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
        if (operatorChanged) this.changeRegistry.markFragmentFieldChange(fragmentId, 'operator', candidate.operator)
        for (const regionIndex of changedRegionIndexes) {
            const previousRegion = previousRegions[regionIndex]
            const region = fragment.regions[regionIndex]
            const previousEdgeIds = previousRegion?.edgeIds ?? []
            const edgeIds = region?.edgeIds ?? []
            const addedIds = edgeIds.filter((edgeId) => !previousEdgeIds.includes(edgeId))
            const removedIds = previousEdgeIds.filter((edgeId) => !edgeIds.includes(edgeId))
            if (previousRegion?.guard !== region?.guard) {
                this.changeRegistry.markFragmentRegionFieldChange(fragmentId, regionIndex, 'guard', region?.guard)
            }
            if (!sameOrderedValues(previousEdgeIds, edgeIds)) {
                for (const edgeId of addedIds) this.changeRegistry.markFragmentRegionMembership(fragmentId, regionIndex, edgeId, true)
                for (const edgeId of removedIds) this.changeRegistry.markFragmentRegionMembership(fragmentId, regionIndex, edgeId, false)
                this.changeRegistry.markFragmentRegionFieldChange(fragmentId, regionIndex, 'edgeIds', edgeIds)
                events.push(fragmentRegionMembershipEvent(fragmentId, regionIndex, addedIds, removedIds))
            }
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
        const originalValue = this.changeRegistry.originalNodes.get(nodeId)?.fields?.[fieldIndex]?.[field]
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

    /** Appends a new node and publishes a fresh node ID list; every existing object keeps its reference. */
    createNode(node: NewDiagramNode): string | null {
        const diagram = this.requireEditableDiagram()
        if (!this.validateOperation('Create node', () => this.requireValidation().validateNewNode(node))) return null
        const id = this.generateSelectableId()
        const created: DiagramNode = { ...node, id }
        if (node.fields) created.fields = node.fields.map((field) => ({ ...field }))
        diagram.nodes.push(created)
        this.nodesById.set(id, created)
        this.entityFieldIndexesByNodeId.set(id, DiagramEditSessionService.entityFieldIndexes(created))
        this.nodeIds = frozenIds(diagram.nodes)
        this.changeRegistry.markCollectionMembership('node', id, true)
        this.commitTransaction([collectionMembershipEvent('node', [id], [])])

        return id
    }

    createEdge(edge: NewDiagramEdge): string | null {
        const diagram = this.requireEditableDiagram()
        if (!this.validateOperation('Create edge', () => this.requireValidation().validateNewEdge(edge))) return null

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
            this.requireValidation().validateNewEdge(edge)
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
        this.changeRegistry.markSequenceEdgeOrderChanges()
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
        this.changeRegistry.markCollectionMembership('edge', id, true)
        this.commitTransaction([collectionMembershipEvent('edge', [id], [])])

        return id
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
        this.changeRegistry.markCollectionMembership('group', id, true)
        this.commitTransaction([collectionMembershipEvent('group', [id], [])])

        return id
    }

    createFragment(fragment: NewDiagramSequenceFragment): string | null {
        const diagram = this.requireEditableDiagram()
        let regions: DiagramSequenceFragmentRegion[] = []
        if (!this.validateOperation('Create fragment', () => {
            this.requireValidation().validateNewFragment(fragment)
            regions = this.requireOwnedRegions(fragment.operator, fragment.regions)
        })) return null
        const id = this.generateObjectId((candidate) => this.fragmentsById.has(candidate))
        const created: DiagramSequenceFragment = { id, operator: fragment.operator, regions }
        if (!diagram.fragments) diagram.fragments = []
        diagram.fragments.push(created)
        this.fragmentsById.set(id, created)
        this.fragmentIds = frozenIds(diagram.fragments)
        this.changeRegistry.markCollectionMembership('fragment', id, true)
        this.commitTransaction([collectionMembershipEvent('fragment', [id], [])])

        return id
    }

    /** Validates and inserts one self-contained fragment through one collection-membership transaction. */
    pasteFragment(fragment: DiagramPasteFragment, offset: number): DiagramPasteResult | null {
        const diagram = this.requireEditableDiagram()
        const pasted = this.validateOperationResult('Paste diagram fragment', () => {
            const context = {
                diagram,
                generateId: (reservedIds: Set<string>) => this.generateReservedObjectId(reservedIds),
                validateFragment: (candidate: DiagramSequenceFragment) => this.requireValidation().validateNewFragment(candidate),
                validateGroup: validateNewGroup,
                validateNode: (candidate: DiagramNode) => this.requireValidation().validateNewNode(candidate),
            }
            return prepareDiagramPaste(fragment, offset, context)
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
        this.fragmentIds = frozenIds(diagram.fragments)
        this.changeRegistry.purgeOwner(`fragment:${fragmentId}`)
        this.changeRegistry.markCollectionMembership('fragment', fragmentId, false)
        this.commitTransaction([collectionMembershipEvent('fragment', [], [fragmentId])])

        return true
    }

    /** Deletes selected objects and every invalidated reference host through one mutation transaction. */
    removeObjects(identities: readonly DiagramRemovalIdentity[]): boolean {
        const diagram = this.requireEditableDiagram()
        const removal = { plan: null as ReturnType<typeof planDiagramRemoval> }
        if (!this.validateOperation('Delete selection', () => {
            removal.plan = planDiagramRemoval(diagram, identities)
        })) return false
        const plan = removal.plan
        if (!plan) return false

        const { nodeIds, edgeIds, groupIds, removedNodeIds, removedEdgeIds, removedGroupIds, emptiedRegionPaths } = plan
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
        this.changeRegistry.markGroupMembership(groupId, nodeId, true)
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
        return this.changeRegistry.baseline?.meta.legend?.find((entry) => diagramLegendEntryKey(entry) === entryKey) ?? null
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

    private requireValidation() {
        if (!this.validation) throw new Error('Cannot validate a diagram edit without an active session')

        return this.validation
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

    private detachGroupMember(group: DiagramGroup, nodeId: string, events: PendingMembershipEvent[]) {
        const memberIndex = group.nodeIds.indexOf(nodeId)
        if (memberIndex < 0) return false

        group.nodeIds.splice(memberIndex, 1)
        this.groupNodeIdsById.set(group.id, Object.freeze([...group.nodeIds]))
        this.changeRegistry.markGroupMembership(group.id, nodeId, false)
        events.push(groupMembershipEvent(group.id, [], [nodeId]))

        return true
    }

    private detachGroupMembers(group: DiagramGroup, nodeIds: ReadonlySet<string>, events: PendingMembershipEvent[]) {
        const removedIds = group.nodeIds.filter((nodeId) => nodeIds.has(nodeId))
        if (removedIds.length === 0) return

        for (let index = group.nodeIds.length - 1; index >= 0; index -= 1) {
            if (nodeIds.has(group.nodeIds[index])) group.nodeIds.splice(index, 1)
        }
        this.groupNodeIdsById.set(group.id, Object.freeze([...group.nodeIds]))
        for (const nodeId of removedIds) this.changeRegistry.markGroupMembership(group.id, nodeId, false)
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
        for (const edgeId of removedIds) this.changeRegistry.markFragmentRegionMembership(fragment.id, regionIndex, edgeId, false)
        this.changeRegistry.markFragmentRegionFieldChange(fragment.id, regionIndex, 'edgeIds', region.edgeIds)
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
            this.changeRegistry.purgeOwner(`group:${group.id}`)
            this.changeRegistry.markCollectionMembership('group', group.id, false)
        }
    }

    private removeEdges(edgeIds: ReadonlySet<string>) {
        const diagram = this.requireEditableDiagram()
        const removedEdges = diagram.edges.filter(({ id }) => edgeIds.has(id))
        for (const edge of removedEdges) {
            const index = diagram.edges.indexOf(edge)

            diagram.edges.splice(index, 1)
            this.edgesById.delete(edge.id)
            this.changeRegistry.purgeOwner(`edge:${edge.id}`)
            this.changeRegistry.markCollectionMembership('edge', edge.id, false)
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
            this.changeRegistry.purgeOwner(`node:${node.id}`)
            this.changeRegistry.markCollectionMembership('node', node.id, false)
        }
    }

    private markPastedCollection(
        objectKind: DiagramCollectionKind,
        objects: readonly { id: string }[],
        events: PendingMembershipEvent[],
    ) {
        if (objects.length === 0) return

        const addedIds = objects.map(({ id }) => id)
        for (const id of addedIds) this.changeRegistry.markCollectionMembership(objectKind, id, true)
        events.push(collectionMembershipEvent(objectKind, addedIds, []))
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

    /** Publishes one mutation transaction: dirty, change registry, then mutation membership events. */
    private commitTransaction(events: readonly PendingMembershipEvent[]) {
        for (const { detail } of events) {
            if (detail.ownerId !== null || detail.removedIds.length === 0) continue

            const eventName = diagramCollectionMembershipWillChangeEvent(detail.memberKind)
            this.dispatchEvent(new CustomEvent<DiagramMembershipChangeDetail>(eventName, { detail }))
        }
        this.changeRegistry.refreshIds()
        const dirty = this.changeRegistry.hasChanges
        if (dirty !== this.dirty) {
            this.dirty = dirty
            this.dispatchEvent(new Event(DIRTY_CHANGED_EVENT))
        }
        this.changeRegistry.publishPendingEvents(this, diagramChangeFieldChangedEvent)
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
        this.changeRegistry.set(change, ownerKey, Object.is(originalValue, value))
        this.commitTransaction([])
        const detail = { field, objectId, objectKind, previousValue, value }
        this.dispatchEvent(new CustomEvent<DiagramFieldChangeDetail>(changeId, { detail }))
    }

    private finishFormattingChange(
        changeId: string,
        objectId: string,
        field: string,
        originalValue: unknown,
        previousValue: unknown,
        value: unknown,
    ) {
        const change: DiagramChange = {
            category: 'field', field, id: changeId, objectId, objectKind: 'formatting',
            originalValue, ownerId: null, regionIndex: null, value,
        }
        this.changeRegistry.set(change, `formatting:${objectId}:${field}`, sameFormattingValue(originalValue, value))
        this.commitTransaction([])
        const detail = { field, objectId, objectKind: 'formatting' as const, previousValue, value }
        this.dispatchEvent(new CustomEvent<DiagramFieldChangeDetail>(changeId, { detail }))
    }

    /** Republishes only the legend key-list view, then dispatches one legend membership event. */
    private finishLegendMembershipChange(addedKeys: readonly string[], removedKeys: readonly string[]) {
        const diagram = this.requireEditableDiagram()
        this.legendEntryKeys = Object.freeze((diagram.meta.legend ?? []).map(diagramLegendEntryKey))
        this.changeRegistry.markLegendPresence()
        for (const entryKey of removedKeys) this.changeRegistry.purgeOwner(`legendEntry:${entryKey}`)
        for (const entryKey of [...addedKeys, ...removedKeys]) this.changeRegistry.markLegendMembership(entryKey)
        for (const entryKey of addedKeys) {
            if (this.changeRegistry.originalLegendKeys.includes(entryKey)) this.changeRegistry.markLegendEntryLabelChange(entryKey)
        }
        this.changeRegistry.markLegendOrderChanges()
        this.commitTransaction([])
        const detail: DiagramLegendMembershipChangeDetail = { addedKeys, removedKeys }
        this.dispatchEvent(new CustomEvent<DiagramLegendMembershipChangeDetail>(
            diagramLegendMembershipChangedEvent(),
            { detail },
        ))
    }

    private finishEntityFieldMembershipChange(
        nodeId: string,
        addedIndexes: readonly number[],
        removedIndexes: readonly number[],
    ) {
        const node = this.requireNode(nodeId)
        this.entityFieldIndexesByNodeId.set(nodeId, DiagramEditSessionService.entityFieldIndexes(node))
        this.changeRegistry.markEntityFieldMembership(nodeId)
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

    private resetLastSelectedCreationTool() {
        if (this.lastSelectedCreationTool === null) return

        this.lastSelectedCreationTool = null
        this.dispatchEvent(new Event(LAST_SELECTED_CREATION_TOOL_CHANGED_EVENT))
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
