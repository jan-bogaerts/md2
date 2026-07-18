import { Box, CircularProgress, Stack, Typography } from '@mui/material'
import CardsOutline from 'mdi-material-ui/CardsOutline'
import CloudUploadOutline from 'mdi-material-ui/CloudUploadOutline'
import ContentSaveOutline from 'mdi-material-ui/ContentSaveOutline'
import type { RunningAgent } from '../../data/data_types'
import type { ProjectAgentUsage } from '../../services/agents/agent_usage'
import type { LocalSaveState } from '../../services/data/data_service'
import { KeyboardStatus } from './keyboard_status'
import { RemoteControlStatusIndicator } from './remote_control_status_indicator'
import { RunningAgentsIndicator } from './running_agents_indicator'
import { ProjectAgentUsageSummary } from './project_agent_usage_summary'

interface StatusBarProps {
    activeCardCount: number
    agentUsage: ProjectAgentUsage
    agents: RunningAgent[]
    hasPendingPush: boolean
    isPushing: boolean
    localSaveState: LocalSaveState
    totalCardCount: number
}

/** Compact desktop status bar for board totals, synchronization and agents. */
export function StatusBar(props: StatusBarProps) {
    const { activeCardCount, agentUsage, agents, hasPendingPush, isPushing, localSaveState, totalCardCount } = props
    const isSaving = localSaveState === 'saving'

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
                sx={{ alignItems: 'center', color: localSaveState === 'saved' ? 'text.secondary' : 'warning.main' }}
            >
                {isSaving ? <CircularProgress aria-label="Saving" color="inherit" size={14} /> : <ContentSaveOutline sx={{ fontSize: 14 }} />}
                <Box component="span">{isSaving ? 'Saving changes...' : localSaveState === 'dirty' ? 'Dirty' : 'Saved locally'}</Box>
            </Stack>
            <Stack
                direction="row"
                spacing={0.75}
                sx={{ alignItems: 'center', color: hasPendingPush || isPushing ? 'warning.main' : 'text.secondary' }}
            >
                {isPushing ? <CircularProgress aria-label="Pushing" color="inherit" size={14} /> : <CloudUploadOutline sx={{ fontSize: 14 }} />}
                <Box component="span">{isPushing ? 'Pushing...' : hasPendingPush ? 'Changes ready to push' : 'Synced'}</Box>
            </Stack>
            <Box sx={{ flex: 1 }} />
            <ProjectAgentUsageSummary totals={agentUsage} />
            <RemoteControlStatusIndicator />
            <KeyboardStatus />
            <RunningAgentsIndicator agents={agents} />
        </Box>
    )
}
