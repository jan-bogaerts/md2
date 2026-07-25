import { useRef, useSyncExternalStore } from 'react'
import type { WorktreeRecord } from '../../data/data_types'
import { projectPersistenceService } from '../../services/project/project_persistence_service'
import { worktreeService } from '../../services/project/worktree_service'

export interface WorktreeSelectorTarget {
    /** The assigned linked worktree, or null when the target sits on the primary worktree. */
    assignedWorktree: number | null
    /** The card being assigned, or null for the project-level target. */
    cardPath: string | null
}

export interface WorktreeSelectorState {
    preparing: boolean
    /** Whether the project holds changes the assigned worktree has not taken in yet. */
    projectDirty: boolean
    record: WorktreeRecord | null
    records: WorktreeRecord[]
}

function subscribe(onStoreChange: () => void) {
    worktreeService.addEventListener('changed', onStoreChange)
    projectPersistenceService.addEventListener('changed', onStoreChange)

    return () => {
        worktreeService.removeEventListener('changed', onStoreChange)
        projectPersistenceService.removeEventListener('changed', onStoreChange)
    }
}

/**
 * The single worktree subscription behind a worktree selector. Returns the previous state
 * object whenever nothing this target displays has changed, so unrelated worktree and
 * persistence events cost a listener call instead of a render. Only an assigned worktree can
 * show project changes, so targets on the primary worktree never observe the repo-wide flags.
 */
export function useWorktreeSelectorState(target: WorktreeSelectorTarget): WorktreeSelectorState {
    const { assignedWorktree, cardPath } = target
    const cache = useRef<WorktreeSelectorState | null>(null)
    const getSnapshot = () => {
        const records = worktreeService.getRecords()
        const record = assignedWorktree === null ? null : records[assignedWorktree - 1] ?? null
        const preparing = cardPath === null
            ? worktreeService.isPreparingProjectWorktree()
            : worktreeService.isPreparingCard(cardPath)
        const projectDirty = record
            ? projectPersistenceService.getSnapshot().hasPendingSave || !!worktreeService.getPrimaryStatus()?.dirty
            : false
        const current = cache.current
        if (current
            && current.preparing === preparing
            && current.projectDirty === projectDirty
            && current.record === record
            && current.records === records) return current

        const next = { preparing, projectDirty, record, records }
        cache.current = next

        return next
    }

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
