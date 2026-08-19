import { Box, Stack, Tooltip, Typography, useTheme } from '@mui/material';
import type { StatsChartRow } from '../../services/stats/project_stats_service';

const BAR_SLOT_WIDTH = 72;
const BUCKET_WIDTH = 112;
const CHART_HEIGHT = 260;
const VALUE_LABEL_HEIGHT = 20;

export type StatsBarMode = 'grouped' | 'groupedStacked' | 'single' | 'stacked';

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

interface BarRows {
    identity: string;
    label: string | null;
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

function groupedStackedBars(rows: StatsChartRow[]) {
    const groups = new Map<string, BarRows>();
    for (const row of rows) {
        const identity = row.stackIdentity ?? row.identity;
        const current = groups.get(identity) ?? { identity, label: row.stackLabel, rows: [] };
        current.rows.push(row);
        groups.set(identity, current);
    }

    return [...groups.values()];
}

function barsForBucket(bucket: BucketRows, mode: StatsBarMode): BarRows[] {
    if (mode === 'stacked') return [{ identity: bucket.identity, label: null, rows: bucket.rows }];
    if (mode === 'groupedStacked') return groupedStackedBars(bucket.rows);

    return bucket.rows.map((row, index) => ({ identity: `${row.identity}:${index}`, label: null, rows: [row] }));
}

function barTotal(bar: BarRows) {
    return bar.rows.reduce((total, row) => total + Math.max(row.value, 0), 0);
}

function maximumMagnitude(buckets: BucketRows[], mode: StatsBarMode) {
    const values = buckets.flatMap((bucket) => barsForBucket(bucket, mode).map((bar) => (
        mode === 'stacked' || mode === 'groupedStacked' ? barTotal(bar) : Math.abs(bar.rows[0].value)
    )));

    return Math.max(...values, 0);
}

/** Theme-backed chart with fixed bucket geometry and accessible grouped stacks. */
export function StatsBarChart({ ariaLabel = 'Stats bar chart', mode = 'single', rows }: StatsBarChartProps) {
    const theme = useTheme();
    const buckets = bucketRows(rows);
    const maximum = maximumMagnitude(buckets, mode);
    const hasNegativeDomain = mode !== 'stacked' && mode !== 'groupedStacked' && rows.some(({ value }) => value < 0);
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
                    minHeight: CHART_HEIGHT + 72,
                    minWidth: buckets.length * BUCKET_WIDTH,
                    p: 2,
                }}
            >
                {buckets.map((bucket) => {
                    const bars = barsForBucket(bucket, mode);

                    return (
                        <Box
                            data-testid="stats-bucket"
                            key={bucket.identity}
                            sx={{ display: 'flex', flex: `0 0 ${BUCKET_WIDTH}px`, flexDirection: 'column', width: BUCKET_WIDTH }}
                        >
                            <Box sx={{ height: 24 }} />
                            <Box sx={{ display: 'flex', height: CHART_HEIGHT, justifyContent: 'center', position: 'relative' }}>
                                <Box
                                    aria-label="Zero baseline"
                                    sx={{ bgcolor: 'divider', bottom: baselineOffset, height: 1, left: 0, position: 'absolute', right: 0 }}
                                />
                                <Box
                                    data-testid="stats-bar-slot"
                                    sx={{ display: 'flex', gap: 0.5, height: CHART_HEIGHT, width: BAR_SLOT_WIDTH }}
                                >
                                    {bars.map((bar) => {
                                        const total = barTotal(bar);
                                        const stacked = mode === 'stacked' || mode === 'groupedStacked';
                                        const barMagnitude = maximum === 0 ? 0 : (total / maximum) * availableHeight;

                                        return (
                                            <Box
                                                data-stack-identity={bar.identity}
                                                key={bar.identity}
                                                sx={{ flex: 1, height: CHART_HEIGHT, minWidth: 0, position: 'relative' }}
                                            >
                                                {stacked && total > 0 ? (
                                                    <Typography
                                                        color="text.secondary"
                                                        noWrap
                                                        sx={{ bottom: baselineOffset + barMagnitude, left: 0, position: 'absolute', right: 0, textAlign: 'center' }}
                                                        variant="caption"
                                                    >
                                                        {new Intl.NumberFormat().format(total)}
                                                    </Typography>
                                                ) : null}
                                                {bar.rows.map((row, index) => {
                                                    const magnitude = maximum === 0
                                                        ? 0
                                                        : (Math.abs(row.value) / maximum) * availableHeight;
                                                    const priorMagnitude = stacked
                                                        ? bar.rows.slice(0, index).reduce((height, segment) => (
                                                            height + ((Math.max(segment.value, 0) / maximum) * availableHeight)
                                                        ), 0)
                                                        : 0;
                                                    const identity = row.seriesIdentity ?? row.identity;
                                                    const color = palette[stableColorIndex(identity, palette.length)];
                                                    const isNegative = row.value < 0;
                                                    const barLabel = formattedValue(row);
                                                    const showBar = row.available && row.value !== 0;
                                                    const bottom = stacked
                                                        ? baselineOffset + priorMagnitude
                                                        : isNegative ? undefined : baselineOffset;

                                                    return (
                                                        <Box
                                                            aria-label={row.accessibleLabel}
                                                            key={`${row.identity}:${index}`}
                                                            role="listitem"
                                                            sx={{ inset: 0, position: 'absolute' }}
                                                        >
                                                            {showBar ? (
                                                                <Tooltip title={row.tooltip}>
                                                                    <Box
                                                                        data-testid="stats-bar"
                                                                        sx={{
                                                                            bgcolor: color,
                                                                            bottom,
                                                                            height: magnitude,
                                                                            left: 0,
                                                                            position: 'absolute',
                                                                            right: 0,
                                                                            top: !stacked && isNegative ? baselineOffset : undefined,
                                                                        }}
                                                                    />
                                                                </Tooltip>
                                                            ) : null}
                                                            {!stacked ? (
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
                                                {bar.label ? (
                                                    <Typography
                                                        color="text.secondary"
                                                        noWrap
                                                        sx={{ bottom: 0, left: 0, position: 'absolute', right: 0, textAlign: 'center' }}
                                                        title={bar.label}
                                                        variant="caption"
                                                    >
                                                        {bar.label}
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
