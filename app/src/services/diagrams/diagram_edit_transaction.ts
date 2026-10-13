import type { DiagramData, DiagramNode, DiagramSequenceFragment, DiagramSequenceFragmentRegion } from './diagram_data';
import { sameFormattingValue } from './diagram_formatting';
import { DiagramChangeRegistry } from './diagram_change_registry';
import type {
    DiagramChange, DiagramEntityFieldMembershipChangeDetail,
    DiagramFieldChangeDetail, DiagramLegendMembershipChangeDetail, DiagramMembershipChangeDetail,
    DiagramObjectKind, MutableDiagramFragmentField,
} from './diagram_edit_types';
import {
    diagramChangeFieldChangedEvent, diagramCollectionMembershipWillChangeEvent,
    diagramEntityFieldMembershipChangedEvent, diagramFragmentRegionFieldChangedEvent,
    diagramLegendMembershipChangedEvent, diagramObjectFieldChangedEvent,
} from './diagram_edit_events';
import { diagramLegendEntryKey } from './diagram_legend_entry_key';
import type { PendingMembershipEvent } from './diagram_edit_membership_events';

const DIRTY_CHANGED_EVENT = 'dirtyChanged';
const MODEL_MUTATION_EVENT = 'diagram:modelMutation';

export interface DiagramEditTransactionAccess {
    readonly target: EventTarget;
    readonly changeRegistry: DiagramChangeRegistry;
    getDirty(): boolean;
    setDirty(dirty: boolean): void;
    reconcileSelectedLegendEntry(): void;
    requireDiagram(): DiagramData;
    requireNode(nodeId: string): DiagramNode;
    setLegendEntryKeys(keys: readonly string[]): void;
    setEntityFieldIndexes(nodeId: string, indexes: readonly number[]): void;
}

/** Finalizes edits through the session's sole event target. */
export class DiagramEditTransaction {
    private readonly access: DiagramEditTransactionAccess;

    constructor(access: DiagramEditTransactionAccess) {
        this.access = access;
    }

    commit(events: readonly PendingMembershipEvent[]) {
        const { target, changeRegistry } = this.access;
        this.access.reconcileSelectedLegendEntry();
        for (const { detail } of events) {
            if (detail.ownerId !== null || detail.removedIds.length === 0) continue;
            const eventName = diagramCollectionMembershipWillChangeEvent(detail.memberKind);
            target.dispatchEvent(new CustomEvent<DiagramMembershipChangeDetail>(eventName, { detail }));
        }
        changeRegistry.refreshIds();
        const dirty = changeRegistry.hasChanges;
        if (dirty !== this.access.getDirty()) {
            this.access.setDirty(dirty);
            target.dispatchEvent(new Event(DIRTY_CHANGED_EVENT));
        }
        changeRegistry.publishPendingEvents(target, diagramChangeFieldChangedEvent);
        for (const { detail, eventName } of events) {
            target.dispatchEvent(new CustomEvent<DiagramMembershipChangeDetail>(eventName, { detail }));
        }
        target.dispatchEvent(new Event(MODEL_MUTATION_EVENT));
    }

    finishFieldChange(
        changeId: string, ownerKey: string, objectKind: DiagramObjectKind, objectId: string,
        field: string, originalValue: unknown, previousValue: unknown, value: unknown,
    ) {
        const change: DiagramChange = {
            category: 'field', field, id: changeId, objectId, objectKind,
            originalValue, ownerId: null, regionIndex: null, value,
        };
        this.access.changeRegistry.set(change, ownerKey, Object.is(originalValue, value));
        this.commit([]);
        const detail = { field, objectId, objectKind, previousValue, value };
        this.access.target.dispatchEvent(new CustomEvent<DiagramFieldChangeDetail>(changeId, { detail }));
    }

    finishFormattingChange(
        changeId: string, objectId: string, field: string,
        originalValue: unknown, previousValue: unknown, value: unknown,
    ) {
        const change: DiagramChange = {
            category: 'field', field, id: changeId, objectId, objectKind: 'formatting',
            originalValue, ownerId: null, regionIndex: null, value,
        };
        this.access.changeRegistry.set(change, `formatting:${objectId}:${field}`, sameFormattingValue(originalValue, value));
        this.commit([]);
        const detail = { field, objectId, objectKind: 'formatting' as const, previousValue, value };
        this.access.target.dispatchEvent(new CustomEvent<DiagramFieldChangeDetail>(changeId, { detail }));
    }

    finishLegendMembershipChange(addedKeys: readonly string[], removedKeys: readonly string[]) {
        const { changeRegistry, target } = this.access;
        const diagram = this.access.requireDiagram();
        this.access.setLegendEntryKeys(Object.freeze((diagram.meta.legend ?? []).map(diagramLegendEntryKey)));
        changeRegistry.markLegendPresence();
        for (const entryKey of removedKeys) changeRegistry.purgeOwner(`legendEntry:${entryKey}`);
        for (const entryKey of [...addedKeys, ...removedKeys]) changeRegistry.markLegendMembership(entryKey);
        for (const entryKey of addedKeys) {
            if (changeRegistry.originalLegendKeys.includes(entryKey)) changeRegistry.markLegendEntryLabelChange(entryKey);
        }
        changeRegistry.markLegendOrderChanges();
        this.commit([]);
        const detail: DiagramLegendMembershipChangeDetail = { addedKeys, removedKeys };
        target.dispatchEvent(new CustomEvent<DiagramLegendMembershipChangeDetail>(
            diagramLegendMembershipChangedEvent(), { detail },
        ));
    }

    finishEntityFieldMembershipChange(nodeId: string, addedIndexes: readonly number[], removedIndexes: readonly number[]) {
        const node = this.access.requireNode(nodeId);
        const indexes = Object.freeze((node.fields ?? []).map((_field, index) => index));
        this.access.setEntityFieldIndexes(nodeId, indexes);
        this.access.changeRegistry.markEntityFieldMembership(nodeId);
        this.commit([]);
        const detail = { addedIndexes, nodeId, removedIndexes };
        this.access.target.dispatchEvent(new CustomEvent<DiagramEntityFieldMembershipChangeDetail>(
            diagramEntityFieldMembershipChangedEvent(nodeId), { detail },
        ));
    }

    publishFragmentFieldChange<Field extends MutableDiagramFragmentField>(
        fragmentId: string, field: Field, previousValue: DiagramSequenceFragment[Field], value: DiagramSequenceFragment[Field],
    ) {
        const eventName = diagramObjectFieldChangedEvent('fragment', fragmentId, field);
        const detail = { field, objectId: fragmentId, objectKind: 'fragment' as const, previousValue, value };
        this.access.target.dispatchEvent(new CustomEvent<DiagramFieldChangeDetail>(eventName, { detail }));
    }

    publishFragmentRegionFieldChange(
        fragmentId: string, regionIndex: number, field: keyof DiagramSequenceFragmentRegion,
        previousValue: unknown, value: unknown,
    ) {
        const eventName = diagramFragmentRegionFieldChangedEvent(fragmentId, regionIndex, field);
        const objectId = `${fragmentId}[${regionIndex}]`;
        const detail = { field, objectId, objectKind: 'fragment' as const, previousValue, value };
        this.access.target.dispatchEvent(new CustomEvent<DiagramFieldChangeDetail>(eventName, { detail }));
    }
}
