import type { DiagramConnectionPoint, DiagramEdge, DiagramEntityField, DiagramGroup, DiagramMeta, DiagramNode, DiagramSequenceFragment, DiagramSequenceFragmentRegion, DiagramRole, DiagramEdgeKind, DiagramFormatting } from './diagram_data';
import type { DiagramScaleField } from './diagram_formatting';
import { diagramScale } from './diagram_formatting';
import type { DiagramRecord } from './diagram_index';
import { CHANGE_IDS_CHANGED_EVENT, type DiagramChangeRegistry } from './diagram_change_registry';
import type { DeepReadonly, DiagramChange, DiagramChangeField, DiagramCollectionKind, DiagramConnectionEndpoint, DiagramCreationTool, DiagramEditSessionSnapshot, DiagramPersistentTool, DiagramTransientGesture, MutableDiagramLegendEntryField, OriginalDiagramSnapshot, ReadonlyDiagramData } from './diagram_edit_types';
import { diagramChangeFieldChangedEvent, diagramCollectionMembershipChangedEvent, diagramCollectionMembershipWillChangeEvent, diagramConnectionPointFieldChangedEvent, diagramEntityFieldChangedEvent, diagramEntityFieldMembershipChangedEvent, diagramFormattingCategoryChangedEvent, diagramFormattingScaleChangedEvent, diagramFragmentRegionFieldChangedEvent, diagramFragmentRegionMembershipChangedEvent, diagramGroupMembershipChangedEvent, diagramLegendEntryFieldChangedEvent, diagramLegendMembershipChangedEvent, diagramMetadataFieldChangedEvent, diagramObjectFieldChangedEvent } from './diagram_edit_events';
import { diagramLegendEntryKey } from './diagram_legend_entry_key';
import type { DiagramData, DiagramSequenceFragment as Fragment } from './diagram_data';

export const DIRTY_CHANGED_EVENT = 'dirtyChanged';
export const MODEL_MUTATION_EVENT = 'diagram:modelMutation';
export const ORIGINAL_DIAGRAM_CHANGED_EVENT = 'originalDiagramChanged';
export const SESSION_CHANGED_EVENT = 'sessionChanged';
export const ACTIVE_TOOL_CHANGED_EVENT = 'activeToolChanged';
export const LAST_SELECTED_CREATION_TOOL_CHANGED_EVENT = 'lastSelectedCreationToolChanged';
export const TRANSIENT_GESTURE_CHANGED_EVENT = 'transientGestureChanged';
export const VIEWPORT_SCALE_CHANGED_EVENT = 'viewportScaleChanged';
export const LEGEND_SELECTION_CHANGED_EVENT = 'legend:selection';

export interface DiagramEditReadState {
    activeTool: DiagramPersistentTool;
    changeRegistry: DiagramChangeRegistry;
    dirty: boolean;
    edgeIds: readonly string[];
    editableDiagram: DiagramData | null;
    entityFieldIndexesByNodeId: Map<string, readonly number[]>;
    fragmentIds: readonly string[];
    fragmentsById: Map<string, Fragment>;
    groupIds: readonly string[];
    groupsById: Map<string, DiagramGroup>;
    groupNodeIdsById: Map<string, readonly string[]>;
    lastSelectedCreationTool: DiagramCreationTool | null;
    legendEntryKeys: readonly string[];
    nodeIds: readonly string[];
    nodesById: Map<string, DiagramNode>;
    originalDiagram: OriginalDiagramSnapshot | null;
    savedRecord: DiagramRecord | null;
    selectedLegendEntryKey: string | null;
    session: DiagramEditSessionSnapshot | null;
    transientGesture: DiagramTransientGesture | null;
    viewportScale: number;
    edgesById: Map<string, DiagramEdge>;
}

function asDeepReadonly<Value>(value: Value) {
    return value as DeepReadonly<Value>;
}

/** Reads current session-owned data and subscribes to its scoped events. */
export class DiagramEditSessionReadAdapter {
    private readonly source: EventTarget;

    private readonly getState: () => DiagramEditReadState;

    constructor(source: EventTarget, getState: () => DiagramEditReadState) {
        this.source = source;
        this.getState = getState;
    }

    getDirtySnapshot = () => this.getState().dirty

    getActiveToolSnapshot = () => this.getState().activeTool

    getLastSelectedCreationToolSnapshot = () => this.getState().lastSelectedCreationTool

    getTransientGestureSnapshot = () => this.getState().transientGesture

    getViewportScaleSnapshot = () => this.getState().viewportScale

    getFormattingSnapshot = (): DeepReadonly<DiagramFormatting> | undefined => this.getState().editableDiagram?.formatting

    getFormattingScaleSnapshot = (field: DiagramScaleField) => diagramScale(this.getState().editableDiagram?.formatting, field)

    getNodeRoleFormattingSnapshot = (role: DiagramRole) => this.getState().editableDiagram?.formatting?.nodeRoles?.[role]

    getConnectionKindFormattingSnapshot = (kind: DiagramEdgeKind) => this.getState().editableDiagram?.formatting?.connectionKinds?.[kind]

    getChangeIdsSnapshot = () => this.getState().changeRegistry.ids

    /** Complete change read boundary for review generation; React must use granular change-field snapshots. */
    getChange = (changeId: string): DeepReadonly<DiagramChange> | null => {
        const change = this.getState().changeRegistry.get(changeId)

        return change ? asDeepReadonly(change) : null
    }

    getChangeFieldSnapshot = <Field extends DiagramChangeField>(
        changeId: string,
        field: Field,
    ): DeepReadonly<DiagramChange[Field]> | null => {
        const change = this.getState().changeRegistry.get(changeId)

        return change ? asDeepReadonly(change[field]) : null
    }

    /** Complete read boundary for persistence and agent processing; React must use granular snapshots. */
    getEditableDiagram = (): ReadonlyDiagramData | null => this.getState().editableDiagram

    getOriginalDiagramSnapshot = () => this.getState().originalDiagram

    getSavedRecordSnapshot = () => this.getState().savedRecord

    getSessionSnapshot = () => this.getState().session

    getEdgeIdsSnapshot = () => this.getState().edgeIds

    getFragmentIdsSnapshot = () => this.getState().fragmentIds

    getGroupIdsSnapshot = () => this.getState().groupIds

    getNodeIdsSnapshot = () => this.getState().nodeIds

    /** Ordered legend membership view; entries themselves are read one field at a time. */
    getLegendEntryKeysSnapshot = () => this.getState().legendEntryKeys

    getSelectedLegendEntryKeySnapshot = () => this.getState().selectedLegendEntryKey

    getHasExplicitLegendSnapshot = () => this.getState().editableDiagram?.meta.legend !== undefined

    getLegendEntryFieldSnapshot = <Field extends 'kind' | 'label' | 'nodeKind' | 'role'>(
        entryKey: string,
        field: Field,
    ): string | null => {
        const entry = this.getState().editableDiagram?.meta.legend?.find((entry) => diagramLegendEntryKey(entry) === entryKey) ?? null
        if (!entry) return null

        return (entry as Record<string, string | undefined>)[field] ?? null
    }

    getOriginalLegendEntryFieldSnapshot = <Field extends 'kind' | 'label' | 'nodeKind' | 'role'>(
        entryKey: string,
        field: Field,
    ): string | null => {
        const entry = this.getState().originalDiagram?.diagram.meta.legend?.find(
            (entry) => diagramLegendEntryKey(entry) === entryKey,
        ) ?? null
        if (!entry) return null

        return (entry as Record<string, string | undefined>)[field] ?? null
    }

    getGroupNodeIdsSnapshot = (groupId: string): readonly string[] | null => this.getState().groupNodeIdsById.get(groupId) ?? null

    getEntityFieldIndexesSnapshot = (nodeId: string): readonly number[] | null => (
        this.getState().entityFieldIndexesByNodeId.get(nodeId) ?? null
    )

    getMetadataFieldSnapshot = <Field extends keyof DiagramMeta>(field: Field): DeepReadonly<DiagramMeta[Field]> | null => {
        const diagram = this.getState().editableDiagram

        return diagram ? asDeepReadonly(diagram.meta[field]) : null
    }

    getNodeSnapshot = (nodeId: string): DeepReadonly<DiagramNode> | null => this.getState().nodesById.get(nodeId) ?? null

    getNodeFieldSnapshot = <Field extends keyof DiagramNode>(nodeId: string, field: Field): DeepReadonly<DiagramNode[Field]> | null => {
        const node = this.getState().nodesById.get(nodeId) ?? null

        return node ? asDeepReadonly(node[field]) : null
    }

    getEdgeSnapshot = (edgeId: string): DeepReadonly<DiagramEdge> | null => this.getState().edgesById.get(edgeId) ?? null

    getEdgeFieldSnapshot = <Field extends keyof DiagramEdge>(edgeId: string, field: Field): DeepReadonly<DiagramEdge[Field]> | null => {
        const edge = this.getState().edgesById.get(edgeId) ?? null

        return edge ? asDeepReadonly(edge[field]) : null
    }

    getGroupSnapshot = (groupId: string): DeepReadonly<DiagramGroup> | null => this.getState().groupsById.get(groupId) ?? null

    getGroupFieldSnapshot = <Field extends keyof DiagramGroup>(groupId: string, field: Field): DeepReadonly<DiagramGroup[Field]> | null => {
        const group = this.getState().groupsById.get(groupId) ?? null

        return group ? asDeepReadonly(group[field]) : null
    }

    getFragmentSnapshot = (fragmentId: string): DeepReadonly<DiagramSequenceFragment> | null => (
        this.getState().fragmentsById.get(fragmentId) ?? null
    )

    getFragmentFieldSnapshot = <Field extends keyof DiagramSequenceFragment>(
        fragmentId: string,
        field: Field,
    ): DeepReadonly<DiagramSequenceFragment[Field]> | null => {
        const fragment = this.getState().fragmentsById.get(fragmentId) ?? null

        return fragment ? asDeepReadonly(fragment[field]) : null
    }

    getEntityFieldSnapshot = (nodeId: string, fieldIndex: number): DeepReadonly<DiagramEntityField> | null => (
        this.getState().nodesById.get(nodeId)?.fields?.[fieldIndex] ?? null
    )

    getEntityFieldValueSnapshot = <Field extends keyof DiagramEntityField>(
        nodeId: string,
        fieldIndex: number,
        field: Field,
    ): DeepReadonly<DiagramEntityField[Field]> | null => {
        const entityField = this.getState().nodesById.get(nodeId)?.fields?.[fieldIndex]

        return entityField ? asDeepReadonly(entityField[field]) : null
    }

    getConnectionPointFieldSnapshot = <Field extends keyof DiagramConnectionPoint>(
        edgeId: string,
        endpoint: DiagramConnectionEndpoint,
        field: Field,
    ): DeepReadonly<DiagramConnectionPoint[Field]> | null => {
        const connectionPoint = this.getState().edgesById.get(edgeId)?.[endpoint]

        return connectionPoint ? asDeepReadonly(connectionPoint[field]) : null
    }

    subscribeDirty = (listener: () => void) => this.subscribe(DIRTY_CHANGED_EVENT, listener)

    /** Signals a committed model edit so persistence can queue the current session data. */
    subscribeModelMutation = (listener: () => void) => this.subscribe(MODEL_MUTATION_EVENT, listener)

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

    subscribeLegendSelection = (listener: () => void) => this.subscribe(LEGEND_SELECTION_CHANGED_EVENT, listener)

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

    private subscribe(eventType: string, listener: EventListener) {
        this.source.addEventListener(eventType, listener);

        return () => this.source.removeEventListener(eventType, listener);
    }
}
