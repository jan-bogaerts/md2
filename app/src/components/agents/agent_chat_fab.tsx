import RobotOutline from 'mdi-material-ui/RobotOutline'
import { useMemo } from 'react'
import { displayActionsForContext, projectContext } from '../../data/action_context'
import { cardPopupService } from '../../services/card_popup_service'
import { useActionAssignmentContext } from '../hooks/use_action_assignment_context'
import { useActions } from '../hooks/use_actions'
import { useProjectActionsAgentState } from '../hooks/use_agent_acknowledgements'
import { useActiveActionRunsForContext } from '../hooks/use_action_runs'
import { AgentFabPresentation } from './agent_fab_presentation'
import { resolveAgentFabState } from './agent_fab_state'

const PROJECT_CONTEXT = projectContext()

/** Project-wide free-form agent launcher, movable anywhere in application viewport. */
export function AgentChatFab() {
    const { actions } = useActions()
    const assignmentContext = useActionAssignmentContext(PROJECT_CONTEXT)
    const projectActionIds = useMemo(
        () => displayActionsForContext(actions, assignmentContext).map(({ id }) => id),
        [actions, assignmentContext],
    )
    const agentState = useProjectActionsAgentState(projectActionIds)
    const activeRuns = useActiveActionRunsForContext(PROJECT_CONTEXT)
    const state = resolveAgentFabState(activeRuns, agentState)
    const handleActivate = (nextAnchorElement: HTMLElement) => cardPopupService.toggleAction(PROJECT_CONTEXT, nextAnchorElement)
    const handleDragStart = () => cardPopupService.closeAction(PROJECT_CONTEXT)

    return (
        <AgentFabPresentation
            icon={<RobotOutline />}
            labelPrefix="Project agent"
            onActivate={handleActivate}
            onDragStart={handleDragStart}
            runningDescription={agentState === 'running' ? 'Agent is running' : 'Action is running'}
            state={state}
        />
    )
}
