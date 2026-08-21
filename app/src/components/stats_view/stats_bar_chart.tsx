import { Box, Stack, Tooltip, Typography, useTheme } from '@mui/material';
import type { StatsChartRow } from '../../services/stats/project_stats_types';

const BAR_SLOT_WIDTH = 72;
const BUCKET_WIDTH = 112;
const MINIMUM_CHART_HEIGHT = 260;
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
    if (row.unit === 'percent') {
        return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(row.value)}%`;
    }
    if (row.unit === 'dollars') {
        return new Intl.NumberFormat(undefined, { currency: 'USD', style: 'currency' }).format(row.value);
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
        mode === 'stacked' || mode === 'groupedStacked'
            ? barTotal(bar)
            : Math.max(
                Math.abs(bar.rows[0].value),
                Math.abs(bar.rows[0].value + (bar.rows[0].deviation ?? 0)),
                Math.abs(bar.rows[0].value - (bar.rows[0].deviation ?? 0)),
            )
    )));

    return Math.max(...values, 0);
}

interface ScaledPosition {
    labelOffset: number;
    percentage: number;
}

function scaledPosition(value: number, maximum: number, domainPercentage: number): ScaledPosition {
    if (maximum === 0) return { labelOffset: 0, percentage: 0 };
    const ratio = Math.abs(value) / maximum;

    return { labelOffset: ratio * VALUE_LABEL_HEIGHT, percentage: ratio * domainPercentage };
}

function positionCss({ labelOffset, percentage }: ScaledPosition, baselinePercentage = 0) {
    const totalPercentage = baselinePercentage + percentage;
    if (totalPercentage === 0) return 0;

    return `calc(${totalPercentage}% - ${labelOffset}px)`;
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
    const baselinePercentage = hasNegativeDomain ? 50 : 0;
    const domainPercentage = hasNegativeDomain ? 50 : 100;

    return (
        <Stack sx={{ height: '100%', minHeight: MINIMUM_CHART_HEIGHT + 72 }}>
            {legend.length > 0 ? (
                <Box
                    aria-label={`${ariaLabel} legend`}
                    sx={{
                        alignSelf: 'flex-start',
                        bgcolor: 'background.paper',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 1.5,
                        justifyContent: 'flex-start',
                        left: 0,
                        maxWidth: '100vw',
                        position: 'sticky',
                        px: 2,
                        pt: 1.5,
                        zIndex: 1,
                    }}
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
                    flex: 1,
                    minHeight: MINIMUM_CHART_HEIGHT + 48,
                    minWidth: buckets.length * BUCKET_WIDTH,
                    py: 2,
                    px: `${BUCKET_WIDTH / 2}px`,
                }}
            >
                {buckets.map((bucket) => {
                    const bars = barsForBucket(bucket, mode);

                    return (
                        <Box
                            data-testid="stats-bucket"
                            key={bucket.identity}
                            sx={{ display: 'flex', flex: `0 0 ${BUCKET_WIDTH}px`, flexDirection: 'column', minHeight: 0, width: BUCKET_WIDTH }}
                        >
                            <Box sx={{ height: 24 }} />
                            <Box
                                data-testid="stats-chart-canvas"
                                sx={{ display: 'flex', flex: 1, justifyContent: 'center', minHeight: MINIMUM_CHART_HEIGHT, position: 'relative' }}
                            >
                                <Box
                                    aria-label="Zero baseline"
                                    sx={{ bgcolor: 'divider', bottom: `${baselinePercentage}%`, height: 1, left: 0, position: 'absolute', right: 0 }}
                                />
                                <Box
                                    data-testid="stats-bar-slot"
                                    sx={{ display: 'flex', gap: 0.5, height: '100%', width: BAR_SLOT_WIDTH }}
                                >
                                    {bars.map((bar) => {
                                        const total = barTotal(bar);
                                        const stacked = mode === 'stacked' || mode === 'groupedStacked';
                                        const barMagnitude = scaledPosition(total, maximum, domainPercentage);

                                        return (
                                            <Box
                                                data-stack-identity={bar.identity}
                                                key={bar.identity}
                                                sx={{ flex: 1, height: '100%', minWidth: 0, position: 'relative' }}
                                            >
                                                {stacked && total > 0 ? (
                                                    <Typography
                                                        color="text.secondary"
                                                        sx={{
                                                            bottom: positionCss(barMagnitude, baselinePercentage),
                                                            left: '50%',
                                                            maxWidth: BUCKET_WIDTH,
                                                            pointerEvents: 'none',
                                                            position: 'absolute',
                                                            textAlign: 'center',
                                                            transform: 'translateX(-50%)',
                                                            width: 'max-content',
                                                        }}
                                                        variant="caption"
                                                    >
                                                        {new Intl.NumberFormat().format(total)}
                                                    </Typography>
                                                ) : null}
                                                {bar.rows.map((row, index) => {
                                                    const magnitude = scaledPosition(row.value, maximum, domainPercentage);
                                                    const priorMagnitude = stacked
                                                        ? scaledPosition(bar.rows.slice(0, index).reduce((totalValue, segment) => (
                                                            totalValue + Math.max(segment.value, 0)
                                                        ), 0), maximum, domainPercentage)
                                                        : { labelOffset: 0, percentage: 0 };
                                                    const identity = row.seriesIdentity ?? row.identity;
                                                    const color = palette[stableColorIndex(identity, palette.length)];
                                                    const isNegative = row.value < 0;
                                                    const barLabel = formattedValue(row);
                                                    const showBar = row.available && row.value !== 0;
                                                    const showDeviation = row.available && row.deviation !== null;
                                                    const deviationLowerPosition = showDeviation
                                                        ? scaledPosition(Math.max(row.value - row.deviation!, 0), maximum, domainPercentage)
                                                        : null;
                                                    const deviationUpperPosition = showDeviation
                                                        ? scaledPosition(row.value + row.deviation!, maximum, domainPercentage)
                                                        : null;
                                                    const bottom = stacked
                                                        ? positionCss(priorMagnitude, baselinePercentage)
                                                        : isNegative ? undefined : `${baselinePercentage}%`;

                                                    return (
                                                        <Box
                                                            aria-label={row.accessibleLabel}
                                                            key={`${row.identity}:${index}`}
                                                            role="listitem"
                                                            sx={{ inset: 0, pointerEvents: 'none', position: 'absolute' }}
                                                        >
                                                            {showBar ? (
                                                                <Tooltip slotProps={{ tooltip: { sx: { whiteSpace: 'pre-line' } } }} title={row.tooltip}>
                                                                    <Box
                                                                        data-testid="stats-bar"
                                                                        sx={{
                                                                            bgcolor: color,
                                                                            bottom,
                                                                            height: positionCss(magnitude),
                                                                            left: 0,
                                                                            pointerEvents: 'auto',
                                                                            position: 'absolute',
                                                                            right: 0,
                                                                            top: !stacked && isNegative ? `${baselinePercentage}%` : undefined,
                                                                        }}
                                                                    />
                                                                </Tooltip>
                                                            ) : null}
                                                            {showDeviation ? (
                                                                <Box
                                                                    data-testid="stats-deviation-whisker"
                                                                    sx={{
                                                                        borderColor: 'text.secondary',
                                                                        borderLeft: 1,
                                                                        bottom: positionCss(deviationLowerPosition!, baselinePercentage),
                                                                        left: '50%',
                                                                        pointerEvents: 'none',
                                                                        position: 'absolute',
                                                                        top: `calc(${100 - baselinePercentage - deviationUpperPosition!.percentage}% + ${deviationUpperPosition!.labelOffset}px)`,
                                                                        transform: 'translateX(-50%)',
                                                                        width: 0,
                                                                        '&::after, &::before': {
                                                                            borderColor: 'text.secondary',
                                                                            borderTop: 1,
                                                                            content: '""',
                                                                            left: -5,
                                                                            position: 'absolute',
                                                                            width: 10,
                                                                        },
                                                                        '&::after': { bottom: 0 },
                                                                        '&::before': { top: 0 },
                                                                    }}
                                                                />
                                                            ) : null}
                                                            {!stacked ? (
                                                                <Typography
                                                                    color="text.secondary"
                                                                    sx={{
                                                                        left: '50%',
                                                                        maxWidth: BUCKET_WIDTH,
                                                                        pointerEvents: 'none',
                                                                        position: 'absolute',
                                                                        textAlign: 'center',
                                                                        transform: 'translateX(-50%)',
                                                                        width: 'max-content',
                                                                        ...(isNegative
                                                                            ? { top: positionCss(magnitude, baselinePercentage) }
                                                                            : { bottom: positionCss(magnitude, baselinePercentage) }),
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
