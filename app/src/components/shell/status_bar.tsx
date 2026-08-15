import { Box } from '@mui/material'
import { KeyboardStatus } from './keyboard_status'
import { RemoteControlStatusIndicator } from './remote_control_status_indicator'
import { RunningAgentsIndicator } from './running_agents_indicator'
import { ProjectAgentUsageSummary } from './project_agent_usage_summary'
import { CardCountSummary } from './project_card_count_summary'
import { ProjectSyncStatus } from './project_sync_status'
import { CodexRateLimitStatus } from './codex_rate_limit_status'
import { ClaudeRateLimitStatus } from './claude_rate_limit_status'

/** Compact desktop status bar for board totals, synchronization and agents. */
export function StatusBar() {
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
            <CardCountSummary />
            <ProjectSyncStatus />
            <Box sx={{ flex: 1 }} />
            <ProjectAgentUsageSummary />
            <ClaudeRateLimitStatus />
            <CodexRateLimitStatus />
            <RemoteControlStatusIndicator />
            <KeyboardStatus />
            <RunningAgentsIndicator />
        </Box>
    )
}
