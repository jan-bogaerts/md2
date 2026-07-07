import { Box, Button, Stack, Typography } from '@mui/material'
import type { ActionDefinition } from '../../data/action_types'

interface RelatedActionButtonProps {
    action: ActionDefinition
    onNavigate: (action: ActionDefinition) => void
}

interface RelatedActionsProps {
    actions: ActionDefinition[]
    label: string
    onNavigate: (action: ActionDefinition) => void
}

function RelatedActionButton(props: RelatedActionButtonProps) {
    const { action, onNavigate } = props
    const handleClick = () => onNavigate(action)

    return (
        <Button onClick={handleClick} size="small" variant="outlined">
            {action.label}
        </Button>
    )
}

/** Presentation-only before/after action shortcut list. */
export function RelatedActions(props: RelatedActionsProps) {
    const { actions, label, onNavigate } = props
    if (actions.length === 0) return null

    return (
        <Box>
            <Typography color="text.secondary" variant="caption">
                {label}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mt: 0.5 }}>
                {actions.map((action) => (
                    <RelatedActionButton action={action} key={action.name} onNavigate={onNavigate} />
                ))}
            </Stack>
        </Box>
    )
}
