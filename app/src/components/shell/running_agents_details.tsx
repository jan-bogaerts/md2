import { Box, List, Typography } from '@mui/material'
import type { ActionContext } from '../../data/action_context'
import { RunningAgentDetailsRow } from './running_agent_details_row'

interface RunningAgentDetailsItemBase {
    id: string
    label: string
    secondaryLabel?: string
}

export type RunningAgentDetailsItem = RunningAgentDetailsItemBase & ({
    context: ActionContext
    kind: 'card-action'
    rootActionId: string
    runId: string
} | {
    kind: 'plain'
})

interface RunningAgentsDetailsProps {
    agents: RunningAgentDetailsItem[]
    onSelect: (agent: RunningAgentDetailsItem, anchorElement: HTMLElement) => void
}

/** Shared running-agent detail content for desktop and mobile surfaces. */
export function RunningAgentsDetails({ agents, onSelect }: RunningAgentsDetailsProps) {
    return (
        <Box>
            <Typography id="running-agents-details-title" component="h2" sx={{ color: 'text.primary', fontWeight: 700, px: 2, pt: 2 }} variant="subtitle2">
                Running agents
            </Typography>
            {agents.length > 0 ? (
                <List dense>
                    {agents.map((agent) => (
                        <RunningAgentDetailsRow agent={agent} key={agent.id} onSelect={onSelect} />
                    ))}
                </List>
            ) : <Typography sx={{ p: 2 }} variant="body2">No agents running</Typography>}
        </Box>
    )
}
