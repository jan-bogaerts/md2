export const DIRTY_LINKED_WORKTREE_ERROR = 'dirty-linked-worktree';

/** True when an error represents the expected dirty linked-worktree guard. */
export function isDirtyLinkedWorktreeError(error) {
    return !!error && typeof error === 'object' && error.code === DIRTY_LINKED_WORKTREE_ERROR;
}
