import type { StatsActionFact } from '../../../../shared/project_stats.mjs';
import type { UsageMetricsTokenRow } from '../agents/project_usage_metrics_service';
import type { StatsChartRow, StatsControls, StatsDatasetSource, StatsGranularity } from './project_stats_types';
import { emptyTimeRow } from './stats_chart_rows';
import { actionLabel } from './stats_identities';
import { bucketContexts, bucketDomain, inRange, indexByBucket, type StatsBucketContext } from './stats_time_buckets';
import { accessibleStatsTooltip, formatBucketRange, formatCount, statsTooltip } from './stats_tooltip';

interface ActionCount {
    label: string;
    value: number;
}

function actionCountRows(
    context: StatsBucketContext,
    granularity: StatsGranularity,
    records: StatsActionFact[],
): StatsChartRow[] {
    if (records.length === 0) return [emptyTimeRow(context, granularity, 'primary', 'actions', 'actions')];
    const counts = new Map<string, ActionCount>();
    for (const record of records) {
        const current = counts.get(record.actionId);
        counts.set(record.actionId, { label: actionLabel(record.actionId, record.actionLabel), value: (current?.value ?? 0) + 1 });
    }
    const total = records.length;

    return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([identity, count]) => {
        const tooltip = statsTooltip([
            { label: null, value: formatBucketRange(context) },
            { label: 'Completed actions', value: formatCount(total) },
            { label: count.label, value: formatCount(count.value) },
        ]);

        return {
            ...emptyTimeRow(context, granularity, 'primary', 'actions', 'actions'),
            actionId: identity,
            accessibleLabel: accessibleStatsTooltip(tooltip),
            identity,
            seriesIdentity: identity,
            seriesLabel: count.label,
            stackIdentity: identity,
            tooltip,
            value: count.value,
        } satisfies StatsChartRow;
    });
}

function distinctCardRow(context: StatsBucketContext, granularity: StatsGranularity, records: StatsActionFact[]): StatsChartRow {
    const count = new Set(records.flatMap(({ cardInternalId }) => cardInternalId ? [cardInternalId] : [])).size;
    const tooltip = statsTooltip([
        { label: null, value: formatBucketRange(context) },
        { label: 'Distinct cards', value: formatCount(count) },
    ]);

    return {
        ...emptyTimeRow(context, granularity, 'primary', 'cards', 'cards'),
        accessibleLabel: accessibleStatsTooltip(tooltip),
        tooltip,
        value: count,
    };
}

function tokenTotalRow(context: StatsBucketContext, granularity: StatsGranularity, rows: UsageMetricsTokenRow[]): StatsChartRow {
    const value = rows.reduce((total, row) => total + row.totalTokens, 0);
    const tooltip = statsTooltip([
        { label: null, value: formatBucketRange(context) },
        { label: 'Project tokens', value: formatCount(value) },
    ]);

    return {
        ...emptyTimeRow(context, granularity, 'primary', 'tokens', 'tokens'),
        accessibleLabel: accessibleStatsTooltip(tooltip),
        tooltip,
        value,
    };
}

/** Zero-filled activity per UTC bucket, counted from a single bucket index instead of a scan per bucket. */
export function activityRows(source: StatsDatasetSource, controls: StatsControls, granularity: StatsGranularity): StatsChartRow[] {
    const metric = controls.activityMetric;
    const actionRecords = source.stats.actions.filter(({ completedAt }) => inRange(completedAt, controls));
    const tokenRows = source.tokenRows.filter(({ recordedAt }) => inRange(recordedAt, controls));
    const timestamps = metric === 'tokens'
        ? tokenRows.map(({ recordedAt }) => recordedAt)
        : actionRecords.map(({ completedAt }) => completedAt);
    const contexts = bucketContexts(bucketDomain(timestamps, granularity, controls), granularity);
    if (metric === 'tokens') {
        const tokensByBucket = indexByBucket(tokenRows, granularity, ({ recordedAt }) => recordedAt);

        return contexts.map((context) => tokenTotalRow(context, granularity, tokensByBucket.get(context.start) ?? []));
    }
    const actionsByBucket = indexByBucket(actionRecords, granularity, ({ completedAt }) => completedAt);
    if (metric === 'cards') {
        return contexts.map((context) => distinctCardRow(context, granularity, actionsByBucket.get(context.start) ?? []));
    }

    return contexts.flatMap((context) => actionCountRows(context, granularity, actionsByBucket.get(context.start) ?? []));
}
