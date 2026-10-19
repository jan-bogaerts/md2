import type { DiagramData, DiagramEdge, DiagramGroup, DiagramNode, DiagramSequenceFragment } from './diagram_data';
import { DiagramChangeRegistry } from './diagram_change_registry';
import { DiagramEditValidation } from './diagram_edit_validation';
import { DiagramEditIdAllocator } from './diagram_edit_id_allocator';
import { DiagramEditTransaction, type DiagramEditTransactionAccess } from './diagram_edit_transaction';
import {
    validateOperation, validateOperationResult, type DiagramEditErrorReporter,
} from './diagram_edit_operation_validation';

export interface DiagramEditContextAccess extends DiagramEditTransactionAccess {
    requireValidation(): DiagramEditValidation;
    reportValidationError: DiagramEditErrorReporter;
    createId: () => string;
    hasNode(id: string): boolean;
    hasEdge(id: string): boolean;
    hasFragment(id: string): boolean;
    requireEdge(id: string): DiagramEdge;
    requireGroup(id: string): DiagramGroup;
    requireFragment(id: string): DiagramSequenceFragment;
    setEdgeIds(ids: readonly string[]): void;
    setFragmentIds(ids: readonly string[]): void;
    setGroupNodeIds(groupId: string, ids: readonly string[]): void;
    addFragment(fragment: DiagramSequenceFragment): void;
    deleteFragment(id: string): void;
    getLegendEntryKeys(): readonly string[];
}

/** Narrow edit boundary backed by the session's live diagram and indexes. */
export class DiagramEditContext {
    readonly transaction: DiagramEditTransaction;
    private readonly idAllocator: DiagramEditIdAllocator;
    private readonly access: DiagramEditContextAccess;

    constructor(access: DiagramEditContextAccess) {
        this.access = access;
        this.transaction = new DiagramEditTransaction(access);
        this.idAllocator = new DiagramEditIdAllocator(access.createId, access.hasNode, access.hasEdge);
    }

    get diagram(): DiagramData {
        return this.access.requireDiagram();
    }

    get validation(): DiagramEditValidation {
        return this.access.requireValidation();
    }

    get changeRegistry(): DiagramChangeRegistry {
        return this.access.changeRegistry;
    }

    get target(): EventTarget {
        return this.access.target;
    }

    get legendEntryKeys(): readonly string[] {
        return this.access.getLegendEntryKeys();
    }

    getNode(id: string): DiagramNode { return this.access.requireNode(id); }
    getEdge(id: string): DiagramEdge { return this.access.requireEdge(id); }
    getGroup(id: string): DiagramGroup { return this.access.requireGroup(id); }
    getFragment(id: string): DiagramSequenceFragment { return this.access.requireFragment(id); }
    hasNode(id: string): boolean { return this.access.hasNode(id); }
    hasEdge(id: string): boolean { return this.access.hasEdge(id); }
    hasFragment(id: string): boolean { return this.access.hasFragment(id); }
    setEdgeIds(ids: readonly string[]): void { this.access.setEdgeIds(ids); }
    setFragmentIds(ids: readonly string[]): void { this.access.setFragmentIds(ids); }
    setGroupNodeIds(groupId: string, ids: readonly string[]): void { this.access.setGroupNodeIds(groupId, ids); }
    addFragment(fragment: DiagramSequenceFragment): void { this.access.addFragment(fragment); }
    deleteFragment(id: string): void { this.access.deleteFragment(id); }
    setLegendEntryKeys(keys: readonly string[]): void { this.access.setLegendEntryKeys(keys); }

    validateOperation(operation: string, validation: () => void) {
        return validateOperation(operation, validation, this.access.reportValidationError);
    }

    validateOperationResult<Value>(operation: string, validation: () => Value): Value | null {
        return validateOperationResult(operation, validation, this.access.reportValidationError);
    }

    generateSelectableId() {
        return this.idAllocator.selectableId();
    }

    generateObjectId(taken: (candidate: string) => boolean) {
        return this.idAllocator.objectId(taken);
    }

    generateReservedObjectId(reservedIds: Set<string>) {
        return this.idAllocator.reservedObjectId(reservedIds);
    }
}
