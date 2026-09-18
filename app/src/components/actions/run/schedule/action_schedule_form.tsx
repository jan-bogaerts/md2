import { Button, Stack, Typography } from '@mui/material'
import type { ActionScheduleAccountTracker, ActionScheduleCardOption } from './action_schedule_options'
import type { ActionScheduleSnapshot, ActionScheduleTriggerType } from './action_schedule_store'
import { ScheduleTriggerFields, type ScheduleTriggerFieldsChange } from './schedule_trigger_fields'

export type ActionScheduleFormChange =
    | { agent: string; type: 'agent' }
    | { cardInternalId: string; type: 'card' }
    | { limitId: string; type: 'tracker'; windowId: string }
    | { targetState: string; type: 'target-state' }
    | { timestamp: string; type: 'timestamp' }
    | { triggerType: ActionScheduleTriggerType; type: 'trigger-type' }

interface ActionScheduleFormProps {
    accountTrackers: ActionScheduleAccountTracker[]
    canRegister: boolean
    cards: ActionScheduleCardOption[]
    message: string | null
    onChange(change: ActionScheduleFormChange): void
    onRegister(): void
    snapshot: ActionScheduleSnapshot
    targetStates: string[]
}

/** Trigger selection and trigger-specific schedule fields. */
export function ActionScheduleForm(props: ActionScheduleFormProps) {
    const { accountTrackers, canRegister, cards, message, onChange, onRegister, snapshot, targetStates } = props
    const handleChange = (change: ScheduleTriggerFieldsChange) => {
        if (change.type === 'trigger-type' && change.triggerType === 'now') return
        onChange(change as ActionScheduleFormChange)
    }

    return (
        <Stack spacing={1.5}>
            <ScheduleTriggerFields
                accountTrackers={accountTrackers}
                cards={cards}
                onChange={handleChange}
                snapshot={snapshot}
                targetStates={targetStates}
            />
            <Button disabled={!canRegister} onClick={onRegister} size="small" variant="contained">Schedule action</Button>
            {message ? <Typography color="text.secondary" role="status" variant="caption">{message}</Typography> : null}
        </Stack>
    )
}
