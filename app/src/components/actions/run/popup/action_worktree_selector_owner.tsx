import { useCallback, useSyncExternalStore } from 'react'
import type { WorktreeAssignment, WorktreeAssignmentTarget } from '../../../worktree_selector'
import { WorktreeSelector } from '../../../worktree_selector'
import { useBoundRunId, useRunSelector } from '../../../hooks/use_action_runs'
import { useOpenWorktrees } from '../../../hooks/use_worktrees'
import { SEQUENCE_WORKTREE_DISABLED_REASON, sequenceWorktreeAssignment } from '../../../sequence_worktree_assignment'
import { activeScheduleService } from '../../../../services/actions/active_schedule_service'
import type { ActionRunBindingStore } from '../state/action_run_binding_store'

interface ActionWorktreeSelectorOwnerProps {
    assignment: WorktreeAssignment
    assignmentTarget: WorktreeAssignmentTarget
    bindingStore: ActionRunBindingStore
    primaryPath: string | null
    sequenceCardInternalId: string | null
}

/** Subscribes only the selector to bound runs and sequence checkout changes. */
export function ActionWorktreeSelectorOwner(props: ActionWorktreeSelectorOwnerProps) {
    const { assignment, assignmentTarget, bindingStore, primaryPath, sequenceCardInternalId } = props
    const boundRunId = useBoundRunId(bindingStore)
    const boundRunDisabled = useRunSelector(boundRunId, (run) => (
        run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
    ))
    const subscribe = useCallback((onStoreChange: () => void) => sequenceCardInternalId
        ? activeScheduleService.subscribeSequenceCard(sequenceCardInternalId, onStoreChange)
        : () => undefined, [sequenceCardInternalId])
    const getSequenceWorktree = useCallback(() => sequenceCardInternalId
        ? activeScheduleService.getSequenceWorktreeForCard(sequenceCardInternalId)
        : null, [sequenceCardInternalId])
    const sequenceWorktree = useSyncExternalStore(subscribe, getSequenceWorktree, getSequenceWorktree)
    const worktrees = useOpenWorktrees(!!sequenceWorktree)
    const displayedAssignment = sequenceWorktree ? sequenceWorktreeAssignment(sequenceWorktree, worktrees) : assignment

    return (
        <WorktreeSelector
            assignment={displayedAssignment}
            assignmentTarget={assignmentTarget}
            disabled={!!sequenceWorktree || boundRunDisabled}
            disabledReason={sequenceWorktree ? SEQUENCE_WORKTREE_DISABLED_REASON : undefined}
            key={sequenceWorktree ? 'sequence' : 'assignment'}
            primaryPath={primaryPath}
        />
    )
}
