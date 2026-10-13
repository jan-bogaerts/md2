import { Box, Stack, Tooltip, Typography } from '@mui/material';
import { barsForBucket, barTotal, type BucketRows, type StatsBarMode } from './stats_bar_groups';
import { seriesColorKey } from '../../services/stats/stats_series_slots';
import { formattedValue, stackTotalLabel } from './stats_value_format';

const BAR_HEIGHT = 18;

interface StatsHorizontalBarChartProps {
    ariaLabel: string;
    buckets: BucketRows[];
    colors: ReadonlyMap<string, string>;
    hasNegativeDomain: boolean;
    maximum: number;
    mode: StatsBarMode;
    shortTokenCounts: boolean;
}

function widthPercentage(value: number, maximum: number, domainPercentage: number) {
    return maximum === 0 ? 0 : Math.abs(value) / maximum * domainPercentage;
}

function axisPosition(value: number, maximum: number, hasNegativeDomain: boolean) {
    const baselinePercentage = hasNegativeDomain ? 50 : 0;
    const domainPercentage = hasNegativeDomain ? 50 : 100;

    return `${baselinePercentage + Math.sign(value) * widthPercentage(value, maximum, domainPercentage)}%`;
}

function trackPosition(value: number, maximum: number, hasNegativeDomain: boolean) {
    const domainPercentage = hasNegativeDomain ? 50 : 100;
    const baselinePercentage = hasNegativeDomain ? 50 : 0;
    const width = widthPercentage(value, maximum, domainPercentage);

    return { left: value < 0 ? axisPosition(value, maximum, hasNegativeDomain) : `${baselinePercentage}%`, width: `${width}%` };
}

/** Narrow chart: buckets follow page order, with values extending across each row. */
export function StatsHorizontalBarChart(props: StatsHorizontalBarChartProps) {
    const { ariaLabel, buckets, colors, hasNegativeDomain, maximum, mode, shortTokenCounts } = props;
    const stacked = mode === 'stacked' || mode === 'groupedStacked';
    const baselinePercentage = hasNegativeDomain ? 50 : 0;

    return (
        <Stack aria-label={ariaLabel} data-chart-mode={mode} data-chart-orientation="horizontal" role="list" spacing={2} sx={{ minWidth: 0, px: 1.5, py: 2, width: '100%' }}>
            {buckets.map((bucket) => (
                <Stack data-testid="stats-bucket" key={bucket.identity} spacing={1} sx={{ minWidth: 0, width: '100%' }}>
                    <Typography color="text.secondary" title={bucket.label} variant="caption">{bucket.label}</Typography>
                    {barsForBucket(bucket, mode).map((bar) => {
                        const total = barTotal(bar);

                        return (
                            <Stack data-stack-identity={bar.identity} key={bar.identity} spacing={0.5} sx={{ minWidth: 0, width: '100%' }}>
                                {bar.label ? <Typography color="text.secondary" title={bar.label} variant="caption">{bar.label}</Typography> : null}
                                {stacked && total > 0 ? (
                                    <Typography color="text.secondary" variant="caption">{stackTotalLabel(bar.rows[0].unit, total, shortTokenCounts)}</Typography>
                                ) : null}
                                {!stacked ? (
                                    <Typography color="text.secondary" title={formattedValue(bar.rows[0], shortTokenCounts)} variant="caption">
                                        {formattedValue(bar.rows[0], shortTokenCounts)}
                                    </Typography>
                                ) : null}
                                <Box data-testid="stats-chart-canvas" sx={{ height: BAR_HEIGHT, position: 'relative', width: '100%' }}>
                                    <Box aria-label="Zero baseline" sx={{ bgcolor: 'divider', bottom: 0, left: `${baselinePercentage}%`, position: 'absolute', top: 0, width: 1 }} />
                                    {bar.rows.map((row, index) => {
                                        const priorValue = stacked
                                            ? bar.rows.slice(0, index).reduce((sum, segment) => sum + Math.max(segment.value, 0), 0)
                                            : 0;
                                        const domainPercentage = hasNegativeDomain ? 50 : 100;
                                        const priorWidth = widthPercentage(priorValue, maximum, domainPercentage);
                                        const position = stacked
                                            ? { left: `${baselinePercentage + priorWidth}%`, width: `${widthPercentage(row.value, maximum, domainPercentage)}%` }
                                            : trackPosition(row.value, maximum, hasNegativeDomain);
                                        const deviation = row.deviation;
                                        const showDeviation = row.available && deviation !== null;
                                        const lower = showDeviation ? axisPosition(Math.max(row.value - deviation, 0), maximum, hasNegativeDomain) : '0%';
                                        const upper = showDeviation ? axisPosition(row.value + deviation, maximum, hasNegativeDomain) : '0%';
                                        const color = colors.get(seriesColorKey(row));
                                        const seriesIdentity = row.seriesIdentity ?? row.identity;

                                        return (
                                            <Box aria-label={row.accessibleLabel} key={`${row.identity}:${index}`} role="listitem" sx={{ inset: 0, pointerEvents: 'none', position: 'absolute' }}>
                                                {row.available && row.value !== 0 ? (
                                                    <Tooltip slotProps={{ tooltip: { sx: { whiteSpace: 'pre-line' } } }} title={row.tooltip}>
                                                        <Box
                                                            data-series-identity={seriesIdentity}
                                                            data-testid="stats-bar"
                                                            sx={{ bgcolor: color, height: '100%', left: position.left, pointerEvents: 'auto', position: 'absolute', width: position.width }}
                                                        />
                                                    </Tooltip>
                                                ) : null}
                                                {showDeviation ? (
                                                    <Box
                                                        data-testid="stats-deviation-whisker"
                                                        sx={{
                                                            borderColor: 'text.secondary', borderTop: 1, height: 0, left: lower,
                                                            pointerEvents: 'none', position: 'absolute', right: `calc(100% - ${upper})`, top: '50%',
                                                            '&::after, &::before': { borderColor: 'text.secondary', borderLeft: 1, content: '""', height: BAR_HEIGHT, position: 'absolute', top: -BAR_HEIGHT / 2 },
                                                            '&::after': { right: 0 }, '&::before': { left: 0 },
                                                        }}
                                                    />
                                                ) : null}
                                            </Box>
                                        );
                                    })}
                                </Box>
                            </Stack>
                        );
                    })}
                </Stack>
            ))}
        </Stack>
    );
}
