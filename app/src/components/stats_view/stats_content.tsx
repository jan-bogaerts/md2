import { Box, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { dialogService } from '../../services/dialog_service';
import { projectStatsService } from '../../services/stats/project_stats_service';
import type { StatsExclusionReason } from '../../services/stats/project_stats_types';
import { StatsBarChart, type StatsBarMode } from './stats_bar_chart';
import { StatsControls } from './stats_controls';
import { StatsUsageComparisonCharts } from './stats_usage_comparison_charts';

const EXCLUSION_LABELS: Record<StatsExclusionReason, string> = {
    missingAttribution: 'missing agent/model attribution',
    missingCompletion: 'missing final completion time',
    missingDuration: 'missing measured timer',
    mixedAttribution: 'mixed agent/model attribution',
    nestedConversations: 'nested agent conversations',
    notTerminal: 'running or waiting',
};

/** Smallest stats-data subscriber; renders chart states and reports new load failures. */
export function StatsContent() {
    const snapshot = useSyncExternalStore(projectStatsService.subscribe, projectStatsService.getSnapshot, projectStatsService.getSnapshot);
    const reportedErrorRef = useRef<Error | null>(null);
    const reportedWarningRef = useRef('');

    useEffect(() => {
        if (!snapshot.error || reportedErrorRef.current === snapshot.error) return;
        reportedErrorRef.current = snapshot.error;
        dialogService.error(snapshot.error, { fallbackMessage: 'Project stats could not be loaded' });
    }, [snapshot.error]);

    useEffect(() => {
        const warning = snapshot.warnings.join('\n');
        if (!warning || reportedWarningRef.current === warning) return;
        reportedWarningRef.current = warning;
        dialogService.warning(warning, { title: 'Some usage metrics were skipped' });
    }, [snapshot.warnings]);

    if (snapshot.status === 'loading') {
        return <Stack aria-label="Loading project stats" sx={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}><CircularProgress /></Stack>;
    }
    if (snapshot.status === 'error') {
        return (
            <Stack role="alert" sx={{ alignItems: 'center', flex: 1, justifyContent: 'center', p: 3, textAlign: 'center' }}>
                <Typography variant="h6">Stats unavailable</Typography>
                <Typography color="text.secondary" variant="body2">{snapshot.error?.message}</Typography>
            </Stack>
        );
    }

    const { controls } = snapshot;
    const tokenMetricUnavailable = controls.dataset === 'activityOverTime'
        && controls.activityMetric === 'tokens'
        && !snapshot.tokenTimeAvailable;
    const chartMode: StatsBarMode = controls.dataset === 'agentPerformance'
        ? 'grouped'
        : controls.dataset === 'activityOverTime' && controls.activityMetric === 'actions' ? 'stacked' : 'single';
    const exclusions = Object.entries(snapshot.exclusionCounts) as Array<[StatsExclusionReason, number]>;

    return (
        <Stack sx={{ flex: 1, minHeight: 0, p: 2.5, width: '100%' }} spacing={2}>
            <Typography component="h2" variant="h6">Project stats</Typography>
            <StatsControls snapshot={snapshot} />
            {snapshot.warnings.map((warning) => <Typography color="warning.main" key={warning} variant="body2">{warning}</Typography>)}
            {snapshot.omittedTimerCount > 0 && controls.dataset === 'totals' && controls.totalsMetric === 'duration' ? (
                <Typography color="text.secondary" variant="body2">
                    {snapshot.omittedTimerCount} terminal conversation{snapshot.omittedTimerCount === 1 ? '' : 's'} omitted because stored timer is unavailable.
                </Typography>
            ) : null}
            {controls.dataset === 'agentPerformance' && snapshot.excludedSampleCount > 0 ? (
                <Typography color="text.secondary" variant="body2">
                    {snapshot.excludedSampleCount} sample{snapshot.excludedSampleCount === 1 ? '' : 's'} excluded: {exclusions.map(([reason, count]) => `${count} ${EXCLUSION_LABELS[reason]}`).join('; ')}.
                </Typography>
            ) : null}
            {controls.dataset === 'usageComparison' ? (
                <Typography color="text.secondary" variant="body2">
                    Account usage may include other projects and external CLI sessions. Ratios compare project work with
                    account-wide consumption; they do not attribute all account usage to this project.
                </Typography>
            ) : null}
            <Paper
                data-testid="stats-chart-panel"
                elevation={0}
                sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 2,
                    display: 'flex',
                    flex: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                }}
            >
                {tokenMetricUnavailable ? (
                    <Box sx={{ alignContent: 'center', flex: 1, p: 3, textAlign: 'center' }}>
                        <Typography color="text.secondary">Token usage over time unavailable: usage_metrics.csv is missing.</Typography>
                    </Box>
                ) : snapshot.rows.length === 0 ? (
                    <Box sx={{ alignContent: 'center', border: '1.5px dashed', borderColor: 'custom.borderStrong', borderRadius: 1, flex: 1, m: 2, p: 3, textAlign: 'center' }}>
                        <Typography color="custom.text4">No stats data matches current filters.</Typography>
                    </Box>
                ) : (
                    <Box data-testid="stats-chart-viewport" sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                        {controls.dataset === 'usageComparison'
                            ? <StatsUsageComparisonCharts rows={snapshot.rows} shortTokenCounts={snapshot.controls.shortTokenCounts} />
                            : <StatsBarChart mode={chartMode} rows={snapshot.rows} shortTokenCounts={snapshot.controls.shortTokenCounts} />}
                    </Box>
                )}
            </Paper>
        </Stack>
    );
}
