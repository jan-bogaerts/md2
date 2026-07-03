import { Box, Stack, TextField } from '@mui/material'
import type { ChangeEvent } from 'react'
import { KeyboardStatus } from './KeyboardStatus'
import { RunningAgentsIndicator } from './RunningAgentsIndicator'
import type { RunningAgent } from './runningAgentTypes'

interface StatusBarProps {
    agents: RunningAgent[]
    info: string
    onInfoChange: (info: string) => void
}

/** Desktop status bar: editable info, keyboard status and the running-agents indicator. */
export function StatusBar(props: StatusBarProps) {
    const { agents, info, onInfoChange } = props

    const handleInfoChange = (event: ChangeEvent<HTMLInputElement>) => {
        onInfoChange(event.target.value)
    }

    return (
        <Box
            component="footer"
            sx={{
                alignItems: 'center',
                borderColor: 'divider',
                borderTop: 1,
                display: 'flex',
                gap: 2,
                justifyContent: 'space-between',
                px: 2,
                py: 0.5,
            }}
        >
            <TextField
                label="Status"
                onChange={handleInfoChange}
                size="small"
                sx={{ maxWidth: 360 }}
                value={info}
                variant="standard"
            />
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <KeyboardStatus />
                <RunningAgentsIndicator agents={agents} />
            </Stack>
        </Box>
    )
}
