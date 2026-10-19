import { Paper, Stack, Typography } from '@mui/material';
import type { StatsChartRow } from '../../services/stats/project_stats_types';
import { StatsBarChart } from './stats_bar_chart';
import { USAGE_COMPARISON_SECTIONS } from './stats_usage_comparison_sections';

interface StatsUsageComparisonChartsProps {
    rows: StatsChartRow[];
    shortTokenCounts?: boolean;
}

/** Separately scaled comparison charts aligned by shared UTC buckets. */
export function StatsUsageComparisonCharts({ rows, shortTokenCounts = false }: StatsUsageComparisonChartsProps) {
    return (
        <Stack spacing={2} sx={{ minWidth: 0, p: 2, width: { xs: '100%', md: 'max-content' } }}>
            {USAGE_COMPARISON_SECTIONS.map(({ label, mode, role }) => (
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
                            maxWidth: { xs: '100%', md: 'none' },
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
    );
}
