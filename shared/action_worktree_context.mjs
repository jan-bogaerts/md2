import { resolveWorktreeAssignment } from './worktree_assignment.mjs';

/** Resolve an action's display number while retaining assignment data needed for safe execution. */
export function actionWorktreeContext(records, worktree, branch, worktreeError) {
    const context = {};
    if (worktreeError) context.worktreeError = worktreeError;
    if (!worktree) return context;
    context.worktree = worktree;
    if (branch) context.worktreeBranch = branch;
    if (worktreeError) return context;
    if (!/^[1-9]\d*$/u.test(worktree) || !Number.isSafeInteger(Number(worktree))) {
        context.worktreeError = `Invalid worktree index: ${worktree}`;
        return context;
    }
    const resolution = resolveWorktreeAssignment(records, branch);
    if (!resolution.error) context.worktree = String(resolution.index);

    return context;
}
