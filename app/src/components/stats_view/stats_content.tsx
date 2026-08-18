import { Box, CircularProgress, Paper, Stack, Typography } from '@mui/material'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { dialogService } from '../../services/dialog_service'
import { projectStatsService } from '../../services/stats/project_stats_service'
import { StatsBarChart } from './stats_bar_chart'
import { StatsControls } from './stats_controls'

/** Smallest stats-data subscriber; renders chart states and reports new load failures. */
export function StatsContent() {
    const snapshot = useSyncExternalStore(projectStatsService.subscribe, projectStatsService.getSnapshot, projectStatsService.getSnapshot)
    const reportedErrorRef = useRef<Error | null>(null)
    const reportedWarningRef = useRef('')

    useEffect(() => {
        if (!snapshot.error || reportedErrorRef.current === snapshot.error) return
        reportedErrorRef.current = snapshot.error
        dialogService.error(snapshot.error, { fallbackMessage: 'Project stats could not be loaded' })
    }, [snapshot.error])

    useEffect(() => {
        const warning = snapshot.warnings.join('\n')
        if (!warning || reportedWarningRef.current === warning) return
        reportedWarningRef.current = warning
        dialogService.warning(warning, { title: 'Some usage metrics were skipped' })
    }, [snapshot.warnings])

    if (snapshot.status === 'loading') {
        return <Stack aria-label="Loading project stats" sx={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}><CircularProgress /></Stack>
    }
    if (snapshot.status === 'error') {
        return (
            <Stack role="alert" sx={{ alignItems: 'center', flex: 1, justifyContent: 'center', p: 3, textAlign: 'center' }}>
                <Typography variant="h6">Stats unavailable</Typography>
                <Typography color="text.secondary" variant="body2">{snapshot.error?.message}</Typography>
            </Stack>
        )
    }

    const tokenMetricUnavailable = snapshot.controls.dataset === 'activityOverTime'
        && snapshot.controls.activityMetric === 'tokens'
        && !snapshot.tokenTimeAvailable

    return (
        <Stack sx={{ flex: 1, minHeight: 0, p: 2.5 }} spacing={2}>
            <Typography component="h2" variant="h6">Project stats</Typography>
            <StatsControls snapshot={snapshot} />
            {snapshot.warnings.map((warning) => (
                <Typography color="warning.main" key={warning} variant="body2">{warning}</Typography>
            ))}
            {snapshot.omittedTimerCount > 0 && snapshot.controls.dataset === 'totals' && snapshot.controls.totalsMetric === 'duration' ? (
                <Typography color="text.secondary" variant="body2">
                    {snapshot.omittedTimerCount} terminal conversation{snapshot.omittedTimerCount === 1 ? '' : 's'} omitted because stored timer is unavailable.
                </Typography>
            ) : null}
            <Paper
                elevation={0}
                sx={{ border: 1, borderColor: 'divider', borderRadius: 2, display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}
            >
                {tokenMetricUnavailable ? (
                    <Box sx={{ alignContent: 'center', flex: 1, p: 3, textAlign: 'center' }}>
                        <Typography color="text.secondary">Token usage over time unavailable: usage_metrics.csv is missing.</Typography>
                    </Box>
                ) : snapshot.rows.length === 0 ? (
                    <Box sx={{ alignContent: 'center', border: '1.5px dashed', borderColor: 'custom.borderStrong', borderRadius: 1, flex: 1, m: 2, p: 3, textAlign: 'center' }}>
                        <Typography color="custom.text4">No stats data matches current filters.</Typography>
                    </Box>
                ) : <StatsBarChart rows={snapshot.rows} />}
            </Paper>
        </Stack>
    )
}
