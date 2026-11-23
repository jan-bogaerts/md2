import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { WorktreeAssignment, WorktreeRecord } from '../../data/data_types';
import { projectPersistenceService } from '../../services/project/project_persistence_service'
import {
    cardWorktreeOperationEventType,
    type CardWorktreeOperationPhase,
    worktreeService,
} from '../../services/project/worktree_service'

export interface WorktreeSelectorTarget {
    /** The assigned linked worktree, or null when the target sits on the primary worktree. */
    assignment: WorktreeAssignment;
    /** Canonical identity of card being assigned, or null for project-level target. */
    cardInternalId: string | null
}

export interface WorktreeSelectorState {
    index: number | null
    operationPhase: CardWorktreeOperationPhase | null
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
    const { assignment, cardInternalId } = target;
    const cache = useRef<WorktreeSelectorState | null>(null)
    const subscribe = useCallback((onStoreChange: () => void) => {
        const handleRecordChanged = (event: Event) => {
            const { branch } = (event as CustomEvent<{ branch: string }>).detail
            if (branch === assignment.branch) onStoreChange()
        }
        const operationEventType = cardInternalId === null ? 'changed' : cardWorktreeOperationEventType(cardInternalId)
        worktreeService.addEventListener(operationEventType, onStoreChange)
        if (assignment.worktree !== null && assignment.worktree !== undefined) {
            worktreeService.addEventListener('recordChanged', handleRecordChanged)
            worktreeService.addEventListener('recordsChanged', onStoreChange)
            worktreeService.addEventListener('primaryStatusChanged', onStoreChange)
            projectPersistenceService.addEventListener('changed', onStoreChange)
        }

        return () => {
            worktreeService.removeEventListener(operationEventType, onStoreChange)
            worktreeService.removeEventListener('recordChanged', handleRecordChanged)
            worktreeService.removeEventListener('recordsChanged', onStoreChange)
            worktreeService.removeEventListener('primaryStatusChanged', onStoreChange)
            projectPersistenceService.removeEventListener('changed', onStoreChange)
        }
    }, [assignment.branch, assignment.worktree, cardInternalId])
    const getSnapshot = () => {
        const { index, record } = worktreeService.getAssignmentState(assignment);
        const preparing = cardInternalId === null
            ? worktreeService.isPreparingProjectWorktree()
            : worktreeService.isPreparingCard(cardInternalId)
        const operationPhase = cardInternalId === null ? null : worktreeService.getCardOperationPhase(cardInternalId)
        const projectDirty = record
            ? projectPersistenceService.getSnapshot().hasPendingSave || !!worktreeService.getPrimaryStatus()?.dirty
            : false
        const current = cache.current
        if (current
            && current.index === index
            && current.operationPhase === operationPhase
            && current.preparing === preparing
            && current.projectDirty === projectDirty
            && current.record === record) return current

        const next = { index, operationPhase, preparing, projectDirty, record }
        cache.current = next

        return next
    }

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
