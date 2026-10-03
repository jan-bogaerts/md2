import type { WorktreeAssignmentRecord } from './worktree_assignment.mjs';

export function actionWorktreeContext(
    records: readonly WorktreeAssignmentRecord[],
    worktree: string | null | undefined,
    branch: string | null | undefined,
    worktreeError: string | null | undefined,
): { worktree?: string; worktreeBranch?: string; worktreeError?: string };
