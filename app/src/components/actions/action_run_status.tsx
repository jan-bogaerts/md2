import { Box, Stack, Typography } from '@mui/material'
import type { ActionRunResult } from '../../services/action_runner'

interface ActionRunStatusProps {
    color: string
    result: ActionRunResult | null
    status: string
}

/** Presentation-only current run status and log summary. */
export function ActionRunStatus(props: ActionRunStatusProps) {
    const { color, result, status } = props

    return (
        <Box role="status">
            <Typography color={color} variant="body2">
                {status}
            </Typography>
            {result ? (
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                    {result.logs.map((log, index) => (
                        <Typography key={`${log.actionName}-${log.phase}-${index}`} color="text.secondary" variant="caption">
                            {log.phase}: {log.message}
                        </Typography>
                    ))}
                </Stack>
            ) : null}
        </Box>
    )
}
