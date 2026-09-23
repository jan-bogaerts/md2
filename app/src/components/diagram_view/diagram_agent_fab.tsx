import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined'
import { diagramContext } from '../../data/action_context'
import type { DiagramViewService } from '../../services/diagrams/diagram_view_service'
import { AgentFabPresentation } from '../agents/agent_fab_presentation'
import { resolveAgentFabState } from '../agents/agent_fab_state'
import { useProjectActionsAgentState } from '../hooks/use_agent_acknowledgements'
import { useActiveActionRunsForContext } from '../hooks/use_action_runs'

const ROOT_DIAGRAM_CONTEXT = diagramContext('root')
const NO_ROOT_ACTIONS_LABEL = 'No root diagram actions configured'

interface DiagramAgentFabProps {
    rootActionIds: string[]
    service: Pick<DiagramViewService, 'closePopup' | 'openRootPopup'>
}

/** Diagram-root agent launcher with scoped live and persisted state. */
export function DiagramAgentFab({ rootActionIds, service }: DiagramAgentFabProps) {
    const activeRuns = useActiveActionRunsForContext(ROOT_DIAGRAM_CONTEXT)
        .filter(({ rootActionId }) => rootActionIds.includes(rootActionId))
    const persistedState = useProjectActionsAgentState(rootActionIds)
    const state = resolveAgentFabState(activeRuns, persistedState)
    const handleActivate = (anchorElement: HTMLElement) => service.openRootPopup(anchorElement)
    const handleDragStart = () => service.closePopup()
    const disabled = rootActionIds.length === 0

    return (
        <AgentFabPresentation
            disabled={disabled}
            disabledLabel={NO_ROOT_ACTIONS_LABEL}
            icon={<AccountTreeOutlined />}
            labelPrefix="Diagram action"
            onActivate={handleActivate}
            onDragStart={handleDragStart}
            state={state}
        />
    )
}
