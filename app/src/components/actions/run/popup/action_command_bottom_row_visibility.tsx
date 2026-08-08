import type { PropsWithChildren } from 'react'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionDefinition } from '../../../../data/action_types'
import { useActionRunSelector } from '../../../hooks/use_action_runs'

interface ActionCommandBottomRowVisibilityProps extends PropsWithChildren {
    action: ActionDefinition
    context: ActionContext
}

/** Keeps the standalone command row mounted only while no agent interaction is visible. */
export function ActionCommandBottomRowVisibility(props: ActionCommandBottomRowVisibilityProps) {
    const { action, children, context } = props
    const activeActionType = useActionRunSelector(action.id, context, (run) => run?.activeActionType ?? null)
    if (action.type !== 'command' || activeActionType === 'agent') return null

    return children
}
