import type { StatsActionFact } from '../../../../shared/project_stats.mjs';
import type { UsageMetricsAccountRow, UsageMetricsTokenRow } from '../agents/project_usage_metrics_service';
import type {
    LoadedStatsSource,
    StatsAccountSeriesOption,
    StatsChartRole,
    StatsChartRow,
    StatsControls,
    StatsOptions,
    StatsShortGranularity,
    StatsUnit,
} from './project_stats_types';
import { emptyTimeRow, unavailableTimeRow } from './stats_chart_rows';
import { accountSeriesIdentity, accountSeriesLabel, actionLabel, IDENTITY_SEPARATOR } from './stats_identities';
import {
    bucketContexts,
    bucketDomain,
    bucketIdentityKey,
    inRange,
    indexByBucket,
    indexByBucketAndIdentity,
    type StatsBucketContext,
} from './stats_time_buckets';

type RatioRole = 'tokensPerAccountUsage' | 'actionsPerAccountUsage';

interface ComparisonIndexes {
    /** Account rows whose delta is absent or non-negative, keyed by bucket and series identity. */
    accountByBucketSeries: Map<string, UsageMetricsAccountRow[]>;
    actionsByBucket: Map<string, StatsActionFact[]>;
    agentActionsByBucketProvider: Map<string, StatsActionFact[]>;
    /** Account rows carrying a non-negative delta, keyed by bucket and series identity. */
    positiveAccountByBucketSeries: Map<string, UsageMetricsAccountRow[]>;
    providers: string[];
    tokensByBucketProvider: Map<string, UsageMetricsTokenRow[]>;
}

interface ActivityCount {
    actionId: string;
    actionType: 'agent' | 'command';
    agent: string | null;
    label: string;
    stackIdentity: string;
    stackLabel: string;
    value: number;
}

function hasUsableDelta(row: UsageMetricsAccountRow) {
    return row.usedPercentDelta === null || row.usedPercentDelta >= 0;
}

function hasPositiveDelta(row: UsageMetricsAccountRow) {
    return row.usedPercentDelta !== null && row.usedPercentDelta >= 0;
}

/** Series whose in-range non-negative deltas sum above zero; summed once instead of per series. */
function visibleAccountSeries(accountRows: UsageMetricsAccountRow[], options: StatsOptions) {
    const totalsByIdentity = new Map<string, number>();
    for (const row of accountRows.filter(hasPositiveDelta)) {
        const identity = accountSeriesIdentity(row);
        totalsByIdentity.set(identity, (totalsByIdentity.get(identity) ?? 0) + row.usedPercentDelta!);
    }

    return options.accountSeries.filter(({ identity }) => (totalsByIdentity.get(identity) ?? 0) > 0);
}

function accountSeriesRow(
    context: StatsBucketContext,
    granularity: StatsShortGranularity,
    series: StatsAccountSeriesOption,
    rows: UsageMetricsAccountRow[],
): StatsChartRow {
    const available = rows.some(({ usedPercentDelta }) => usedPercentDelta !== null);
    const value = rows.reduce((total, row) => total + (row.usedPercentDelta ?? 0), 0);
    const resetTimes = [...new Set(rows.map(({ resetsAt }) => resetsAt))].join(', ') || 'unavailable';
    const seriesLabel = accountSeriesLabel(series);
    const displayedValue = available ? `${value} percentage points` : 'percentage-point delta unavailable';
    const tooltip = `${context.localLabel}; UTC ${context.interval}; ${seriesLabel}; ${displayedValue}; window ${series.windowDurationMinutes} minutes; reset ${resetTimes}`;

    return {
        ...emptyTimeRow(context, granularity, 'accountUsage', 'accountUsage', 'percentagePoints'),
        accessibleLabel: tooltip,
        available,
        identity: series.identity,
        limitId: series.limitId,
        provider: series.provider,
        seriesIdentity: series.identity,
        seriesLabel,
        tooltip,
        value,
        windowId: series.windowId,
    };
}

function comparisonAccountRows(
    contexts: StatsBucketContext[],
    granularity: StatsShortGranularity,
    seriesOptions: StatsAccountSeriesOption[],
    indexes: ComparisonIndexes,
): StatsChartRow[] {
    return contexts.flatMap((context) => {
        if (seriesOptions.length === 0) {
            return [unavailableTimeRow(context, granularity, 'accountUsage', 'accountUsage', 'percentagePoints', 'positive account usage')];
        }

        return seriesOptions.map((series) => accountSeriesRow(
            context,
            granularity,
            series,
            indexes.accountByBucketSeries.get(bucketIdentityKey(context.start, series.identity)) ?? [],
        ));
    });
}

function projectTokenRows(
    contexts: StatsBucketContext[],
    granularity: StatsShortGranularity,
    tokenTimeAvailable: boolean,
    indexes: ComparisonIndexes,
): StatsChartRow[] {
    return contexts.flatMap((context) => {
        if (indexes.providers.length === 0) {
            return tokenTimeAvailable
                ? [emptyTimeRow(context, granularity, 'projectTokens', 'tokens', 'tokens')]
                : [unavailableTimeRow(context, granularity, 'projectTokens', 'tokens', 'tokens', 'project token usage')];
        }

        return indexes.providers.map((provider) => {
            const rows = indexes.tokensByBucketProvider.get(bucketIdentityKey(context.start, provider)) ?? [];
            const value = rows.reduce((total, row) => total + row.totalTokens, 0);
            const tooltip = `${context.localLabel}; UTC ${context.interval}; ${provider}: ${value} tokens`;

            return {
                ...emptyTimeRow(context, granularity, 'projectTokens', 'tokens', 'tokens'),
                accessibleLabel: tooltip,
                identity: provider,
                provider,
                seriesIdentity: provider,
                seriesLabel: provider,
                tooltip,
                value,
            };
        });
    });
}

function ratioSeriesRow(
    context: StatsBucketContext,
    granularity: StatsShortGranularity,
    role: RatioRole,
    series: StatsAccountSeriesOption,
    indexes: ComparisonIndexes,
): StatsChartRow[] {
    const isTokenRatio = role === 'tokensPerAccountUsage';
    const unit: StatsUnit = isTokenRatio ? 'tokensPerPercentagePoint' : 'actionsPerPercentagePoint';
    const seriesKey = bucketIdentityKey(context.start, series.identity);
    const denominator = (indexes.positiveAccountByBucketSeries.get(seriesKey) ?? [])
        .reduce((total, row) => total + row.usedPercentDelta!, 0);
    if (denominator <= 0) return [];
    const providerKey = bucketIdentityKey(context.start, series.provider);
    const numerator = isTokenRatio
        ? (indexes.tokensByBucketProvider.get(providerKey) ?? []).reduce((total, row) => total + row.totalTokens, 0)
        : (indexes.agentActionsByBucketProvider.get(providerKey) ?? []).length;
    const value = numerator / denominator;
    const seriesLabel = accountSeriesLabel(series);
    const numeratorLabel = isTokenRatio ? `${numerator} project tokens` : `${numerator} completed ${series.provider} actions`;
    const tooltip = `${context.localLabel}; UTC ${context.interval}; ${seriesLabel}; ${numeratorLabel}; ${denominator} account percentage points; ratio ${value}`;

    return [{
        ...emptyTimeRow(context, granularity, role, role, unit),
        accessibleLabel: tooltip,
        denominator,
        identity: series.identity,
        limitId: series.limitId,
        numerator,
        provider: series.provider,
        seriesIdentity: series.identity,
        seriesLabel,
        tooltip,
        value,
        windowId: series.windowId,
    }];
}

function ratioRows(
    contexts: StatsBucketContext[],
    granularity: StatsShortGranularity,
    role: RatioRole,
    seriesOptions: StatsAccountSeriesOption[],
    indexes: ComparisonIndexes,
): StatsChartRow[] {
    const unit: StatsUnit = role === 'tokensPerAccountUsage' ? 'tokensPerPercentagePoint' : 'actionsPerPercentagePoint';

    return contexts.flatMap((context) => {
        const rows = seriesOptions.flatMap((series) => ratioSeriesRow(context, granularity, role, series, indexes));

        return rows.length > 0
            ? rows
            : [unavailableTimeRow(context, granularity, role, role, unit, 'positive account usage denominator')];
    });
}

function activityCountRows(
    context: StatsBucketContext,
    granularity: StatsShortGranularity,
    records: StatsActionFact[],
): StatsChartRow[] {
    const chartRole: StatsChartRole = 'activity';
    if (records.length === 0) return [emptyTimeRow(context, granularity, chartRole, 'actions', 'actions')];
    const counts = new Map<string, ActivityCount>();
    for (const record of records) {
        const stackIdentity = record.actionType === 'command' ? 'command' : `agent:${record.agent ?? 'unknown'}`;
        const stackLabel = record.actionType === 'command' ? 'Command' : record.agent ?? 'Unknown agent';
        const identity = `${stackIdentity}${IDENTITY_SEPARATOR}${record.actionId}`;
        const current = counts.get(identity);
        counts.set(identity, {
            actionId: record.actionId,
            actionType: record.actionType,
            agent: record.agent,
            label: actionLabel(record.actionId, record.actionLabel),
            stackIdentity,
            stackLabel,
            value: (current?.value ?? 0) + 1,
        });
    }

    return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([identity, count]) => {
        const tooltip = `${context.localLabel}; UTC ${context.interval}; ${count.stackLabel}; ${count.label}: ${count.value} completed actions`;

        return {
            ...emptyTimeRow(context, granularity, chartRole, 'actions', 'actions'),
            actionId: count.actionId,
            actionType: count.actionType,
            accessibleLabel: tooltip,
            agent: count.agent,
            identity,
            seriesIdentity: count.actionId,
            seriesLabel: count.label,
            stackIdentity: count.stackIdentity,
            stackLabel: count.stackLabel,
            tooltip,
            value: count.value,
        };
    });
}

function buildComparisonIndexes(
    accountRows: UsageMetricsAccountRow[],
    tokenRows: UsageMetricsTokenRow[],
    actions: StatsActionFact[],
    granularity: StatsShortGranularity,
): ComparisonIndexes {
    const recordedAt = (row: UsageMetricsAccountRow | UsageMetricsTokenRow) => row.recordedAt;
    const completedAt = (action: StatsActionFact) => action.completedAt;

    return {
        accountByBucketSeries: indexByBucketAndIdentity(accountRows.filter(hasUsableDelta), granularity, recordedAt, accountSeriesIdentity),
        actionsByBucket: indexByBucket(actions, granularity, completedAt),
        agentActionsByBucketProvider: indexByBucketAndIdentity(
            actions.filter(({ actionType }) => actionType === 'agent'),
            granularity,
            completedAt,
            ({ agent }) => agent,
        ),
        positiveAccountByBucketSeries: indexByBucketAndIdentity(
            accountRows.filter(hasPositiveDelta),
            granularity,
            recordedAt,
            accountSeriesIdentity,
        ),
        providers: [...new Set(tokenRows.map(({ provider }) => provider))].sort(),
        tokensByBucketProvider: indexByBucketAndIdentity(tokenRows, granularity, recordedAt, ({ provider }) => provider),
    };
}

/** Project work against account-wide consumption, aligned on one shared UTC bucket domain. */
export function usageComparisonRows(source: LoadedStatsSource, controls: StatsControls, options: StatsOptions): StatsChartRow[] {
    const granularity = controls.usageGranularity;
    const accountRows = source.accountRows.filter(({ recordedAt }) => inRange(recordedAt, controls));
    const tokenRows = source.tokenRows.filter(({ recordedAt }) => inRange(recordedAt, controls));
    const actions = source.stats.actions.filter(({ completedAt }) => inRange(completedAt, controls));
    const seriesOptions = visibleAccountSeries(accountRows, options);
    const visibleSeriesIdentities = new Set(seriesOptions.map(({ identity }) => identity));
    const timestamps = [
        ...actions.map(({ completedAt }) => completedAt),
        ...tokenRows.map(({ recordedAt }) => recordedAt),
        ...accountRows.flatMap((row) => (
            visibleSeriesIdentities.has(accountSeriesIdentity(row)) && hasUsableDelta(row) ? [row.recordedAt] : []
        )),
    ];
    const contexts = bucketContexts(bucketDomain(timestamps, granularity, controls), granularity);
    const indexes = buildComparisonIndexes(accountRows, tokenRows, actions, granularity);

    return [
        ...comparisonAccountRows(contexts, granularity, seriesOptions, indexes),
        ...projectTokenRows(contexts, granularity, source.tokenTimeAvailable, indexes),
        ...ratioRows(contexts, granularity, 'tokensPerAccountUsage', seriesOptions, indexes),
        ...ratioRows(contexts, granularity, 'actionsPerAccountUsage', seriesOptions, indexes),
        ...contexts.flatMap((context) => activityCountRows(context, granularity, indexes.actionsByBucket.get(context.start) ?? [])),
    ];
}
