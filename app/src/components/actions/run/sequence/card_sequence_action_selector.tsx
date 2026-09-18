import { ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import type { MouseEvent } from 'react'
import type { ActionDefinition } from '../../../../data/action_types'
import { ACTION_SELECTOR_GROUP_SX } from '../popup/action_selector_styles'

interface CardSequenceActionSelectorProps {
    actions: ActionDefinition[]
    onSelect(actionId: string): void
    selectedActionId: string
}

/** Common-action selector using card Run button presentation. */
export function CardSequenceActionSelector(props: CardSequenceActionSelectorProps) {
    const { actions, onSelect, selectedActionId } = props
    const handleChange = (_event: MouseEvent<HTMLElement>, actionId: string | null) => {
        if (actionId) onSelect(actionId)
    }

    if (actions.length === 0) {
        return <Typography color="custom.text4" variant="caption">Add cards with a common action</Typography>
    }

    return (
        <ToggleButtonGroup
            aria-label="Sequence actions"
            exclusive
            onChange={handleChange}
            size="small"
            sx={ACTION_SELECTOR_GROUP_SX}
            value={selectedActionId}
        >
            {actions.map((action) => (
                <Tooltip describeChild key={action.id} title={action.description}>
                    <ToggleButton value={action.id}>{action.label}</ToggleButton>
                </Tooltip>
            ))}
        </ToggleButtonGroup>
    )
}
