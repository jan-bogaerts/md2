import RobotOutline from 'mdi-material-ui/RobotOutline'
import { useEffect } from 'react'
import { projectContext } from '../../data/action_context'
import { cardPopupService } from '../../services/card_popup_service'
import { dataService } from '../../services/data/data_service'
import { dialogService } from '../../services/dialog_service'
import { useProjectAgentState } from '../hooks/use_agent_acknowledgements'
import { useActiveActionRunsForContext } from '../hooks/use_action_runs'
import { AgentFabPresentation } from './agent_fab_presentation'
import { resolveAgentFabState } from './agent_fab_state'

const PROJECT_CONTEXT = projectContext()

/** Project-wide free-form agent launcher, movable anywhere in application viewport. */
export function AgentChatFab() {
    const agentState = useProjectAgentState()
    const activeRuns = useActiveActionRunsForContext(PROJECT_CONTEXT)
    const state = resolveAgentFabState(activeRuns, agentState)
    const handleActivate = (nextAnchorElement: HTMLElement) => cardPopupService.toggleAction(PROJECT_CONTEXT, nextAnchorElement)
    const handleDragStart = () => cardPopupService.closeAction(PROJECT_CONTEXT)

    useEffect(() => {
        void dataService.listAgentConversations(PROJECT_CONTEXT).catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: 'Could not load project agent conversations' })
        })
    }, [])

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
