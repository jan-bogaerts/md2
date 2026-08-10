import { Typography } from '@mui/material'
import type { ActionDefinition } from '../../../../data/action_types'
import type { ActionRunSettingsStore } from '../../../../services/actions/action_run_settings_service'
import { useActionRunSettings } from '../../shared/use_action_run_settings'

interface ActionRunDisabledMessageProps {
    action: ActionDefinition
    settingsStore: ActionRunSettingsStore
}

/** Renders backend/agent availability only at its message boundary. */
export function ActionRunDisabledMessage({ action, settingsStore }: ActionRunDisabledMessageProps) {
    const { runDisabledMessage } = useActionRunSettings(action, settingsStore)
    if (!runDisabledMessage) return null

    return <Typography color="text.secondary" role="note" variant="caption">{runDisabledMessage}</Typography>
}
