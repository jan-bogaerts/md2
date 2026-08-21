import { Paper, Stack, Typography } from '@mui/material';
import type { StatsChartRole, StatsChartRow } from '../../services/stats/project_stats_types';
import { StatsBarChart } from './stats_bar_chart';

interface StatsUsageComparisonChartsProps {
    rows: StatsChartRow[];
}

const CHARTS: Array<{ label: string; mode: 'grouped' | 'groupedStacked'; role: StatsChartRole }> = [
    { label: 'Account usage', mode: 'grouped', role: 'accountUsage' },
    { label: 'Project token usage', mode: 'grouped', role: 'projectTokens' },
    { label: 'Tokens per percent account usage', mode: 'grouped', role: 'tokensPerAccountUsage' },
    { label: 'Actions per percent account usage', mode: 'grouped', role: 'actionsPerAccountUsage' },
    { label: 'Project activity', mode: 'groupedStacked', role: 'activity' },
];

/** Separately scaled comparison charts aligned by shared UTC buckets. */
export function StatsUsageComparisonCharts({ rows }: StatsUsageComparisonChartsProps) {
    return (
        <Stack spacing={2} sx={{ minWidth: '100%', p: 2, width: 'max-content' }}>
            {CHARTS.map(({ label, mode, role }) => (
                <Paper key={role} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, minHeight: 280, overflow: 'hidden' }}>
                    <Typography component="h3" sx={{ px: 2, pt: 1.5 }} variant="subtitle2">{label}</Typography>
                    <StatsBarChart ariaLabel={`${label} chart`} mode={mode} rows={rows.filter(({ chartRole }) => chartRole === role)} />
                </Paper>
            ))}
        </Stack>
    );
}
