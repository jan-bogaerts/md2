export const DIRTY_LINKED_WORKTREE_ERROR: 'dirty-linked-worktree'

export function isDirtyLinkedWorktreeError(error: unknown): error is Error & { code: typeof DIRTY_LINKED_WORKTREE_ERROR }
