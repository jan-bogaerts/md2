import { Button, MenuItem, Stack, TextField, Typography } from '@mui/material'
import type { ChangeEvent } from 'react'
import type { ScheduleTriggerType } from './action_schedule_trigger'

interface ActionScheduleFormProps {
    afterActionName: string
    message: string | null
    onAfterActionNameChange: (event: ChangeEvent<HTMLInputElement>) => void
    onRegister: () => void
    onTimestampChange: (event: ChangeEvent<HTMLInputElement>) => void
    onTriggerTypeChange: (event: ChangeEvent<HTMLInputElement>) => void
    timestamp: string
    triggerType: ScheduleTriggerType
}

/** Presentation-only scheduled action registration form. */
export function ActionScheduleForm(props: ActionScheduleFormProps) {
    const {
        afterActionName,
        message,
        onAfterActionNameChange,
        onRegister,
        onTimestampChange,
        onTriggerTypeChange,
        timestamp,
        triggerType,
    } = props

    return (
        <Stack spacing={1}>
            <TextField label="Schedule trigger" onChange={onTriggerTypeChange} select size="small" value={triggerType}>
                <MenuItem value="at">At</MenuItem>
                <MenuItem value="agentSlot">Agent slot</MenuItem>
                <MenuItem value="afterAction">After action</MenuItem>
            </TextField>
            {triggerType === 'at' ? (
                <TextField label="Schedule timestamp" onChange={onTimestampChange} size="small" type="datetime-local" value={timestamp} />
            ) : null}
            {triggerType === 'afterAction' ? (
                <TextField label="After action name" onChange={onAfterActionNameChange} size="small" value={afterActionName} />
            ) : null}
            <Button onClick={onRegister} size="small" variant="contained">
                Register schedule
            </Button>
            {message ? (
                <Typography color="text.secondary" role="status" variant="caption">
                    {message}
                </Typography>
            ) : null}
        </Stack>
    )
}
