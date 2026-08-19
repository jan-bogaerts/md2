import { Box, Stack, Tooltip, Typography, useTheme } from '@mui/material';
import type { StatsChartRow } from '../../services/stats/project_stats_service';

const CHART_HEIGHT = 260;
const MINIMUM_BAR_HEIGHT = 2;
const MINIMUM_BUCKET_WIDTH = 112;
const VALUE_LABEL_HEIGHT = 20;

export type StatsBarMode = 'grouped' | 'single' | 'stacked';

interface StatsBarChartProps {
    ariaLabel?: string;
    mode?: StatsBarMode;
    rows: StatsChartRow[];
}

interface BucketRows {
    identity: string;
    label: string;
    rows: StatsChartRow[];
}

function stableColorIndex(identity: string, paletteLength: number) {
    let hash = 0;
    for (const character of identity) hash = ((hash * 31) + character.codePointAt(0)!) | 0;

    return Math.abs(hash) % paletteLength;
}

function formattedValue(row: StatsChartRow) {
    if (!row.available) return 'Unavailable';
    if (row.unit === 'milliseconds') {
        return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(row.value / 1_000)} seconds`;
    }
    if (row.unit === 'percentagePoints') {
        return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(row.value)} pp`;
    }

    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(row.value);
}

function bucketRows(rows: StatsChartRow[]) {
    const buckets = new Map<string, BucketRows>();
    for (const row of rows) {
        const identity = row.utcBucketStart ?? row.identity;
        const current = buckets.get(identity) ?? { identity, label: row.displayLabel, rows: [] };
        current.rows.push(row);
        buckets.set(identity, current);
    }

    return [...buckets.values()];
}

function maximumMagnitude(buckets: BucketRows[], mode: StatsBarMode) {
    const values = buckets.flatMap(({ rows }) => {
        if (mode === 'stacked') return [rows.reduce((total, row) => total + Math.max(row.value, 0), 0)];

        return rows.map(({ value }) => Math.abs(value));
    });

    return Math.max(...values, 0);
}

/** Theme-backed accessible chart supporting single, grouped, and stacked vertical bars. */
export function StatsBarChart({ ariaLabel = 'Stats bar chart', mode = 'single', rows }: StatsBarChartProps) {
    const theme = useTheme();
    const buckets = bucketRows(rows);
    const maximum = maximumMagnitude(buckets, mode);
    const hasNegativeDomain = mode !== 'stacked' && rows.some(({ chartRole, value }) => chartRole === 'accountUsage' || value < 0);
    const palette = theme.palette.custom.chartPalette;
    const legend = [...new Map(rows.flatMap((row) => (
        row.seriesIdentity && row.seriesLabel ? [[row.seriesIdentity, row.seriesLabel] as [string, string]] : []
    ))).entries()];
    const baselineOffset = hasNegativeDomain ? CHART_HEIGHT / 2 : 0;
    const availableHeight = (hasNegativeDomain ? CHART_HEIGHT / 2 : CHART_HEIGHT) - VALUE_LABEL_HEIGHT;

    return (
        <Stack sx={{ minHeight: 0 }}>
            {legend.length > 0 ? (
                <Box
                    aria-label={`${ariaLabel} legend`}
                    sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: 'flex-start', px: 2, pt: 1.5 }}
                >
                    {legend.map(([identity, label]) => (
                        <Stack direction="row" key={identity} spacing={0.75} sx={{ alignItems: 'center' }}>
                            <Box
                                sx={{
                                    bgcolor: palette[stableColorIndex(identity, palette.length)],
                                    borderRadius: 99,
                                    height: 8,
                                    width: 8,
                                }}
                            />
                            <Typography color="text.secondary" variant="caption">{label}</Typography>
                        </Stack>
                    ))}
                </Box>
            ) : null}
            <Box
                aria-label={ariaLabel}
                data-chart-mode={mode}
                role="list"
                sx={{
                    alignItems: 'stretch',
                    display: 'flex',
                    gap: 1.5,
                    minHeight: CHART_HEIGHT + 72,
                    minWidth: buckets.length * MINIMUM_BUCKET_WIDTH,
                    p: 2,
                }}
            >
                {buckets.map((bucket) => {
                    const total = bucket.rows.reduce((sum, row) => sum + row.value, 0);

                    return (
                        <Box
                            key={bucket.identity}
                            sx={{ display: 'flex', flex: `1 0 ${MINIMUM_BUCKET_WIDTH - 12}px`, flexDirection: 'column', minWidth: 0 }}
                        >
                            <Box sx={{ height: 24, textAlign: 'center' }}>
                                <Typography color="text.secondary" variant="caption">
                                    {mode === 'stacked' ? new Intl.NumberFormat().format(total) : null}
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', flex: 1, gap: 0.5, height: CHART_HEIGHT, justifyContent: 'center', position: 'relative' }}>
                                {hasNegativeDomain ? (
                                    <Box
                                        aria-label="Zero baseline"
                                        sx={{ bgcolor: 'divider', height: 1, left: 0, position: 'absolute', right: 0, top: CHART_HEIGHT / 2 }}
                                    />
                                ) : null}
                                <Box sx={{ display: 'flex', flex: 1, flexDirection: mode === 'stacked' ? 'column-reverse' : 'row', gap: mode === 'stacked' ? 0 : 0.5, justifyContent: 'center', maxWidth: mode === 'grouped' ? '100%' : 72 }}>
                                    {bucket.rows.map((row, index) => {
                                        const magnitude = maximum === 0
                                            ? MINIMUM_BAR_HEIGHT
                                            : Math.max(MINIMUM_BAR_HEIGHT, (Math.abs(row.value) / maximum) * availableHeight);
                                        const identity = row.seriesIdentity ?? row.identity;
                                        const color = palette[stableColorIndex(identity, palette.length)];
                                        const isNegative = row.value < 0;
                                        const barLabel = formattedValue(row);

                                        return (
                                            <Box
                                                aria-label={row.accessibleLabel}
                                                key={`${row.identity}:${row.utcBucketStart ?? index}`}
                                                role="listitem"
                                                sx={{
                                                    alignItems: 'center',
                                                    display: 'flex',
                                                    flex: mode === 'grouped' ? 1 : '0 0 auto',
                                                    flexDirection: mode === 'stacked' ? 'column' : undefined,
                                                    height: mode === 'stacked' ? magnitude : CHART_HEIGHT,
                                                    justifyContent: mode === 'stacked' ? 'flex-end' : undefined,
                                                    minWidth: mode === 'grouped' ? 20 : 48,
                                                    position: 'relative',
                                                }}
                                            >
                                                <Tooltip title={row.tooltip}>
                                                    <Box
                                                        sx={{
                                                            bgcolor: color,
                                                            borderRadius: 1,
                                                            height: magnitude,
                                                            left: mode === 'stacked' ? undefined : 0,
                                                            minHeight: MINIMUM_BAR_HEIGHT,
                                                            position: mode === 'stacked' ? 'static' : 'absolute',
                                                            right: mode === 'stacked' ? undefined : 0,
                                                            ...(mode === 'stacked'
                                                                ? {}
                                                                : isNegative ? { top: baselineOffset } : { bottom: baselineOffset }),
                                                            width: '100%',
                                                        }}
                                                    />
                                                </Tooltip>
                                                {mode !== 'stacked' ? (
                                                    <Typography
                                                        color="text.secondary"
                                                        noWrap
                                                        sx={{
                                                            left: 0,
                                                            position: 'absolute',
                                                            right: 0,
                                                            textAlign: 'center',
                                                            ...(isNegative
                                                                ? { top: baselineOffset + magnitude }
                                                                : { bottom: baselineOffset + magnitude }),
                                                        }}
                                                        title={barLabel}
                                                        variant="caption"
                                                    >
                                                        {barLabel}
                                                    </Typography>
                                                ) : null}
                                            </Box>
                                        );
                                    })}
                                </Box>
                            </Box>
                            <Typography align="center" color="text.secondary" noWrap title={bucket.label} variant="caption">
                                {bucket.label}
                            </Typography>
                        </Box>
                    );
                })}
            </Box>
        </Stack>
    );
}
