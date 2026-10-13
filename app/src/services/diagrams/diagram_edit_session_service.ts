import type { ProjectReference } from '../../data/data_types'
import { generateUuid } from '../../data/uuid'
import { dialogService } from '../dialog_service'
import { register } from '../service_injector'
import {
    requireDiagramString,
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
import { DiagramChangeRegistry } from './diagram_change_registry'
import { DiagramEditContext } from './diagram_edit_context'
import { collectionMembershipEvent, fragmentRegionMembershipEvent, groupMembershipEvent, type PendingMembershipEvent } from './diagram_edit_membership_events'
import type { DiagramEditErrorReporter } from './diagram_edit_operation_validation'
import {
    DiagramEditValidation,
    invalidDiagramField,
    requireEntityFieldValue,
    requireOptionalGridNumber,
    validateConnectionPointValue,
    validateNewGroup,
    validateNewLegendEntry,
} from './diagram_edit_validation'
import { prepareDiagramPaste } from './diagram_paste_preparation'
import { planFragmentUpdate } from './diagram_fragment_update_plan'
import { planEdgeReconnection } from './diagram_edge_reconnection_plan'
import { planDiagramRemoval } from './diagram_removal_plan'
import { diagramViewService, type DiagramViewSourceSnapshot } from './diagram_view_service'
import { DEFAULT_DIAGRAM_ZOOM } from './diagram_zoom'
import type {
    DiagramChange,
    DiagramCollectionKind,
    DiagramConnectionEndpoint,
    DiagramCreationTool,
    DiagramEditSessionSnapshot,
    DiagramFieldChangeDetail,
    DiagramLegendMembershipChangeDetail,
    DiagramPasteFragment,
    DiagramPasteResult,
    DiagramPersistentTool,
    DiagramRemovalIdentity,
    DiagramTransientGesture,
    MutableDiagramEdgeField,
    MutableDiagramEntityField,
    MutableDiagramGroupField,
    MutableDiagramMetaField,
    MutableDiagramNodeField,
    NewDiagramEdge,
    NewDiagramGroup,
    NewDiagramLegendEntry,
    NewDiagramNode,
    NewDiagramSequenceFragment,
    OriginalDiagramSnapshot,
} from './diagram_edit_types'
import {
    diagramChangeFieldChangedEvent,
    diagramConnectionPointFieldChangedEvent,
    diagramEntityFieldChangedEvent,
    diagramFormattingCategoryChangedEvent,
    diagramFormattingScaleChangedEvent,
    diagramLegendEntryFieldChangedEvent,
    diagramLegendMembershipChangedEvent,
    diagramMetadataFieldChangedEvent,
    diagramObjectFieldChangedEvent,
} from './diagram_edit_events'
import { diagramLegendEntryKey } from './diagram_legend_entry_key'
import { DiagramEditSessionReadAdapter, type DiagramEditReadState } from './diagram_edit_session_read_adapter'
import { derivedDiagramLegendEntries } from './diagram_derived_legend'
import { diagramNodeKindLabel } from './diagram_creation_tool_labels'
const DIRTY_CHANGED_EVENT = 'dirtyChanged'
const ORIGINAL_DIAGRAM_CHANGED_EVENT = 'originalDiagramChanged'
const SESSION_CHANGED_EVENT = 'sessionChanged'
const ACTIVE_TOOL_CHANGED_EVENT = 'activeToolChanged'
const LAST_SELECTED_CREATION_TOOL_CHANGED_EVENT = 'lastSelectedCreationToolChanged'
const TRANSIENT_GESTURE_CHANGED_EVENT = 'transientGestureChanged'
const VIEWPORT_SCALE_CHANGED_EVENT = 'viewportScaleChanged'
const LEGEND_SELECTION_CHANGED_EVENT = 'legend:selection'
const EMPTY_IDS: readonly string[] = Object.freeze([])

interface DiagramSourceService {
    getSourceSnapshot(): DiagramViewSourceSnapshot | null
    subscribeSource(listener: () => void): () => void
}

function reportDiagramEditError(message: string) {
    dialogService.displayError(message, { title: 'Diagram edit rejected' })
}

function canonicalLegendLabel(entry: NewDiagramLegendEntry) {
    return entry.label?.trim() || ('role' in entry ? entry.role
        : 'nodeKind' in entry ? diagramNodeKindLabel(entry.nodeKind) : entry.kind)
}

function indexById<Item extends { id: string }>(items: Item[]) {
    return new Map(items.map((item) => [item.id, item]))
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
    private readonly editContext: DiagramEditContext
    private dirty = false
    private edgesById = new Map<string, DiagramEdge>()
    private edgeIds: readonly string[] = EMPTY_IDS
    private editableDiagram: DiagramData | null = null
    private entityFieldIndexesByNodeId = new Map<string, readonly number[]>()
    private fragmentsById = new Map<string, DiagramSequenceFragment>()
    private fragmentIds: readonly string[] = EMPTY_IDS
    private groupsById = new Map<string, DiagramGroup>()
    private legendEntryKeys: readonly string[] = EMPTY_IDS
    private selectedLegendEntryKey: string | null = null
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

    readonly read = new DiagramEditSessionReadAdapter(this, () => this.getReadState())

    private getReadState(): DiagramEditReadState {
        return {
            activeTool: this.activeTool,
            changeRegistry: this.changeRegistry,
            dirty: this.dirty,
            edgeIds: this.edgeIds,
            edgesById: this.edgesById,
            editableDiagram: this.editableDiagram,
            entityFieldIndexesByNodeId: this.entityFieldIndexesByNodeId,
            fragmentIds: this.fragmentIds,
            fragmentsById: this.fragmentsById,
            groupIds: this.groupIds,
            groupsById: this.groupsById,
            groupNodeIdsById: this.groupNodeIdsById,
            lastSelectedCreationTool: this.lastSelectedCreationTool,
            legendEntryKeys: this.legendEntryKeys,
            nodeIds: this.nodeIds,
            nodesById: this.nodesById,
            originalDiagram: this.originalDiagram,
            savedRecord: this.savedRecord,
            selectedLegendEntryKey: this.selectedLegendEntryKey,
            session: this.session,
            transientGesture: this.transientGesture,
            viewportScale: this.viewportScale,
        }
    }

    constructor(
        sourceService: DiagramSourceService = diagramViewService,
        createId: () => string = generateUuid,
        reportValidationError: DiagramEditErrorReporter = reportDiagramEditError,
    ) {
        super()
        this.reportValidationError = reportValidationError
        this.sourceService = sourceService
        this.editContext = new DiagramEditContext({
            target: this,
            changeRegistry: this.changeRegistry,
            createId,
            getDirty: () => this.dirty,
            setDirty: (dirty) => { this.dirty = dirty },
            reconcileSelectedLegendEntry: () => this.reconcileSelectedLegendEntry(),
            requireDiagram: () => this.requireEditableDiagram(),
            requireNode: (nodeId) => this.requireNode(nodeId),
            requireValidation: () => this.requireValidation(),
            reportValidationError,
            hasNode: (id) => this.nodesById.has(id),
            hasEdge: (id) => this.edgesById.has(id),
            setLegendEntryKeys: (keys) => { this.legendEntryKeys = keys },
            setEntityFieldIndexes: (nodeId, indexes) => { this.entityFieldIndexesByNodeId.set(nodeId, indexes) },
        })
    }

    selectLegendEntry(entryKey: string) {
        const diagram = this.requireEditableDiagram()
        const availableKeys = diagram.meta.legend
            ? this.legendEntryKeys
            : DiagramEditSessionService.derivedLegendEntries(diagram).map(diagramLegendEntryKey)
        if (!availableKeys.includes(entryKey)) return false
        if (this.selectedLegendEntryKey === entryKey) return true

        this.selectedLegendEntryKey = entryKey
        this.dispatchEvent(new Event(LEGEND_SELECTION_CHANGED_EVENT))

        return true
    }

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

    /** Restores a clean creation session from the latest saved copy, if present. */
    restoreCreation(sourceDiagramId: string, savedDiagram: DiagramData | null, savedRecord: DiagramRecord | null) {
        if (!sourceDiagramId) throw new Error('Cannot restore a creation session without a source diagram ID')
        if (!!savedDiagram !== !!savedRecord) throw new Error('Saved diagram and record must be restored together')
        if (savedRecord && savedRecord.sourceDiagramId !== sourceDiagramId) {
            throw new Error('Saved diagram copy belongs to a different source')
        }
        this.startSession(sourceDiagramId, savedDiagram, savedRecord)
    }

    private startSession(
        creationSourceDiagramId: string | null,
        savedDiagram: DiagramData | null = null,
        savedRecord: DiagramRecord | null = null,
    ) {
        if (!this.projectKey) throw new Error('Diagram edit session is not bound to a project')
        const source = this.sourceService.getSourceSnapshot()
        if (!source) throw new Error('Cannot start a diagram edit session without an active diagram')
        if (creationSourceDiagramId !== null && creationSourceDiagramId !== source.record.id) {
            throw new Error('Cannot start a creation session for a different diagram source')
        }

        const originalDiagram = { diagram: source.diagram, record: source.record }
        const editableDiagram = structuredClone(savedDiagram ?? source.diagram)
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
        this.clearSelectedLegendEntry()
        this.changeRegistry.setBaseline(savedDiagram ?? source.diagram)
        this.changeRegistry.setCurrentDiagram(editableDiagram)
        this.edgeIds = Object.freeze(editableDiagram.edges.map(({ id }) => id))
        this.fragmentIds = Object.freeze((editableDiagram.fragments ?? []).map(({ id }) => id))
        this.groupIds = Object.freeze(editableDiagram.groups.map(({ id }) => id))
        this.nodeIds = Object.freeze(editableDiagram.nodes.map(({ id }) => id))
        this.groupNodeIdsById = new Map(editableDiagram.groups.map((group) => [group.id, Object.freeze([...group.nodeIds])]))
        this.savedRecord = savedRecord
        this.publish({ dirty: false, editableDiagram, originalDiagram, session })
        if (creationSourceDiagramId !== null && editableDiagram.meta.type === 'mindmap' && editableDiagram.nodes.length === 0) {
            this.setLastSelectedCreationTool('node:root')
        }
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
        this.clearSelectedLegendEntry()
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
        this.editContext.transaction.finishFormattingChange(
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
        this.editContext.transaction.finishFormattingChange(
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
        this.editContext.transaction.finishFormattingChange(
            diagramFormattingCategoryChangedEvent('connectionKind', kind), kind, 'connectionKind',
            this.changeRegistry.baseline?.formatting?.connectionKinds?.[kind], previousValue, nextValue,
        )
    }

    setMetadataField<Field extends MutableDiagramMetaField>(field: Field, value: DiagramMeta[Field]) {
        const diagram = this.requireEditableDiagram()
        const previousValue = diagram.meta[field]
        const trimmedValue = value.trim()
        if (Object.is(previousValue, trimmedValue)) return false
        if (!this.editContext.validateOperation('Set diagram metadata field', () => requireDiagramString(trimmedValue, `meta.${field}`))) return false

        diagram.meta[field] = trimmedValue
        const originalValue = this.changeRegistry.baseline?.meta[field]
        const eventName = diagramMetadataFieldChangedEvent(field)
        this.editContext.transaction.finishFieldChange(eventName, 'meta:diagram', 'meta', 'diagram', field, originalValue, previousValue, trimmedValue)

        return true
    }

    /** Turns displayed semantic categories into editable legend entries. */
    materializeDerivedLegend() {
        const diagram = this.requireEditableDiagram()
        if (diagram.meta.legend !== undefined) return false

        const entries = DiagramEditSessionService.derivedLegendEntries(diagram)
        diagram.meta.legend = entries
        this.editContext.transaction.finishLegendMembershipChange(entries.map(diagramLegendEntryKey), [])

        return true
    }

    /** Appends one explicit legend entry. */
    addLegendEntry(entry: NewDiagramLegendEntry) {
        const diagram = this.requireEditableDiagram()
        const wasDerived = diagram.meta.legend === undefined
        const existingEntries = diagram.meta.legend ?? DiagramEditSessionService.derivedLegendEntries(diagram)
        if (!this.editContext.validateOperation('Add legend entry', () => {
            validateNewLegendEntry(entry, diagram.meta.type, diagram.meta.preset)
            const entryKey = diagramLegendEntryKey(entry as DiagramLegendEntryData)
            if (existingEntries.some((existingEntry) => diagramLegendEntryKey(existingEntry) === entryKey)) {
                invalidDiagramField('meta.legend', `duplicate entry for ${entryKey}`)
            }
        })) return null

        const label = canonicalLegendLabel(entry)
        const added = ('role' in entry ? { label, role: entry.role }
            : 'nodeKind' in entry ? { label, nodeKind: entry.nodeKind }
                : { kind: entry.kind, label }) as DiagramLegendEntryData
        const entryKey = diagramLegendEntryKey(added)
        diagram.meta.legend = [...existingEntries, added]
        const addedKeys = !wasDerived ? [entryKey] : [
            ...existingEntries.map(diagramLegendEntryKey), entryKey,
        ]
        this.editContext.transaction.finishLegendMembershipChange(addedKeys, [])

        return entryKey
    }

    /** Removes one legend entry. Nodes and edges keep their own role and kind fields. */
    removeLegendEntry(entryKey: string) {
        const diagram = this.requireEditableDiagram()
        if (!this.legendEntryKeys.includes(entryKey)) return false

        const legend = (diagram.meta.legend ?? []).filter((entry) => diagramLegendEntryKey(entry) !== entryKey)
        diagram.meta.legend = legend
        this.editContext.transaction.finishLegendMembershipChange([], [entryKey])

        return true
    }

    setLegendEntryLabel(entryKey: string, label: string) {
        const entry = this.requireLegendEntry(entryKey)
        const previousValue = entry.label
        const trimmedValue = label.trim()
        if (Object.is(previousValue, trimmedValue)) return false
        if (!this.editContext.validateOperation(
            'Set legend entry label',
            () => requireDiagramString(trimmedValue, `meta.legend.${entryKey}.label`),
        )) return false

        entry.label = trimmedValue
        const originalValue = this.findBaselineLegendEntry(entryKey)?.label
        const eventName = diagramLegendEntryFieldChangedEvent(entryKey, 'label')
        this.editContext.transaction.finishFieldChange(
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
        if (!this.editContext.validateOperation('Move legend entry', () => {
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
        this.editContext.transaction.commit([])
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
        if (!this.editContext.validateOperation('Set node field', () => {
            this.requireValidation().validateNodeFieldValue(nodeId, field, value)
            this.requireValidation().validateMindmapNode({ ...node, [field]: value }, nodeId)
        })) return false

        node[field] = value
        const originalValue = this.changeRegistry.originalNodes.get(nodeId)?.[field]
        const eventName = diagramObjectFieldChangedEvent('node', nodeId, field)
        this.editContext.transaction.finishFieldChange(eventName, `node:${nodeId}`, 'node', nodeId, field, originalValue, previousValue, value)

        return true
    }

    /** Writes both node dimensions through one validated transaction for aspect-locked shapes. */
    setNodeSize(nodeId: string, width: number | undefined, height: number | undefined) {
        const node = this.requireNode(nodeId)
        const previousWidth = node.width
        const previousHeight = node.height
        if (Object.is(previousWidth, width) && Object.is(previousHeight, height)) return false
        if (!this.editContext.validateOperation('Set node size', () => {
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
        this.editContext.transaction.commit([])
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
        if (!this.editContext.validateOperation('Set edge field', () => this.requireValidation().validateEdgeFieldValue(edge, field, value))) return false

        edge[field] = value
        const originalValue = this.changeRegistry.originalEdges.get(edgeId)?.[field]
        const eventName = diagramObjectFieldChangedEvent('edge', edgeId, field)
        this.editContext.transaction.finishFieldChange(eventName, `edge:${edgeId}`, 'edge', edgeId, field, originalValue, previousValue, value)

        return true
    }

    /** Reassigns one edge endpoint and its explicit attachment in one validated transaction. */
    reconnectEdgeEndpoint(edgeId: string, endpoint: DiagramConnectionEndpoint, nodeId: string) {
        const edge = this.requireEdge(edgeId)
        const plan = planEdgeReconnection(edge, endpoint, nodeId)
        if (!plan) return false

        const { attachment, candidate, edgeField, previousNodeId } = plan
        if (!this.editContext.validateOperation('Reconnect edge endpoint', () => {
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

        this.editContext.transaction.commit([])
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
        if (!this.editContext.validateOperation('Set group field', () => {
            const fieldPath = `groups.${groupId}.${field}`
            if (field === 'label') requireDiagramString(value, fieldPath)
            if (field === 'height' || field === 'width') requireOptionalGridNumber(value, fieldPath, true)
            if (field === 'x' || field === 'y') requireOptionalGridNumber(value, fieldPath)
        })) return false

        group[field] = value
        const originalValue = this.changeRegistry.originalGroups.get(groupId)?.[field]
        const eventName = diagramObjectFieldChangedEvent('group', groupId, field)
        this.editContext.transaction.finishFieldChange(eventName, `group:${groupId}`, 'group', groupId, field, originalValue, previousValue, value)

        return true
    }

    /** Validates one complete fragment edit before applying its field and ordered-membership changes atomically. */
    updateFragment(fragmentId: string, candidate: NewDiagramSequenceFragment): boolean {
        const fragment = this.requireFragment(fragmentId)
        let regions: DiagramSequenceFragmentRegion[] = []
        if (!this.editContext.validateOperation('Update fragment', () => {
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
        this.editContext.transaction.commit(events)
        if (operatorChanged) this.editContext.transaction.publishFragmentFieldChange(fragmentId, 'operator', previousOperator, candidate.operator)
        for (const regionIndex of changedRegionIndexes) {
            const previousRegion = previousRegions[regionIndex]
            const region = fragment.regions[regionIndex]
            if (previousRegion?.guard !== region?.guard) {
                this.editContext.transaction.publishFragmentRegionFieldChange(fragmentId, regionIndex, 'guard', previousRegion?.guard, region?.guard)
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
        if (!this.editContext.validateOperation('Set entity field', () => {
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
        this.editContext.transaction.finishFieldChange(
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
        if (!this.editContext.validateOperation('Add entity field', () => {
            if (!Number.isInteger(index) || index < 0 || index > fields.length) {
                invalidDiagramField(`nodes.${nodeId}.fields`, `invalid insertion index ${index}`)
            }
            requireEntityFieldValue('key', field.key, `nodes.${nodeId}.fields[${index}].key`)
            requireEntityFieldValue('name', field.name, `nodes.${nodeId}.fields[${index}].name`)
            requireEntityFieldValue('type', field.type, `nodes.${nodeId}.fields[${index}].type`)
        })) return false

        if (!node.fields) node.fields = fields
        fields.splice(index, 0, { ...field })
        this.editContext.transaction.finishEntityFieldMembershipChange(nodeId, [index], [])

        return true
    }

    /** Removes one position-addressed field without replacing its owning field array. */
    removeEntityField(nodeId: string, fieldIndex: number) {
        const node = this.requireEntityNode(nodeId)
        const fields = node.fields ?? []
        if (!fields[fieldIndex]) return false

        fields.splice(fieldIndex, 1)
        this.editContext.transaction.finishEntityFieldMembershipChange(nodeId, [], [fieldIndex])

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
        this.editContext.transaction.finishEntityFieldMembershipChange(nodeId, [targetIndex], [fieldIndex])

        return true
    }

    /** Appends a new node and publishes a fresh node ID list; every existing object keeps its reference. */
    createNode(node: NewDiagramNode): string | null {
        const diagram = this.requireEditableDiagram()
        if (!this.editContext.validateOperation('Create node', () => this.requireValidation().validateNewNode(node))) return null
        const id = this.editContext.generateSelectableId()
        const created: DiagramNode = { ...node, id }
        if (node.fields) created.fields = node.fields.map((field) => ({ ...field }))
        diagram.nodes.push(created)
        this.nodesById.set(id, created)
        this.entityFieldIndexesByNodeId.set(id, DiagramEditSessionService.entityFieldIndexes(created))
        this.nodeIds = frozenIds(diagram.nodes)
        this.changeRegistry.markCollectionMembership('node', id, true)
        this.editContext.transaction.commit([collectionMembershipEvent('node', [id], [])])

        return id
    }

    createEdge(edge: NewDiagramEdge): string | null {
        const diagram = this.requireEditableDiagram()
        if (!this.editContext.validateOperation('Create edge', () => this.requireValidation().validateNewEdge(edge))) return null

        return this.insertEdge(edge, diagram.edges.length)
    }

    /** Creates one sequence message at its persisted row index. */
    createSequenceEdge(edge: NewDiagramEdge, rowIndex: number): string | null {
        const diagram = this.requireEditableDiagram()
        if (!this.editContext.validateOperation('Create sequence edge', () => {
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
        if (!this.editContext.validateOperation('Move sequence edge', () => {
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
        this.editContext.transaction.commit([collectionMembershipEvent('edge', [], [])])

        return true
    }

    private insertEdge(edge: NewDiagramEdge, rowIndex: number) {
        const diagram = this.requireEditableDiagram()
        const id = this.editContext.generateSelectableId()
        const created: DiagramEdge = { ...edge, id }
        if (edge.sourceAttachment) created.sourceAttachment = { ...edge.sourceAttachment }
        if (edge.targetAttachment) created.targetAttachment = { ...edge.targetAttachment }
        if (edge.waypoints) created.waypoints = edge.waypoints.map((waypoint) => ({ ...waypoint }))
        diagram.edges.splice(rowIndex, 0, created)
        this.edgesById.set(id, created)
        this.edgeIds = frozenIds(diagram.edges)
        this.changeRegistry.markCollectionMembership('edge', id, true)
        this.editContext.transaction.commit([collectionMembershipEvent('edge', [id], [])])

        return id
    }

    createGroup(group: NewDiagramGroup): string | null {
        const diagram = this.requireEditableDiagram()
        let nodeIds: string[] = []
        if (!this.editContext.validateOperation('Create group', () => {
            validateNewGroup(group)
            nodeIds = this.requireOwnedNodeIds(group.nodeIds)
        })) return null
        const id = this.editContext.generateObjectId((candidate) => this.groupsById.has(candidate))
        const created: DiagramGroup = { ...group, id, nodeIds }
        diagram.groups.push(created)
        this.groupsById.set(id, created)
        this.groupIds = frozenIds(diagram.groups)
        this.groupNodeIdsById.set(id, Object.freeze([...nodeIds]))
        this.changeRegistry.markCollectionMembership('group', id, true)
        this.editContext.transaction.commit([collectionMembershipEvent('group', [id], [])])

        return id
    }

    createFragment(fragment: NewDiagramSequenceFragment): string | null {
        const diagram = this.requireEditableDiagram()
        let regions: DiagramSequenceFragmentRegion[] = []
        if (!this.editContext.validateOperation('Create fragment', () => {
            this.requireValidation().validateNewFragment(fragment)
            regions = this.requireOwnedRegions(fragment.operator, fragment.regions)
        })) return null
        const id = this.editContext.generateObjectId((candidate) => this.fragmentsById.has(candidate))
        const created: DiagramSequenceFragment = { id, operator: fragment.operator, regions }
        if (!diagram.fragments) diagram.fragments = []
        diagram.fragments.push(created)
        this.fragmentsById.set(id, created)
        this.fragmentIds = frozenIds(diagram.fragments)
        this.changeRegistry.markCollectionMembership('fragment', id, true)
        this.editContext.transaction.commit([collectionMembershipEvent('fragment', [id], [])])

        return id
    }

    /** Validates and inserts one self-contained fragment through one collection-membership transaction. */
    pasteFragment(fragment: DiagramPasteFragment, offset: number): DiagramPasteResult | null {
        const diagram = this.requireEditableDiagram()
        const pasted = this.editContext.validateOperationResult('Paste diagram fragment', () => {
            const context = {
                diagram,
                generateId: (reservedIds: Set<string>) => this.editContext.generateReservedObjectId(reservedIds),
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
        this.editContext.transaction.commit(events)
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
        this.editContext.transaction.commit([collectionMembershipEvent('fragment', [], [fragmentId])])

        return true
    }

    /** Deletes selected objects and every invalidated reference host through one mutation transaction. */
    removeObjects(identities: readonly DiagramRemovalIdentity[]): boolean {
        const diagram = this.requireEditableDiagram()
        const removal = { plan: null as ReturnType<typeof planDiagramRemoval> }
        if (!this.editContext.validateOperation('Delete selection', () => {
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
        this.editContext.transaction.commit(events)
        for (const fieldPath of emptiedRegionPaths) {
            this.reportValidationError(`Delete selection validation problem: ${fieldPath} has empty array`)
        }

        return true
    }

    /** Adds one node to one group; the node object and every other collection keep their references. */
    addGroupMember(groupId: string, nodeId: string): boolean {
        const group = this.requireGroup(groupId)
        if (group.nodeIds.includes(nodeId)) return false
        if (!this.editContext.validateOperation('Add group member', () => {
            if (!this.nodesById.has(nodeId)) invalidDiagramField(`groups.${groupId}.nodeIds`, `unknown node ${nodeId}`)
        })) return false

        group.nodeIds.push(nodeId)
        this.groupNodeIdsById.set(groupId, Object.freeze([...group.nodeIds]))
        this.changeRegistry.markGroupMembership(groupId, nodeId, true)
        this.editContext.transaction.commit([groupMembershipEvent(groupId, [nodeId], [])])

        return true
    }

    removeGroupMember(groupId: string, nodeId: string): boolean {
        const group = this.requireGroup(groupId)
        const events: PendingMembershipEvent[] = []
        if (!this.detachGroupMember(group, nodeId, events)) return false

        this.editContext.transaction.commit(events)

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

    private clearSelectedLegendEntry() {
        if (this.selectedLegendEntryKey === null) return
        this.selectedLegendEntryKey = null
        this.dispatchEvent(new Event(LEGEND_SELECTION_CHANGED_EVENT))
    }

    private reconcileSelectedLegendEntry() {
        const entryKey = this.selectedLegendEntryKey
        if (entryKey === null) return
        const diagram = this.requireEditableDiagram()
        if (diagram.meta.legend) {
            if (!this.legendEntryKeys.includes(entryKey)) this.clearSelectedLegendEntry()

            return
        }
        const present = DiagramEditSessionService.derivedLegendEntries(diagram)
            .some((entry) => diagramLegendEntryKey(entry) === entryKey)
        if (!present) this.clearSelectedLegendEntry()
    }

    private static derivedLegendEntries(diagram: DiagramData): DiagramLegendEntryData[] {
        return derivedDiagramLegendEntries(diagram)
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


}

export const diagramEditSessionService = register('diagramEditSessionService', new DiagramEditSessionService())

export type DiagramEditSessionAccess<
    ReadKeys extends keyof DiagramEditSessionReadAdapter,
    WriteKeys extends keyof DiagramEditSessionService = never,
> = { read: Pick<DiagramEditSessionReadAdapter, ReadKeys> } & Pick<DiagramEditSessionService, WriteKeys>
