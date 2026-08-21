import type { StatsChartRole, StatsChartRow, StatsGranularity, StatsUnit } from './project_stats_types';
import type { StatsBucketContext } from './stats_time_buckets';

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
    const tooltip = `${context.localLabel}; UTC ${context.interval}; 0 ${unit}`;

    return {
        actionId: null,
        actionType: null,
        accessibleLabel: tooltip,
        agent: null,
        available: true,
        chartRole,
        displayLabel: context.displayLabel,
        grouping: granularity,
        identity: context.start,
        denominator: null,
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
    const tooltip = `${context.localLabel}; UTC ${context.interval}; ${unavailableLabel} unavailable`;

    return { ...row, accessibleLabel: tooltip, available: false, tooltip };
}
