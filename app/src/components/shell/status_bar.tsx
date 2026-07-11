import { Box, Stack, Typography } from '@mui/material'
import CardsOutline from 'mdi-material-ui/CardsOutline'
import Sync from 'mdi-material-ui/Sync'
import type { RunningAgent } from '../../data/data_types'
import { KeyboardStatus } from './keyboard_status'
import { RunningAgentsIndicator } from './running_agents_indicator'

interface StatusBarProps {
    activeCardCount: number
    agents: RunningAgent[]
    hasPendingCommits: boolean
    totalCardCount: number
}

/** Compact desktop status bar for board totals, synchronization and agents. */
export function StatusBar(props: StatusBarProps) {
    const { activeCardCount, agents, hasPendingCommits, totalCardCount } = props

    return (
        <Box
            component="footer"
            sx={{
                alignItems: 'center',
                bgcolor: 'background.paper',
                borderTop: 1,
                borderColor: 'divider',
                color: 'text.secondary',
                display: 'flex',
                flexShrink: 0,
                fontSize: 11.5,
                gap: 2,
                height: 32,
                px: 1.75,
            }}
        >
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                <CardsOutline sx={{ color: 'text.secondary', fontSize: 14 }} />
                <Typography component="span" sx={{ color: 'text.primary', fontSize: 'inherit', fontWeight: 600 }}>
                    {totalCardCount}
                </Typography>
                <Box component="span">cards</Box>
            </Stack>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                <Box sx={{ bgcolor: 'success.main', borderRadius: '50%', height: 7, width: 7 }} />
                <Typography component="span" sx={{ color: 'text.primary', fontSize: 'inherit', fontWeight: 600 }}>
                    {activeCardCount}
                </Typography>
                <Box component="span">active</Box>
            </Stack>
            <Stack
                direction="row"
                spacing={0.75}
                sx={{ alignItems: 'center', color: hasPendingCommits ? 'warning.main' : 'text.secondary' }}
            >
                <Sync sx={{ fontSize: 14 }} />
                <Box component="span">{hasPendingCommits ? 'Changes pending' : 'Synced just now'}</Box>
            </Stack>
            <Box sx={{ flex: 1 }} />
            <KeyboardStatus />
            <RunningAgentsIndicator agents={agents} />
        </Box>
    )
}
