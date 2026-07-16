import { Button, Stack, TextField, Typography } from '@mui/material'
import type { ChangeEvent } from 'react'

interface ActionScheduleFormProps {
    message: string | null
    onRegister: () => void
    onTimestampChange: (event: ChangeEvent<HTMLInputElement>) => void
    timestamp: string
}

/** Presentation-only scheduled action registration form. */
export function ActionScheduleForm(props: ActionScheduleFormProps) {
    const {
        message,
        onRegister,
        onTimestampChange,
        timestamp,
    } = props

    return (
        <Stack spacing={1}>
            <TextField autoFocus label="Date and time" onChange={onTimestampChange} required size="small" type="datetime-local" value={timestamp} />
            <Button onClick={onRegister} size="small" variant="contained">
                Schedule action
            </Button>
            {message ? (
                <Typography color="text.secondary" role="status" variant="caption">
                    {message}
                </Typography>
            ) : null}
        </Stack>
    )
}
