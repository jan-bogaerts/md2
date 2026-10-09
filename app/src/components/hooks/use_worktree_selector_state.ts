import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { WorktreeAssignment, WorktreeRecord } from '../../data/data_types';
import { projectPersistenceService } from '../../services/project/project_persistence_service'
import { worktreeService } from '../../services/project/worktree_service'

export interface WorktreeSelectorTarget {
    /** The assigned linked worktree, or null when the target sits on the primary worktree. */
    assignment: WorktreeAssignment;
    /** The card being assigned, or null for the project-level target. */
    cardPath: string | null
}

export interface WorktreeSelectorState {
    index: number | null
    preparing: boolean
    /** Whether the project holds changes the assigned worktree has not taken in yet. */
    projectDirty: boolean
    record: WorktreeRecord | null
}

/**
 * The single worktree subscription behind a worktree selector. Returns the previous state
 * object whenever nothing this target displays has changed, so unrelated worktree and
 * persistence events cost a listener call instead of a render. Only an assigned worktree can
 * show project changes, so targets on the primary worktree never observe the repo-wide flags.
 */
export function useWorktreeSelectorState(target: WorktreeSelectorTarget): WorktreeSelectorState {
    const { assignment, cardPath } = target;
    const cache = useRef<WorktreeSelectorState | null>(null)
    const subscribe = useCallback((onStoreChange: () => void) => {
        const handleRecordChanged = (event: Event) => {
            const { branch } = (event as CustomEvent<{ branch: string }>).detail
            if (branch === assignment.branch) onStoreChange()
        }
        worktreeService.addEventListener('changed', onStoreChange)
        if (assignment.worktree !== null && assignment.worktree !== undefined) {
            worktreeService.addEventListener('recordChanged', handleRecordChanged)
            worktreeService.addEventListener('recordsChanged', onStoreChange)
            worktreeService.addEventListener('primaryStatusChanged', onStoreChange)
            projectPersistenceService.addEventListener('changed', onStoreChange)
        }

        return () => {
            worktreeService.removeEventListener('changed', onStoreChange)
            worktreeService.removeEventListener('recordChanged', handleRecordChanged)
            worktreeService.removeEventListener('recordsChanged', onStoreChange)
            worktreeService.removeEventListener('primaryStatusChanged', onStoreChange)
            projectPersistenceService.removeEventListener('changed', onStoreChange)
        }
    }, [assignment.branch, assignment.worktree])
    const getSnapshot = () => {
        const { index, record } = worktreeService.getAssignmentState(assignment);
        const preparing = cardPath === null
            ? worktreeService.isPreparingProjectWorktree()
            : worktreeService.isPreparingCard(cardPath)
        const projectDirty = record
            ? projectPersistenceService.getSnapshot().hasPendingSave || !!worktreeService.getPrimaryStatus()?.dirty
            : false
        const current = cache.current
        if (current
            && current.index === index
            && current.preparing === preparing
            && current.projectDirty === projectDirty
            && current.record === record) return current

        const next = { index, preparing, projectDirty, record }
        cache.current = next

        return next
    }

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
