export const ACTIVE_REBASE_LINKED_WORKTREE_ERROR: 'active-rebase-linked-worktree'
export const DIRTY_LINKED_WORKTREE_ERROR: 'dirty-linked-worktree'

export function isActiveRebaseLinkedWorktreeError(error: unknown): error is Error & { code: typeof ACTIVE_REBASE_LINKED_WORKTREE_ERROR }
export function isDirtyLinkedWorktreeError(error: unknown): error is Error & { code: typeof DIRTY_LINKED_WORKTREE_ERROR }
