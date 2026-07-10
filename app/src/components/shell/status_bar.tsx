import { Box, Chip, Stack, Typography } from '@mui/material'
import { KeyboardStatus } from './keyboard_status'
import { RunningAgentsIndicator } from './running_agents_indicator'
import type { RunningAgent } from '../../data/data_types'

interface StatusBarProps {
    activeCardCount: number
    agents: RunningAgent[]
    hasPendingCommits: boolean
    totalCardCount: number
}

/** Desktop status bar: card counts, keyboard status and the running-agents indicator. */
export function StatusBar(props: StatusBarProps) {
    const { activeCardCount, agents, hasPendingCommits, totalCardCount } = props

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
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Typography color="text.secondary" variant="body2">
                    Total cards loaded: {totalCardCount}
                </Typography>
                <Typography color="text.secondary" variant="body2">
                    Currently active: {activeCardCount}
                </Typography>
            </Stack>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                {hasPendingCommits ? <Chip color="warning" label="Unsaved changes" size="small" variant="outlined" /> : null}
                <KeyboardStatus />
                <RunningAgentsIndicator agents={agents} />
            </Stack>
        </Box>
    )
}
