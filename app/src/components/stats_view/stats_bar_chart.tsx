import { Box, Stack, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useMemo, useSyncExternalStore } from 'react';
import { projectStatsService } from '../../services/stats/project_stats_service';
import type { StatsChartRow } from '../../services/stats/project_stats_types';
import { seriesColorKey } from '../../services/stats/stats_series_slots';
import { barsForBucket, barTotal, bucketRows, type BucketRows, type StatsBarMode } from './stats_bar_groups';
import { resolveSeriesColors, type StatsSeriesPalettes } from './stats_series_colors';
import { formattedValue, stackTotalLabel } from './stats_value_format';
import { StatsHorizontalBarChart } from './stats_horizontal_bar_chart';

const BAR_SLOT_WIDTH = 72;
const BUCKET_WIDTH = 112;
const MINIMUM_CHART_HEIGHT = 260;
const VALUE_LABEL_HEIGHT = 20;

interface StatsBarChartProps {
    ariaLabel?: string;
    mode?: StatsBarMode;
    rows: StatsChartRow[];
    shortTokenCounts?: boolean;
}

function effectiveSeriesIdentity(row: StatsChartRow) {
    return row.seriesIdentity ?? row.identity;
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

/** Session-remembered label colors, recomputed only when a new label is remembered or the theme palettes change. */
function useSeriesColors(palettes: StatsSeriesPalettes) {
    const slots = useSyncExternalStore(projectStatsService.subscribeSeriesColors, projectStatsService.getSeriesColorSlots);
    const palettesKey = JSON.stringify(palettes);

    return useMemo(() => resolveSeriesColors(slots, JSON.parse(palettesKey) as StatsSeriesPalettes), [slots, palettesKey]);
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
export function StatsBarChart({ ariaLabel = 'Stats bar chart', mode = 'single', rows, shortTokenCounts = false }: StatsBarChartProps) {
    const theme = useTheme();
    const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
    const buckets = bucketRows(rows);
    const maximum = maximumMagnitude(buckets, mode);
    const hasNegativeDomain = mode !== 'stacked' && mode !== 'groupedStacked' && rows.some(({ value }) => value < 0);
    const palettes: StatsSeriesPalettes = { groups: theme.palette.custom.chartPalettes, neutral: theme.palette.custom.chartPalette };
    const localColors = useSeriesColors(palettes);
    const legend = [...new Map(rows.flatMap((row) => (
        row.seriesIdentity && row.seriesLabel
            ? [[seriesColorKey(row), { identity: row.seriesIdentity, label: row.seriesLabel }] as const]
            : []
    ))).entries()];
    const baselinePercentage = hasNegativeDomain ? 50 : 0;
    const domainPercentage = hasNegativeDomain ? 50 : 100;

    return (
        <Stack sx={{ height: { xs: 'auto', md: '100%' }, minHeight: { xs: 0, md: MINIMUM_CHART_HEIGHT + 72 }, minWidth: 0 }}>
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
                    {legend.map(([colorKeyValue, { identity, label }]) => (
                        <Stack direction="row" key={colorKeyValue} spacing={0.75} sx={{ alignItems: 'center' }}>
                            <Box
                                data-series-color-key={colorKeyValue}
                                data-series-identity={identity}
                                data-testid="stats-legend-swatch"
                                sx={{
                                    bgcolor: localColors.get(colorKeyValue),
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
            {isSmallScreen ? (
                <StatsHorizontalBarChart
                    ariaLabel={ariaLabel}
                    buckets={buckets}
                    colors={localColors}
                    hasNegativeDomain={hasNegativeDomain}
                    maximum={maximum}
                    mode={mode}
                    shortTokenCounts={shortTokenCounts}
                />
            ) : <Box
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
                                        const totalLabel = stackTotalLabel(bar.rows[0].unit, total, shortTokenCounts);
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
                                                        {totalLabel}
                                                    </Typography>
                                                ) : null}
                                                {bar.rows.map((row, index) => {
                                                    const magnitude = scaledPosition(row.value, maximum, domainPercentage);
                                                    const priorMagnitude = stacked
                                                        ? scaledPosition(bar.rows.slice(0, index).reduce((totalValue, segment) => (
                                                            totalValue + Math.max(segment.value, 0)
                                                        ), 0), maximum, domainPercentage)
                                                        : { labelOffset: 0, percentage: 0 };
                                                    const identity = effectiveSeriesIdentity(row);
                                                    const color = localColors.get(seriesColorKey(row));
                                                    const isNegative = row.value < 0;
                                                    const barLabel = formattedValue(row, shortTokenCounts);
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
                                                                        data-series-identity={identity}
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
            </Box>}
        </Stack>
    );
}
