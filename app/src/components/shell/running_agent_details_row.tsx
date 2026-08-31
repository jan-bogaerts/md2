import { ListItem, ListItemButton, ListItemText } from '@mui/material'
import type { MouseEvent } from 'react'
import type { RunningAgentDetailsItem } from './running_agents_details'

interface RunningAgentDetailsRowProps {
    agent: RunningAgentDetailsItem
    onSelect: (agent: RunningAgentDetailsItem, anchorElement: HTMLElement) => void
}

/** Renders interactive card-action runs and plain rows for every other running agent. */
export function RunningAgentDetailsRow({ agent, onSelect }: RunningAgentDetailsRowProps) {
    const handleClick = (event: MouseEvent<HTMLElement>) => {
        onSelect(agent, event.currentTarget)
    }
    const text = <ListItemText primary={agent.label} secondary={agent.secondaryLabel} />

    if (agent.kind !== 'card-action') return <ListItem>{text}</ListItem>

    return (
        <ListItem disablePadding>
            <ListItemButton component="button" onClick={handleClick}>
                {text}
            </ListItemButton>
        </ListItem>
    )
}
