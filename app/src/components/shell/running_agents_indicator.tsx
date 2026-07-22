import { Button, List, ListItem, ListItemText, Popover, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import Robot from 'mdi-material-ui/Robot'
import { useState, useSyncExternalStore } from 'react'
import { agentConversationService } from '../../services/agents/agent_conversation_service'
import { useRunningActionExecutions } from '../hooks/use_action_executions'

function subscribeToRunningAgents(onStoreChange: () => void) {
    return agentConversationService.subscribe(onStoreChange)
}

function getRunningAgentsSnapshot() {
    return agentConversationService.getRunningAgents()
}

/** Shows the number of running agents and lists them in a popover when opened. */
export function RunningAgentsIndicator() {
    const directRunningAgents = useSyncExternalStore(subscribeToRunningAgents, getRunningAgentsSnapshot, getRunningAgentsSnapshot)
    const runningActionExecutions = useRunningActionExecutions()
    const agents = [
        ...directRunningAgents,
        ...runningActionExecutions.map(({ executionId, rootActionId }) => ({ id: executionId, label: `Action ${rootActionId}` })),
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
            <Popover
                anchorEl={anchorElement}
                anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
                onClose={handleClose}
                open={!!anchorElement}
                transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
            >
                {agents.length > 0 ? (
                    <List dense>
                        {agents.map((agent) => (
                            <ListItem key={agent.id}>
                                <ListItemText primary={agent.label} />
                            </ListItem>
                        ))}
                    </List>
                ) : (
                    <Typography sx={{ p: 2 }} variant="body2">
                        No agents running
                    </Typography>
                )}
            </Popover>
        </>
    )
}
