import { validationMessage } from './diagram_edit_validation';

export type DiagramEditErrorReporter = (message: string) => void;

/** Rejects an invalid operation before its caller mutates the diagram. */
export function validateOperation(operation: string, validation: () => void, reportError: DiagramEditErrorReporter) {
    try {
        validation();
        return true;
    } catch (error) {
        reportError(`${operation} rejected: ${validationMessage(error)}`);
        return false;
    }
}

export function validateOperationResult<Value>(
    operation: string,
    validation: () => Value,
    reportError: DiagramEditErrorReporter,
): Value | null {
    try {
        return validation();
    } catch (error) {
        reportError(`${operation} rejected: ${validationMessage(error)}`);
        return null;
    }
}
