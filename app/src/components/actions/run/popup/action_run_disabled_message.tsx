import { Typography } from '@mui/material'
import type { ActionDefinition } from '../../../../data/action_types'
import type { ActionRunInputStore } from '../state/action_run_input_store'
import { useActionRunSettings } from '../../shared/use_action_run_settings'

interface ActionRunDisabledMessageProps {
    action: ActionDefinition
    store: ActionRunInputStore
}

/** Renders backend/agent availability only at its message boundary. */
export function ActionRunDisabledMessage({ action, store }: ActionRunDisabledMessageProps) {
    const { runDisabledMessage } = useActionRunSettings(action, store)
    if (!runDisabledMessage) return null

    return <Typography color="text.secondary" role="note" variant="caption">{runDisabledMessage}</Typography>
}
