import { Box, Typography } from '@mui/material'
import { CardCountSummary } from './project_card_count_summary'
import { ProjectSyncStatus } from './project_sync_status'
import { RunningAgentsIndicator } from './running_agents_indicator'
import { ProjectAgentUsageSummary } from './project_agent_usage_summary'
import { CodexRateLimitStatus } from './codex_rate_limit_status'
import { RemoteControlStatusIndicator } from './remote_control_status_indicator'
import { KeyboardStatus } from './keyboard_status'

/** Mobile drawer presentation for live project status. */
export function MobileProjectStatus() {
    return (
        <Box aria-labelledby="mobile-project-status-title" component="section" sx={{ maxHeight: '50vh', overflowY: 'auto', py: 1 }}>
            <Typography id="mobile-project-status-title" sx={{ color: 'custom.colHead', px: 2 }} variant="overline">
                Project status
            </Typography>
            <CardCountSummary mobile />
            <ProjectSyncStatus mobile />
            <RunningAgentsIndicator mobile />
            <ProjectAgentUsageSummary mobile />
            <CodexRateLimitStatus mobile />
            <RemoteControlStatusIndicator mobile />
            <KeyboardStatus mobile />
        </Box>
    )
}
