export const ACTIVE_REBASE_LINKED_WORKTREE_ERROR = 'active-rebase-linked-worktree';
export const DIRTY_LINKED_WORKTREE_ERROR = 'dirty-linked-worktree';

/** True when an error represents a linked worktree temporarily detached by an active rebase. */
export function isActiveRebaseLinkedWorktreeError(error) {
    return !!error && typeof error === 'object' && error.code === ACTIVE_REBASE_LINKED_WORKTREE_ERROR;
}

/** True when an error represents the expected dirty linked-worktree guard. */
export function isDirtyLinkedWorktreeError(error) {
    return !!error && typeof error === 'object' && error.code === DIRTY_LINKED_WORKTREE_ERROR;
}
