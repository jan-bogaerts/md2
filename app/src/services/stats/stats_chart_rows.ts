import type { StatsChartRole, StatsChartRow, StatsGranularity, StatsUnit } from './project_stats_types';
import type { StatsBucketContext } from './stats_time_buckets';
import { accessibleStatsTooltip, formatBucketRange, statsTooltip } from './stats_tooltip';

/**
 * Zero-filled row for one UTC bucket, carrying the tooltip and accessible label so charts never
 * compose presentation text themselves.
 */
export function emptyTimeRow(
    context: StatsBucketContext,
    granularity: StatsGranularity,
    chartRole: StatsChartRole,
    metric: string,
    unit: StatsUnit,
): StatsChartRow {
    const tooltip = statsTooltip([
        { label: null, value: formatBucketRange(context) },
        { label: 'Value', value: `0 ${unit}` },
    ]);

    return {
        actionId: null,
        actionType: null,
        accessibleLabel: accessibleStatsTooltip(tooltip),
        aggregation: null,
        agent: null,
        available: true,
        chartRole,
        displayLabel: context.displayLabel,
        grouping: granularity,
        identity: context.start,
        denominator: null,
        deviation: null,
        limitId: null,
        metric,
        numerator: null,
        provider: null,
        sampleCount: null,
        seriesIdentity: null,
        seriesLabel: null,
        stackIdentity: null,
        stackLabel: null,
        statusCounts: null,
        tooltip,
        unit,
        utcBucketEnd: context.end,
        utcBucketStart: context.start,
        value: 0,
        windowId: null,
    } satisfies StatsChartRow;
}

/** Numeric-zero row flagged unavailable so charts render a gap without losing the bucket. */
export function unavailableTimeRow(
    context: StatsBucketContext,
    granularity: StatsGranularity,
    chartRole: StatsChartRole,
    metric: string,
    unit: StatsUnit,
    unavailableLabel: string,
): StatsChartRow {
    const row = emptyTimeRow(context, granularity, chartRole, metric, unit);
    const tooltip = statsTooltip([
        { label: null, value: formatBucketRange(context) },
        { label: 'Unavailable', value: unavailableLabel },
    ]);

    return { ...row, accessibleLabel: accessibleStatsTooltip(tooltip), available: false, tooltip };
}
