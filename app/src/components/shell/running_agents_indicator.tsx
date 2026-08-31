import { Button } from '@mui/material'
import { alpha } from '@mui/material/styles'
import Robot from 'mdi-material-ui/Robot'
import { useState, useSyncExternalStore } from 'react'
import { agentConversationService } from '../../services/agents/agent_conversation_service'
import { cardPopupService } from '../../services/card_popup_service'
import { useActiveActionRuns } from '../hooks/use_action_runs'
import { useActions } from '../hooks/use_actions'
import { MobileStatusRow } from './mobile_status_row'
import { RunningAgentsDetails } from './running_agents_details'
import type { RunningAgentDetailsItem } from './running_agents_details'
import { StatusDetailsSurface } from './status_details_surface'

function subscribeToRunningAgents(onStoreChange: () => void) {
    return agentConversationService.subscribe(onStoreChange)
}

function getRunningAgentsSnapshot() {
    return agentConversationService.getRunningAgents()
}

/** Shows the number of running agents and lists them in a popover when opened. */
interface RunningAgentsIndicatorProps {
    mobile?: boolean
}

export function RunningAgentsIndicator({ mobile = false }: RunningAgentsIndicatorProps) {
    const directRunningAgents = useSyncExternalStore(subscribeToRunningAgents, getRunningAgentsSnapshot, getRunningAgentsSnapshot)
    const activeActionRuns = useActiveActionRuns()
    const { actions } = useActions()
    const actionLabels = new Map(actions.map(({ id, label }) => [id, label]))
    const agents: RunningAgentDetailsItem[] = [
        ...directRunningAgents.map(({ id, label }) => ({ id, kind: 'plain' as const, label })),
        ...activeActionRuns.map(({ context, runId, rootActionId }): RunningAgentDetailsItem => (
            context.kind === 'card' && !!context.cardInternalId
                ? {
                    context,
                    id: runId,
                    kind: 'card-action',
                    label: actionLabels.get(rootActionId) ?? rootActionId,
                    rootActionId,
                    runId,
                    secondaryLabel: context.title,
                }
                : { id: runId, kind: 'plain', label: `Action ${rootActionId}` }
        )),
    ]
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)

    const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorElement(event.currentTarget)
    }

    const handleClose = () => {
        setAnchorElement(null)
    }

    const handleSelect = (agent: RunningAgentDetailsItem, rowAnchorElement: HTMLElement) => {
        if (agent.kind !== 'card-action') return

        handleClose()
        cardPopupService.openActionRun(agent.context, agent.rootActionId, agent.runId, rowAnchorElement)
    }

    return (
        <>
            {mobile ? (
                <MobileStatusRow
                    accessibleName={`Running agents: ${agents.length}`}
                    icon={<Robot sx={{ fontSize: 18 }} />}
                    label="Running agents"
                    onClick={handleOpen}
                    tone="text.secondary"
                    value={agents.length.toLocaleString('en-US')}
                />
            ) : (
                <Button
                    aria-label={`Running agents: ${agents.length}`}
                    onClick={handleOpen}
                    size="small"
                    startIcon={<Robot sx={{ fontSize: '14px !important' }} />}
                    sx={{
                        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.14),
                        borderRadius: 99,
                        color: 'primary.main',
                        fontSize: 11.5,
                        height: 22,
                        minWidth: 0,
                        px: 1.25,
                        '&:hover': { bgcolor: (theme) => alpha(theme.palette.primary.main, 0.22) },
                    }}
                >
                    {agents.length} {agents.length === 1 ? 'agent' : 'agents'}
                </Button>
            )}
            <StatusDetailsSurface anchorElement={anchorElement} labelId="running-agents-details-title" mobile={mobile} onClose={handleClose}>
                <RunningAgentsDetails agents={agents} onSelect={handleSelect} />
            </StatusDetailsSurface>
        </>
    )
}
