import { Paper, Stack, Typography } from '@mui/material';
import type { StatsChartRole, StatsChartRow } from '../../services/stats/project_stats_types';
import { StatsBarChart } from './stats_bar_chart';
import { StatsSeriesColorProvider } from './stats_series_color_provider';

interface StatsUsageComparisonChartsProps {
    rows: StatsChartRow[];
    shortTokenCounts?: boolean;
}

interface ComparisonChart {
    label: string;
    mode: 'grouped' | 'groupedStacked';
    role: StatsChartRole;
}

const CHARTS: ComparisonChart[] = [
    { label: 'Account usage', mode: 'grouped', role: 'accountUsage' },
    { label: 'Project token usage (totals)', mode: 'grouped', role: 'projectTokensTotal' },
    { label: 'Project token usage (average per action)', mode: 'grouped', role: 'projectTokensAverage' },
    { label: 'Tokens per percent account usage', mode: 'grouped', role: 'tokensPerAccountUsage' },
    { label: 'Tokens per dollar', mode: 'grouped', role: 'tokensPerDollar' },
    { label: 'Estimated cost per agent', mode: 'grouped', role: 'costPerAgent' },
    { label: 'Average cost per action', mode: 'grouped', role: 'costPerActionAverage' },
    { label: 'Actions per percent account usage', mode: 'grouped', role: 'actionsPerAccountUsage' },
    { label: 'Project activity', mode: 'groupedStacked', role: 'activity' },
];

/** Separately scaled comparison charts aligned by shared UTC buckets. */
export function StatsUsageComparisonCharts({ rows, shortTokenCounts = false }: StatsUsageComparisonChartsProps) {
    return (
        <StatsSeriesColorProvider rows={rows}>
            <Stack spacing={2} sx={{ minWidth: '100%', p: 2, width: 'max-content' }}>
                {CHARTS.map(({ label, mode, role }) => (
                    <Paper
                        key={role}
                        sx={{
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 2,
                            display: 'flex',
                            flexDirection: 'column',
                            minHeight: 280,
                            overflow: 'visible',
                        }}
                    >
                        {/* Shrink-to-fit inside the flex column, so the sticky left offset has room to shift. */}
                        <Typography
                            component="h3"
                            sx={{
                                alignSelf: 'flex-start',
                                bgcolor: 'background.paper',
                                left: 0,
                                position: 'sticky',
                                px: 2,
                                pt: 1.5,
                                width: 'max-content',
                                zIndex: 1,
                            }}
                            variant="subtitle2"
                        >
                            {label}
                        </Typography>
                        <StatsBarChart ariaLabel={`${label} chart`} mode={mode} rows={rows.filter(({ chartRole }) => chartRole === role)} shortTokenCounts={shortTokenCounts} />
                    </Paper>
                ))}
            </Stack>
        </StatsSeriesColorProvider>
    );
}
