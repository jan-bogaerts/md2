import { Box, Stack, Typography } from '@mui/material'
import type { AgentConversationEvent } from '../../data/data_types'
import { activityHasError, activityStatusLabel } from './activity_display'

interface ReasoningActivityProps {
    activity: AgentConversationEvent
}

/** Subdued live reasoning summary preserving provider section boundaries. */
export function ReasoningActivity({ activity }: ReasoningActivityProps) {
    const sections = activity.summary && activity.summary.length > 0
        ? activity.summary
        : activity.details && activity.details.length > 0
            ? activity.details
            : activity.content ? [activity.content] : []
    const hasError = activityHasError(activity.status)

    return (
        <Box
            sx={{
                bgcolor: 'background.default',
                border: '1px solid',
                borderColor: hasError ? 'error.main' : 'divider',
                borderRadius: 1,
                flexShrink: 0,
                minWidth: 0,
                p: 1,
            }}
        >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">Burning tokens</Typography>
                <Typography color={hasError ? 'error.main' : 'custom.text3'} role="status" variant="caption">
                    {activityStatusLabel(activity.status)}
                </Typography>
            </Stack>
            {sections.map((section, index) => (
                <Typography
                    color={hasError ? 'error.main' : 'text.secondary'}
                    key={`${activityIdentity(activity)}-section-${index}`}
                    sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
                    variant="body2"
                >
                    {section}
                </Typography>
            ))}
        </Box>
    )
}

function activityIdentity(activity: AgentConversationEvent) {
    return activity.providerItemId ?? activity.id
}
