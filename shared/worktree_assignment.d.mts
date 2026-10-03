export interface WorktreeAssignmentRecord {
    branch: string | null;
    error: string | null;
    path: string;
    valid: boolean;
}

export type WorktreeAssignmentResolution<RecordType extends WorktreeAssignmentRecord> =
    | { error: null; index: number; record: RecordType }
    | { error: string; index: null; record: null };

export function resolveWorktreeAssignment<RecordType extends WorktreeAssignmentRecord>(
    records: readonly RecordType[],
    branch: string | null | undefined,
): WorktreeAssignmentResolution<RecordType>;
