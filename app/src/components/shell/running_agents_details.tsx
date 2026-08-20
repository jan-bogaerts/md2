import { Box, List, ListItem, ListItemText, Typography } from '@mui/material'

interface RunningAgentDetailsItem {
    id: string
    label: string
}

interface RunningAgentsDetailsProps {
    agents: RunningAgentDetailsItem[]
}

/** Shared running-agent detail content for desktop and mobile surfaces. */
export function RunningAgentsDetails({ agents }: RunningAgentsDetailsProps) {
    return (
        <Box>
            <Typography id="running-agents-details-title" component="h2" sx={{ color: 'text.primary', fontWeight: 700, px: 2, pt: 2 }} variant="subtitle2">
                Running agents
            </Typography>
            {agents.length > 0 ? (
                <List dense>
                    {agents.map((agent) => (
                        <ListItem key={agent.id}>
                            <ListItemText primary={agent.label} />
                        </ListItem>
                    ))}
                </List>
            ) : <Typography sx={{ p: 2 }} variant="body2">No agents running</Typography>}
        </Box>
    )
}
