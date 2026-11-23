import type { WorktreeAssignment } from '../data/data_types'
import { worktreeService } from '../services/project/worktree_service'

export function getWorktreeAssignmentDisplayState(assignment: WorktreeAssignment) {
    if (assignment.worktreeError) {
        return { error: assignment.worktreeError, folder: 'invalid assignment', value: assignment.worktreeValue ?? '?' }
    }
    const worktree = assignment.worktree ?? null
    if (worktree === null) return { error: null, folder: null, value: 'P' }

    const resolution = worktreeService.getAssignmentState(assignment)
    if (resolution.error) return { error: resolution.error, folder: 'unavailable assignment', value: String(worktree) }

    return { error: null, folder: resolution.record?.path ?? null, value: String(resolution.index) }
}
