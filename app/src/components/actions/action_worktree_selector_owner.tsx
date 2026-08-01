import type { ActionContext } from '../../data/action_context'
import type { WorktreeAssignment, WorktreeAssignmentTarget } from '../worktree_selector'
import { WorktreeSelector } from '../worktree_selector'
import { useActionRunSelector } from '../hooks/use_action_runs'

interface ActionWorktreeSelectorOwnerProps {
    actionId: string
    assignment: WorktreeAssignment
    assignmentTarget: WorktreeAssignmentTarget
    context: ActionContext
    primaryPath: string | null
}

/** Subscribes worktree control only to active-state disabling. */
export function ActionWorktreeSelectorOwner(props: ActionWorktreeSelectorOwnerProps) {
    const { actionId, assignment, assignmentTarget, context, primaryPath } = props
    const disabled = useActionRunSelector(actionId, context, (run) => (
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
