import type { ProjectReference } from '../../data/data_types'
import { generateUuid } from '../../data/uuid'
import { dialogService } from '../dialog_service'
import { register } from '../service_injector'
import {
    type DiagramData,
    type DiagramEdge,
    type DiagramGroup,
    type DiagramLegendEntryData,
    type DiagramNode,
    type DiagramSequenceFragment,
} from './diagram_data'
import type { DiagramRecord } from './diagram_index'
import { DiagramChangeRegistry } from './diagram_change_registry'
import { DiagramEditContext } from './diagram_edit_context'
import { DiagramFormattingEditor } from './diagram_formatting_editor'
import { DiagramLegendEditor } from './diagram_legend_editor'
import { DiagramObjectFieldEditor } from './diagram_object_field_editor'
import { DiagramFragmentEditor } from './diagram_fragment_editor'
import { DiagramEntityFieldEditor } from './diagram_entity_field_editor'
import { collectionMembershipEvent, fragmentRegionMembershipEvent, groupMembershipEvent, type PendingMembershipEvent } from './diagram_edit_membership_events'
import type { DiagramEditErrorReporter } from './diagram_edit_operation_validation'
import {
    DiagramEditValidation,
    invalidDiagramField,
    validateNewGroup,
} from './diagram_edit_validation'
import { prepareDiagramPaste } from './diagram_paste_preparation'
import { planDiagramRemoval } from './diagram_removal_plan'
import { diagramViewService, type DiagramViewSourceSnapshot } from './diagram_view_service'
import { DEFAULT_DIAGRAM_ZOOM } from './diagram_zoom'
import type {
    DiagramCollectionKind,
    DiagramCreationTool,
    DiagramEditSessionSnapshot,
    DiagramPasteFragment,
    DiagramPasteResult,
    DiagramPersistentTool,
    DiagramRemovalIdentity,
    DiagramTransientGesture,
    NewDiagramEdge,
    NewDiagramGroup,
    NewDiagramNode,
    OriginalDiagramSnapshot,
} from './diagram_edit_types'
import {
    diagramChangeFieldChangedEvent,
} from './diagram_edit_events'
import { diagramLegendEntryKey } from './diagram_legend_entry_key'
import { DiagramEditSessionReadAdapter, type DiagramEditReadState } from './diagram_edit_session_read_adapter'
import { derivedDiagramLegendEntries } from './diagram_derived_legend'
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

function indexById<Item extends { id: string }>(items: Item[]) {
    return new Map(items.map((item) => [item.id, item]))
}

function frozenIds<Item extends { id: string }>(items: readonly Item[]) {
    return Object.freeze(items.map(({ id }) => id))
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
    readonly formatting: DiagramFormattingEditor
    readonly legend: DiagramLegendEditor
    readonly objects: DiagramObjectFieldEditor
    readonly fragments: DiagramFragmentEditor
    readonly entityFields: DiagramEntityFieldEditor

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
            hasFragment: (id) => this.fragmentsById.has(id),
            requireEdge: (id) => this.requireEdge(id),
            requireGroup: (id) => this.requireGroup(id),
            requireFragment: (id) => this.requireFragment(id),
            setEdgeIds: (ids) => { this.edgeIds = ids },
            setFragmentIds: (ids) => { this.fragmentIds = ids },
            setGroupNodeIds: (id, ids) => { this.groupNodeIdsById.set(id, ids) },
            addFragment: (fragment) => { this.fragmentsById.set(fragment.id, fragment) },
            deleteFragment: (id) => { this.fragmentsById.delete(id) },
            getLegendEntryKeys: () => this.legendEntryKeys,
            setLegendEntryKeys: (keys) => { this.legendEntryKeys = keys },
            setEntityFieldIndexes: (nodeId, indexes) => { this.entityFieldIndexesByNodeId.set(nodeId, indexes) },
        })
        this.formatting = new DiagramFormattingEditor(this.editContext)
        this.legend = new DiagramLegendEditor(this.editContext)
        this.objects = new DiagramObjectFieldEditor(this.editContext)
        this.fragments = new DiagramFragmentEditor(this.editContext)
        this.entityFields = new DiagramEntityFieldEditor(this.editContext)
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

    private requireOwnedNodeIds(nodeIds: readonly string[]) {
        const owned: string[] = []
        for (const nodeId of nodeIds) {
            if (!this.nodesById.has(nodeId)) invalidDiagramField('groups.new.nodeIds', `unknown node ${nodeId}`)
            if (owned.includes(nodeId)) invalidDiagramField('groups.new.nodeIds', `duplicate node ${nodeId}`)
            owned.push(nodeId)
        }

        return owned
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
