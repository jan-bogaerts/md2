import { Button, List, ListItem, ListItemText, Popover, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import Robot from 'mdi-material-ui/Robot'
import { useState } from 'react'
import type { RunningAgent } from '../../data/data_types'

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
