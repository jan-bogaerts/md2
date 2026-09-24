import type { DiagramData, DiagramEdge, DiagramEntityField, DiagramGroup, DiagramNode, DiagramSequenceFragment, DiagramSequenceFragmentRegion } from './diagram_data';
import type { DiagramChange, DiagramChangeField, DiagramCollectionKind, MutableDiagramFragmentField } from './diagram_edit_types';
import {
    diagramCollectionMembershipChangedEvent,
    diagramEntityFieldMembershipChangedEvent,
    diagramFragmentRegionFieldChangedEvent,
    diagramFragmentRegionMembershipChangedEvent,
    diagramGroupMembershipChangedEvent,
    diagramLegendEntryFieldChangedEvent,
    diagramLegendMembershipChangedEvent,
    diagramObjectFieldChangedEvent,
    eventScope,
} from './diagram_edit_events';
import { diagramLegendEntryKey } from './diagram_legend_entry_key';

const EMPTY_IDS: readonly string[] = Object.freeze([]);
export const CHANGE_IDS_CHANGED_EVENT = 'changeIdsChanged';

/** Owns net semantic changes, their owner index, and pending change notifications. */
export class DiagramChangeRegistry {
    private baselineDiagram: DiagramData | null = null;
    private currentDiagram: DiagramData | null = null;
    private changeIds: readonly string[] = EMPTY_IDS;
    private readonly changeIdsByOwner = new Map<string, Set<string>>();
    private changeIdsChangedPending = false;
    private readonly changeOwnerById = new Map<string, string>();
    private readonly changesById = new Map<string, DiagramChange>();
    private readonly pendingChangeFieldEvents = new Map<string, Set<DiagramChangeField>>();
    private originalEdgesById = new Map<string, DiagramEdge>();
    private originalFragmentsById = new Map<string, DiagramSequenceFragment>();
    private originalGroupsById = new Map<string, DiagramGroup>();
    private originalNodesById = new Map<string, DiagramNode>();
    private originalLegendEntryKeys: readonly string[] = EMPTY_IDS;

    get baseline() {
        return this.baselineDiagram;
    }

    get originalEdges(): ReadonlyMap<string, DiagramEdge> {
        return this.originalEdgesById;
    }

    get originalFragments(): ReadonlyMap<string, DiagramSequenceFragment> {
        return this.originalFragmentsById;
    }

    get originalGroups(): ReadonlyMap<string, DiagramGroup> {
        return this.originalGroupsById;
    }

    get originalNodes(): ReadonlyMap<string, DiagramNode> {
        return this.originalNodesById;
    }

    get originalLegendKeys() {
        return this.originalLegendEntryKeys;
    }

    setBaseline(diagram: DiagramData) {
        this.baselineDiagram = diagram;
        this.originalLegendEntryKeys = Object.freeze((diagram.meta.legend ?? []).map(diagramLegendEntryKey));
        this.originalEdgesById = new Map(diagram.edges.map((edge) => [edge.id, edge]));
        this.originalFragmentsById = new Map((diagram.fragments ?? []).map((fragment) => [fragment.id, fragment]));
        this.originalGroupsById = new Map(diagram.groups.map((group) => [group.id, group]));
        this.originalNodesById = new Map(diagram.nodes.map((node) => [node.id, node]));
    }

    clearBaseline() {
        this.baselineDiagram = null;
        this.currentDiagram = null;
        this.originalLegendEntryKeys = EMPTY_IDS;
        this.originalEdgesById.clear();
        this.originalFragmentsById.clear();
        this.originalGroupsById.clear();
        this.originalNodesById.clear();
    }

    setCurrentDiagram(diagram: DiagramData) {
        this.currentDiagram = diagram;
    }

    markCollectionMembership(objectKind: DiagramCollectionKind, objectId: string, present: boolean) {
        const id = `${diagramCollectionMembershipChangedEvent(objectKind)}:${eventScope(objectId)}`;
        const originalValue = this.originalCollectionObjects(objectKind).get(objectId) ?? null;
        const value = present ? this.currentCollectionObjects(objectKind).find((object) => object.id === objectId) ?? null : null;
        const change: DiagramChange = {
            category: 'collection', field: null, id, objectId, objectKind,
            originalValue, ownerId: null, regionIndex: null, value,
        };
        this.set(change, `${objectKind}:${objectId}`, (originalValue === null) === (value === null));
    }

    /** Tracks row changes by relative order of original messages. */
    markSequenceEdgeOrderChanges() {
        const diagram = this.requireCurrentDiagram();
        const originalIds = this.baselineDiagram?.edges.map(({ id }) => id) ?? [];
        const currentOriginalIds = diagram.edges.filter(({ id }) => this.originalEdgesById.has(id)).map(({ id }) => id);
        for (const edgeId of currentOriginalIds) {
            const originalValue = originalIds.indexOf(edgeId);
            const value = currentOriginalIds.indexOf(edgeId);
            const id = diagramObjectFieldChangedEvent('edge', edgeId, 'row');
            const change: DiagramChange = {
                category: 'field', field: 'row', id, objectId: edgeId, objectKind: 'edge',
                originalValue, ownerId: null, regionIndex: null, value,
            };
            this.set(change, `edge:${edgeId}`, originalValue === value);
        }
    }

    markGroupMembership(groupId: string, nodeId: string, present: boolean) {
        const id = `${diagramGroupMembershipChangedEvent(groupId)}:${eventScope(nodeId)}`;
        const originalValue = this.originalGroupsById.get(groupId)?.nodeIds.includes(nodeId) ?? false;
        const change: DiagramChange = {
            category: 'membership', field: 'nodeIds', id, objectId: nodeId, objectKind: 'node',
            originalValue, ownerId: groupId, regionIndex: null, value: present,
        };
        this.set(change, `group:${groupId}`, present === originalValue);
    }

    markFragmentRegionMembership(fragmentId: string, regionIndex: number, edgeId: string, present: boolean) {
        const id = `${diagramFragmentRegionMembershipChangedEvent(fragmentId, regionIndex)}:${eventScope(edgeId)}`;
        const originalRegion = this.originalFragmentsById.get(fragmentId)?.regions[regionIndex];
        const originalValue = originalRegion?.edgeIds.includes(edgeId) ?? false;
        const change: DiagramChange = {
            category: 'membership', field: 'edgeIds', id, objectId: edgeId, objectKind: 'edge',
            originalValue, ownerId: fragmentId, regionIndex, value: present,
        };
        this.set(change, `fragment:${fragmentId}`, present === originalValue);
    }

    markFragmentFieldChange<Field extends MutableDiagramFragmentField>(
        fragmentId: string,
        field: Field,
        value: DiagramSequenceFragment[Field],
    ) {
        const originalValue = this.originalFragmentsById.get(fragmentId)?.[field];
        const id = diagramObjectFieldChangedEvent('fragment', fragmentId, field);
        const change: DiagramChange = {
            category: 'field', field, id, objectId: fragmentId, objectKind: 'fragment',
            originalValue, ownerId: null, regionIndex: null, value,
        };
        this.set(change, `fragment:${fragmentId}`, Object.is(originalValue, value));
    }

    markFragmentRegionFieldChange(
        fragmentId: string,
        regionIndex: number,
        field: keyof DiagramSequenceFragmentRegion,
        value: unknown,
    ) {
        const originalValue = this.originalFragmentsById.get(fragmentId)?.regions[regionIndex]?.[field];
        const matchesOriginal = Array.isArray(originalValue) && Array.isArray(value)
            ? originalValue.length === value.length && originalValue.every((item, index) => item === value[index])
            : Object.is(originalValue, value);
        const id = diagramFragmentRegionFieldChangedEvent(fragmentId, regionIndex, field);
        const change: DiagramChange = {
            category: 'field', field, id, objectId: fragmentId, objectKind: 'fragment',
            originalValue: Array.isArray(originalValue) ? Object.freeze([...originalValue]) : originalValue,
            ownerId: fragmentId, regionIndex, value: Array.isArray(value) ? Object.freeze([...value]) : value,
        };
        this.set(change, `fragment:${fragmentId}`, matchesOriginal);
    }

    markEntityFieldMembership(nodeId: string) {
        const originalValue = this.originalNodesById.get(nodeId)?.fields ?? [];
        const node = this.requireCurrentDiagram().nodes.find(({ id }) => id === nodeId);
        if (!node) throw new Error(`Unknown diagram node ${nodeId}`);

        const value = node.fields ?? [];
        const id = diagramEntityFieldMembershipChangedEvent(nodeId);
        const change: DiagramChange = {
            category: 'membership', field: 'fields', id, objectId: nodeId, objectKind: 'entityField',
            originalValue, ownerId: nodeId, regionIndex: null, value: value.map((field) => ({ ...field })),
        };
        this.set(change, `node:${nodeId}`, DiagramChangeRegistry.sameEntityFields(originalValue, value));
    }

    markLegendPresence() {
        const originalValue = this.baselineDiagram?.meta.legend !== undefined;
        const value = this.requireCurrentDiagram().meta.legend !== undefined;
        const change: DiagramChange = {
            category: 'field', field: 'legend', id: 'diagram:meta:legend', objectId: 'diagram',
            objectKind: 'meta', originalValue, ownerId: null, regionIndex: null, value,
        };
        this.set(change, 'meta:diagram', originalValue === value);
    }

    markLegendMembership(entryKey: string) {
        const id = `${diagramLegendMembershipChangedEvent()}:${eventScope(entryKey)}`;
        const originalValue = this.originalLegendEntryKeys.includes(entryKey);
        const value = this.currentLegendKeys().includes(entryKey);
        const change: DiagramChange = {
            category: 'membership', field: 'legend', id, objectId: entryKey, objectKind: 'legendEntry',
            originalValue, ownerId: 'diagram', regionIndex: null, value,
        };
        this.set(change, `legendEntry:${entryKey}`, originalValue === value);
    }

    markLegendEntryLabelChange(entryKey: string) {
        const originalValue = this.baselineDiagram?.meta.legend?.find((entry) => diagramLegendEntryKey(entry) === entryKey)?.label;
        const value = this.requireCurrentDiagram().meta.legend?.find((entry) => diagramLegendEntryKey(entry) === entryKey)?.label;
        const change: DiagramChange = {
            category: 'field', field: 'label', id: diagramLegendEntryFieldChangedEvent(entryKey, 'label'),
            objectId: entryKey, objectKind: 'legendEntry', originalValue, ownerId: null, regionIndex: null, value,
        };
        this.set(change, `legendEntry:${entryKey}`, Object.is(originalValue, value));
    }

    /** Tracks reordering by relative order of retained entries. */
    markLegendOrderChanges() {
        const currentKeys = this.currentLegendKeys();
        const originalRetainedKeys = this.originalLegendEntryKeys.filter((entryKey) => currentKeys.includes(entryKey));
        const retainedKeys = currentKeys.filter((entryKey) => this.originalLegendEntryKeys.includes(entryKey));
        for (const entryKey of this.originalLegendEntryKeys) {
            const originalValue = originalRetainedKeys.indexOf(entryKey);
            const value = retainedKeys.indexOf(entryKey);
            const change: DiagramChange = {
                category: 'field', field: 'order', id: diagramLegendEntryFieldChangedEvent(entryKey, 'order'),
                objectId: entryKey, objectKind: 'legendEntry', originalValue, ownerId: null, regionIndex: null, value,
            };
            this.set(change, `legendEntry:${entryKey}`, originalValue === value);
        }
    }

    private currentLegendKeys() {
        return (this.requireCurrentDiagram().meta.legend ?? []).map(diagramLegendEntryKey);
    }

    private static sameEntityFields(left: readonly DiagramEntityField[], right: readonly DiagramEntityField[]) {
        return left.length === right.length && left.every((field, index) => {
            const other = right[index];

            return field.key === other?.key && field.name === other.name && field.type === other.type;
        });
    }

    private originalCollectionObjects(objectKind: DiagramCollectionKind) {
        if (objectKind === 'edge') return this.originalEdgesById;
        if (objectKind === 'fragment') return this.originalFragmentsById;
        if (objectKind === 'group') return this.originalGroupsById;

        return this.originalNodesById;
    }

    private currentCollectionObjects(objectKind: DiagramCollectionKind) {
        const diagram = this.requireCurrentDiagram();
        if (objectKind === 'edge') return diagram.edges;
        if (objectKind === 'fragment') return diagram.fragments ?? [];
        if (objectKind === 'group') return diagram.groups;

        return diagram.nodes;
    }

    private requireCurrentDiagram() {
        if (!this.currentDiagram) throw new Error('No editable diagram for change tracking');

        return this.currentDiagram;
    }

    get ids() {
        return this.changeIds;
    }

    get hasChanges() {
        return this.changesById.size > 0;
    }

    get(changeId: string) {
        return this.changesById.get(changeId) ?? null;
    }

    set(change: DiagramChange, ownerKey: string, matchesOriginal: boolean) {
        const existing = this.changesById.get(change.id);
        if (matchesOriginal) {
            if (existing) this.remove(change.id);

            return;
        }
        if (!existing) {
            this.changesById.set(change.id, change);
            this.changeOwnerById.set(change.id, ownerKey);
            const ownedChangeIds = this.changeIdsByOwner.get(ownerKey) ?? new Set<string>();
            ownedChangeIds.add(change.id);
            this.changeIdsByOwner.set(ownerKey, ownedChangeIds);
            this.changeIdsChangedPending = true;

            return;
        }
        if (Object.is(existing.value, change.value)) return;

        existing.value = change.value;
        const changedFields = this.pendingChangeFieldEvents.get(change.id) ?? new Set<DiagramChangeField>();
        changedFields.add('value');
        this.pendingChangeFieldEvents.set(change.id, changedFields);
    }

    purgeOwner(ownerKey: string) {
        const ownedChangeIds = this.changeIdsByOwner.get(ownerKey);
        if (!ownedChangeIds) return;

        for (const changeId of [...ownedChangeIds]) this.remove(changeId);
    }

    clear() {
        if (this.changesById.size > 0) {
            this.changeIds = EMPTY_IDS;
            this.changeIdsChangedPending = true;
        }
        this.changesById.clear();
        this.changeIdsByOwner.clear();
        this.changeOwnerById.clear();
        this.pendingChangeFieldEvents.clear();
    }

    refreshIds() {
        if (!this.changeIdsChangedPending) return;

        this.changeIds = this.hasChanges ? Object.freeze([...this.changesById.keys()]) : EMPTY_IDS;
    }

    publishPendingEvents(target: EventTarget, fieldEventName: (changeId: string, field: DiagramChangeField) => string) {
        if (this.changeIdsChangedPending) {
            this.refreshIds();
            this.changeIdsChangedPending = false;
            target.dispatchEvent(new Event(CHANGE_IDS_CHANGED_EVENT));
        }
        for (const [changeId, fields] of this.pendingChangeFieldEvents) {
            for (const field of fields) target.dispatchEvent(new Event(fieldEventName(changeId, field)));
        }
        this.pendingChangeFieldEvents.clear();
    }

    private remove(changeId: string) {
        if (!this.changesById.delete(changeId)) return;
        const ownerKey = this.changeOwnerById.get(changeId);
        if (!ownerKey) throw new Error(`Diagram change ${changeId} has no owner`);

        this.changeOwnerById.delete(changeId);
        const ownedChangeIds = this.changeIdsByOwner.get(ownerKey);
        if (!ownedChangeIds) throw new Error(`Diagram change owner ${ownerKey} has no index`);
        ownedChangeIds.delete(changeId);
        if (ownedChangeIds.size === 0) this.changeIdsByOwner.delete(ownerKey);
        this.pendingChangeFieldEvents.delete(changeId);
        this.changeIdsChangedPending = true;
    }
}
