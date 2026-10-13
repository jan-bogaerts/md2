import type { DiagramData } from './diagram_data';
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
