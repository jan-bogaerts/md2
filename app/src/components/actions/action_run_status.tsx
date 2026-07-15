import { Box, Stack, Typography } from '@mui/material'
import type { ActionRunLogEntry } from '../../data/action_run_types'
import { actionStatusLabel } from './action_status'

interface ActionRunStatusProps {
    color: string
    logs: ActionRunLogEntry[]
    status: string
}

/** Presentation-only current run status and log summary. */
export function ActionRunStatus(props: ActionRunStatusProps) {
    const { color, logs, status } = props

    return (
        <Box role="status">
            <Typography color={color} variant="body2">
                {actionStatusLabel(status as ActionRunLogEntry['status'])}
            </Typography>
            {logs.length > 0 ? (
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                    {logs.map((log, index) => (
                        <Typography key={`${log.actionName}-${log.phase}-${index}`} color="text.secondary" variant="caption">
                            {log.phase}: {log.message}{log.stdout || log.stderr ? ` — ${log.stdout}${log.stderr}` : ''}
                            {log.thinkingLevel ? ` (thinking: ${log.thinkingLevel})` : ''}
                        </Typography>
                    ))}
                </Stack>
            ) : null}
        </Box>
    )
}
