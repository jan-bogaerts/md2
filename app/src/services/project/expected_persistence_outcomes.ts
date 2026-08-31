import { normalizePath } from '../../../../shared/path_utils.mjs';
import type { FileEncoding } from '../../data/data_types';

export const EXPECTED_PERSISTENCE_OUTCOME_LIMIT = 1000;

export type ExpectedPersistenceOutcome =
    | { content: string; encoding?: FileEncoding; kind: 'present'; path: string }
    | { kind: 'absent'; path: string };

export type ObservedPersistenceOutcome = ExpectedPersistenceOutcome;
export type PersistenceOutcomeClassification = 'matched' | 'mismatched' | 'pending' | 'untracked';

interface PendingPathOperations {
    operationIds: Set<number>;
    promise: Promise<void>;
    resolve: () => void;
}

interface RegisteredOperation {
    paths: string[];
}

function normalizeOutcome(outcome: ExpectedPersistenceOutcome): ExpectedPersistenceOutcome {
    return { ...outcome, path: normalizePath(outcome.path) };
}

function outcomesMatch(expected: ExpectedPersistenceOutcome, observed: ObservedPersistenceOutcome) {
    if (expected.kind === 'absent' || observed.kind === 'absent') return expected.kind === observed.kind;

    return expected.content === observed.content;
}

function createPendingPathOperations(): PendingPathOperations {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((resolvePromise) => {
        resolve = resolvePromise;
    });

    return { operationIds: new Set(), promise, resolve };
}

/** Owns expected filesystem outcomes for one project and branch scope. */
export class ExpectedPersistenceOutcomes {
    private latestOutcomeByPath = new Map<string, ExpectedPersistenceOutcome>();
    private pendingOperationsByPath = new Map<string, PendingPathOperations>();
    private registeredOperations = new Map<number, RegisteredOperation>();
    private nextOperationId = 1;

    get retainedOutcomeCount() { return this.latestOutcomeByPath.size; }

    shouldVerifyBeforeRegister(outcomes: ExpectedPersistenceOutcome[]) {
        const newPaths = outcomes
            .map(({ path }) => normalizePath(path))
            .filter((path) => !this.latestOutcomeByPath.has(path));

        return this.latestOutcomeByPath.size + new Set(newPaths).size > EXPECTED_PERSISTENCE_OUTCOME_LIMIT;
    }

    registerOperation(outcomes: ExpectedPersistenceOutcome[]) {
        if (outcomes.length === 0) return null;

        const operationId = this.nextOperationId;
        this.nextOperationId += 1;
        const normalizedOutcomes = outcomes.map(normalizeOutcome);
        const paths = [...new Set(normalizedOutcomes.map(({ path }) => path))];
        this.registeredOperations.set(operationId, { paths });

        for (const outcome of normalizedOutcomes) {
            this.latestOutcomeByPath.set(outcome.path, outcome);
            const pendingOperations = this.pendingOperationsByPath.get(outcome.path) ?? createPendingPathOperations();
            pendingOperations.operationIds.add(operationId);
            this.pendingOperationsByPath.set(outcome.path, pendingOperations);
        }

        return operationId;
    }

    settleOperation(operationId: number | null) {
        if (operationId === null) return;

        const operation = this.registeredOperations.get(operationId);
        if (!operation) throw new Error(`Expected persistence operation is not registered: ${operationId}`);

        this.registeredOperations.delete(operationId);
        for (const path of operation.paths) {
            const pendingOperations = this.pendingOperationsByPath.get(path);
            if (!pendingOperations) throw new Error(`Expected persistence path has no pending operation: ${path}`);

            pendingOperations.operationIds.delete(operationId);
            if (pendingOperations.operationIds.size > 0) continue;

            this.pendingOperationsByPath.delete(path);
            pendingOperations.resolve();
        }
    }

    async waitForSettled(path: string) {
        await this.pendingOperationsByPath.get(normalizePath(path))?.promise;
    }

    classify(observedOutcome: ObservedPersistenceOutcome): PersistenceOutcomeClassification {
        const observed = normalizeOutcome(observedOutcome);
        const expected = this.latestOutcomeByPath.get(observed.path);
        if (!expected) return 'untracked';
        if (this.pendingOperationsByPath.has(observed.path)) return 'pending';

        this.latestOutcomeByPath.delete(observed.path);

        return outcomesMatch(expected, observed) ? 'matched' : 'mismatched';
    }

    getExpected(path: string): ExpectedPersistenceOutcome | null {
        return this.latestOutcomeByPath.get(normalizePath(path)) ?? null;
    }

    getRetainedOutcomes() {
        return [...this.latestOutcomeByPath.values()];
    }

    reset() {
        this.latestOutcomeByPath.clear();
        this.pendingOperationsByPath.forEach(({ resolve }) => resolve());
        this.pendingOperationsByPath.clear();
        this.registeredOperations.clear();
    }
}
