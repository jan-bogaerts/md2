import { Badge, Button, List, ListItem, ListItemText, Popover, Typography } from '@mui/material'
import Robot from 'mdi-material-ui/Robot'
import { useState } from 'react'
import type { RunningAgent } from './running_agent_types'

interface RunningAgentsIndicatorProps {
    agents: RunningAgent[]
}

/** Shows the number of running agents and lists them in a popover when opened. */
export function RunningAgentsIndicator(props: RunningAgentsIndicatorProps) {
    const { agents } = props
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
                color="inherit"
                onClick={handleOpen}
                size="small"
                startIcon={(
                    <Badge badgeContent={agents.length} color="primary" showZero>
                        <Robot fontSize="small" />
                    </Badge>
                )}
            >
                Agents
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
