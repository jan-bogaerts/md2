/** Resolve a branch assignment without using the changing position of a worktree in Git's list. */
export function resolveWorktreeAssignment(records, branch) {
    if (typeof branch !== 'string' || branch.length === 0) {
        return { error: 'Assigned worktree has no stored branch. Select a worktree again.', index: null, record: null };
    }
    const matches = records.filter((record) => record.branch === branch);
    if (matches.length === 0) {
        return { error: `Assigned worktree branch "${branch}" is unavailable. Select a worktree again.`, index: null, record: null };
    }
    if (matches.length > 1) {
        return { error: `Assigned worktree branch "${branch}" matches multiple checkouts. Resolve the duplicate registrations.`, index: null, record: null };
    }
    const record = matches[0];
    if (!record.valid) {
        return { error: `Assigned worktree branch "${branch}" is invalid: ${record.path}: ${record.error}`, index: null, record: null };
    }

    return { error: null, index: records.indexOf(record) + 1, record };
}
