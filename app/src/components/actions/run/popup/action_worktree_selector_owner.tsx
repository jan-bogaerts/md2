import type { WorktreeAssignment, WorktreeAssignmentTarget } from '../../../worktree_selector'
import { WorktreeSelector } from '../../../worktree_selector'
import { useBoundRunId, useRunSelector } from '../../../hooks/use_action_runs'
import type { ActionRunBindingStore } from '../state/action_run_binding_store'

interface ActionWorktreeSelectorOwnerProps {
    assignment: WorktreeAssignment
    assignmentTarget: WorktreeAssignmentTarget
    bindingStore: ActionRunBindingStore
    primaryPath: string | null
}

/** Subscribes worktree control only to active-state disabling. */
export function ActionWorktreeSelectorOwner(props: ActionWorktreeSelectorOwnerProps) {
    const { assignment, assignmentTarget, bindingStore, primaryPath } = props
    const boundRunId = useBoundRunId(bindingStore)
    const disabled = useRunSelector(boundRunId, (run) => (
        run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'
    ))

    return (
        <WorktreeSelector
            assignment={assignment}
            assignmentTarget={assignmentTarget}
            disabled={disabled}
            primaryPath={primaryPath}
        />
    )
}
