import type { PropsWithChildren } from 'react'
import { Box } from '@mui/material'
import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import { useActionRunSelector } from '../hooks/use_action_runs'

interface ActionAgentInteractionVisibilityProps extends PropsWithChildren {
    action: ActionDefinition
    context: ActionContext
}

/** Shows agent interaction layout when root or active chained action is an agent. */
export function ActionAgentInteractionVisibility(props: ActionAgentInteractionVisibilityProps) {
    const { action, children, context } = props
    const activeActionType = useActionRunSelector(action.id, context, (run) => run?.activeActionType ?? null)
    const visible = action.type === 'agent' || activeActionType === 'agent'

    return <Box sx={{ display: visible ? 'contents' : 'none' }}>{children}</Box>
}
