import { Paper, Stack, Typography } from '@mui/material';
import type { StatsChartRole, StatsChartRow, StatsUsageTokenAggregation } from '../../services/stats/project_stats_types';
import { StatsBarChart } from './stats_bar_chart';

interface StatsUsageComparisonChartsProps {
    rows: StatsChartRow[];
    tokenAggregation: StatsUsageTokenAggregation;
}

interface ComparisonChart {
    label: string | Record<StatsUsageTokenAggregation, string>;
    mode: 'grouped' | 'groupedStacked';
    role: StatsChartRole;
}

const CHARTS: ComparisonChart[] = [
    { label: 'Account usage', mode: 'grouped', role: 'accountUsage' },
    {
        label: { average: 'Project token usage (average per action)', total: 'Project token usage (totals)' },
        mode: 'grouped',
        role: 'projectTokens',
    },
    { label: 'Tokens per percent account usage', mode: 'grouped', role: 'tokensPerAccountUsage' },
    { label: 'Actions per percent account usage', mode: 'grouped', role: 'actionsPerAccountUsage' },
    { label: 'Project activity', mode: 'groupedStacked', role: 'activity' },
];

function chartLabel(label: ComparisonChart['label'], tokenAggregation: StatsUsageTokenAggregation) {
    return typeof label === 'string' ? label : label[tokenAggregation];
}

/** Separately scaled comparison charts aligned by shared UTC buckets. */
export function StatsUsageComparisonCharts({ rows, tokenAggregation }: StatsUsageComparisonChartsProps) {
    return (
        <Stack spacing={2} sx={{ minWidth: '100%', p: 2, width: 'max-content' }}>
            {CHARTS.map(({ label, mode, role }) => {
                const displayLabel = chartLabel(label, tokenAggregation);

                return (
                    <Paper key={role} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, minHeight: 280, overflow: 'visible' }}>
                        <Typography
                            component="h3"
                            sx={{ alignSelf: 'flex-start', bgcolor: 'background.paper', left: 0, position: 'sticky', px: 2, pt: 1.5, zIndex: 1 }}
                            variant="subtitle2"
                        >
                            {displayLabel}
                        </Typography>
                        <StatsBarChart ariaLabel={`${displayLabel} chart`} mode={mode} rows={rows.filter(({ chartRole }) => chartRole === role)} />
                    </Paper>
                );
            })}
        </Stack>
    );
}
