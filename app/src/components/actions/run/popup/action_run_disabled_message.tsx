import { Typography } from '@mui/material'
import type { ActionDefinition } from '../../../../data/action_types'
import type { ActionRunSettingsStore } from '../../../../services/actions/action_run_settings_service'
import { useActionRunSettings } from '../../shared/use_action_run_settings'
import { actionRunDefinitionDisabledMessage } from './action_popup_run_disabled'

interface ActionRunDisabledMessageProps {
    action: ActionDefinition
    settingsStore: ActionRunSettingsStore
}

/** Renders current action-run blocker at its message boundary. */
export function ActionRunDisabledMessage({ action, settingsStore }: ActionRunDisabledMessageProps) {
    const { runDisabledMessage } = useActionRunSettings(action, settingsStore)
    const message = actionRunDefinitionDisabledMessage(action) ?? runDisabledMessage
    if (!message) return null

    return <Typography color="text.secondary" role="note" variant="caption">{message}</Typography>
}
