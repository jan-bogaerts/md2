import { Button } from '@mui/material'
import { alpha } from '@mui/material/styles'
import Robot from 'mdi-material-ui/Robot'
import { useState, useSyncExternalStore } from 'react'
import { agentConversationService } from '../../services/agents/agent_conversation_service'
import { useActiveActionRuns } from '../hooks/use_action_runs'
import { MobileStatusRow } from './mobile_status_row'
import { RunningAgentsDetails } from './running_agents_details'
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
    const agents = [
        ...directRunningAgents,
        ...activeActionRuns.map(({ runId, rootActionId }) => ({ id: runId, label: `Action ${rootActionId}` })),
    ]
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)

    const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorElement(event.currentTarget)
    }

    const handleClose = () => {
        setAnchorElement(null)
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
                <RunningAgentsDetails agents={agents} />
            </StatusDetailsSurface>
        </>
    )
}
