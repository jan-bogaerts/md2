import { normalizePath } from '../../../shared/path_utils.mjs'
import type { WorktreeAssignment, WorktreeRecord } from '../data/data_types'
import type { SequenceCardWorktree } from '../services/actions/active_schedule_service'

export const SEQUENCE_WORKTREE_DISABLED_REASON = 'This card is running within a sequence, so its worktree controls are disabled.'

/** Project sequence checkout onto the selector without changing the card assignment. */
export function sequenceWorktreeAssignment(sequenceWorktree: SequenceCardWorktree, worktrees: WorktreeRecord[]): WorktreeAssignment {
    const { checkoutPath, expectedBranch } = sequenceWorktree
    const checkoutKey = normalizePath(checkoutPath).toLowerCase()
    const index = worktrees.findIndex(({ path }) => normalizePath(path).toLowerCase() === checkoutKey)
    const record = worktrees[index]
    const worktreeError = !record ? `Sequence worktree is unavailable: ${checkoutPath}`
        : record.branch !== expectedBranch ? `Sequence worktree changed branch: ${checkoutPath}` : null
    const worktree = index < 0 ? 1 : index + 1

    return { branch: expectedBranch, worktree, worktreeError, worktreeValue: index < 0 ? '?' : String(worktree) }
}
