import type { StatsActionFact } from '../../../../shared/project_stats.mjs';
import { findAgentProfile, type AgentProfile } from '../../data/agent_profiles';
import type { UsageMetricsAccountRow, UsageMetricsTokenRow } from '../agents/project_usage_metrics_service';
import type {
    StatsAccountSeriesOption,
    StatsChartRole,
    StatsChartRow,
    StatsControls,
    StatsDatasetSource,
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
import {
    accessibleStatsTooltip,
    formatBucketRange,
    formatCount,
    formatDollars,
    formatTimestamp,
    formatWindow,
    statsTooltip,
    type StatsTooltipLine,
} from './stats_tooltip';
import { subscriptionCostPerPercentagePoint } from './stats_subscription_cost';

type RatioRole = 'tokensPerAccountUsage' | 'tokensPerDollar' | 'actionsPerAccountUsage';
type CostRole = 'costPerAgent' | 'costPerActionAverage';

interface TokenChartVariant {
    aggregation: 'average' | 'total';
    role: 'projectTokensAverage' | 'projectTokensTotal';
    valueLabel: string;
}

/** Both project-token charts read the same bucket totals, so no control has to choose between them. */
const TOKEN_VARIANTS: TokenChartVariant[] = [
    { aggregation: 'total', role: 'projectTokensTotal', valueLabel: 'Total project tokens' },
    { aggregation: 'average', role: 'projectTokensAverage', valueLabel: 'Average project tokens per action' },
];

const SUBSCRIPTION_SHARE_NOTE = 'Estimated from the limit window\'s share of a fixed 28-day subscription month, not a metered per-token price';

interface ComparisonIndexes {
    /** Account rows whose delta is absent or non-negative, keyed by bucket and series identity. */
    accountByBucketSeries: Map<string, UsageMetricsAccountRow[]>;
    actionsByBucket: Map<string, StatsActionFact[]>;
    agentProfiles: AgentProfile[];
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

function accountSeriesDescription(series: StatsAccountSeriesOption) {
    return `${series.provider} · Limit: ${series.limitId} · Window: ${series.windowId}`;
}

function accountSeriesWindowDescription(series: StatsAccountSeriesOption) {
    return `${accountSeriesDescription(series)} (${formatWindow(series.windowDurationMinutes)})`;
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
    const resetTimes = [...new Set(rows.map(({ resetsAt }) => resetsAt))].sort();
    const seriesLabel = accountSeriesLabel(series);
    const tooltipLines: StatsTooltipLine[] = [
        { label: null, value: formatBucketRange(context) },
        { label: 'Provider', value: accountSeriesWindowDescription(series) },
        {
            label: 'Used this period',
            value: available ? `${formatCount(value)}% of ${series.windowId} limit` : 'account usage unavailable',
        },
    ];
    if (resetTimes.length > 0) {
        const additionalResetCount = resetTimes.length - 1;
        const additionalResets = additionalResetCount > 0 ? ` (+${additionalResetCount} more)` : '';
        tooltipLines.push({ label: 'Limit resets', value: `${formatTimestamp(resetTimes[0])}${additionalResets}` });
    }
    const tooltip = statsTooltip(tooltipLines);

    return {
        ...emptyTimeRow(context, granularity, 'accountUsage', 'accountUsage', 'percent'),
        accessibleLabel: accessibleStatsTooltip(tooltip),
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
            return [unavailableTimeRow(context, granularity, 'accountUsage', 'accountUsage', 'percent', 'positive account usage')];
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
    return TOKEN_VARIANTS.flatMap(({ aggregation, role, valueLabel }) => contexts.flatMap((context) => {
        if (indexes.providers.length === 0) {
            return tokenTimeAvailable
                ? [emptyTimeRow(context, granularity, role, 'tokens', 'tokens')]
                : [unavailableTimeRow(context, granularity, role, 'tokens', 'tokens', 'project token usage')];
        }

        return indexes.providers.map((provider) => {
            const providerKey = bucketIdentityKey(context.start, provider);
            const rows = indexes.tokensByBucketProvider.get(providerKey) ?? [];
            const tokenTotal = rows.reduce((total, row) => total + row.totalTokens, 0);
            const actionCount = (indexes.agentActionsByBucketProvider.get(providerKey) ?? []).length;
            const value = aggregation === 'total' ? tokenTotal : actionCount === 0 ? 0 : tokenTotal / actionCount;
            const tooltip = statsTooltip([
                { label: null, value: formatBucketRange(context) },
                { label: 'Provider', value: provider },
                { label: valueLabel, value: formatCount(value) },
            ]);

            return {
                ...emptyTimeRow(context, granularity, role, 'tokens', 'tokens'),
                accessibleLabel: accessibleStatsTooltip(tooltip),
                aggregation,
                denominator: aggregation === 'average' ? actionCount : null,
                identity: provider,
                numerator: aggregation === 'average' ? tokenTotal : null,
                provider,
                seriesIdentity: provider,
                seriesLabel: provider,
                tooltip,
                value,
            };
        });
    }));
}

/**
 * One account series per provider: the longest reported limit window, ties broken by its
 * code-point identity, so a provider reporting several windows still has one deterministic rate.
 */
export function longestWindowSeriesByProvider(seriesOptions: StatsAccountSeriesOption[]) {
    const seriesByProvider = new Map<string, StatsAccountSeriesOption>();
    for (const series of seriesOptions) {
        const current = seriesByProvider.get(series.provider);
        const wins = !current
            || series.windowDurationMinutes > current.windowDurationMinutes
            || (series.windowDurationMinutes === current.windowDurationMinutes && series.identity < current.identity);
        if (wins) seriesByProvider.set(series.provider, series);
    }

    return seriesByProvider;
}

function unavailableCostRow(
    context: StatsBucketContext,
    granularity: StatsShortGranularity,
    role: CostRole,
    series: StatsAccountSeriesOption,
    unavailableLabel: string,
): StatsChartRow {
    return {
        ...unavailableTimeRow(context, granularity, role, role, 'dollars', unavailableLabel),
        identity: series.provider,
        limitId: series.limitId,
        provider: series.provider,
        seriesIdentity: series.provider,
        seriesLabel: series.provider,
        windowId: series.windowId,
    };
}

function costProviderRow(
    context: StatsBucketContext,
    granularity: StatsShortGranularity,
    role: CostRole,
    series: StatsAccountSeriesOption,
    indexes: ComparisonIndexes,
): StatsChartRow {
    const pointsUsed = (indexes.positiveAccountByBucketSeries.get(bucketIdentityKey(context.start, series.identity)) ?? [])
        .reduce((total, row) => total + row.usedPercentDelta!, 0);
    const monthlySubscriptionCostUsd = findAgentProfile(indexes.agentProfiles, series.provider)?.monthlySubscriptionCostUsd;
    if (pointsUsed <= 0) {
        return unavailableCostRow(context, granularity, role, series, `positive account usage for ${series.provider}`);
    }
    if (monthlySubscriptionCostUsd === undefined) {
        return unavailableCostRow(context, granularity, role, series, `monthly subscription cost for ${series.provider}`);
    }
    const actionCount = (indexes.agentActionsByBucketProvider.get(bucketIdentityKey(context.start, series.provider)) ?? []).length;
    if (role === 'costPerActionAverage' && actionCount === 0) {
        return unavailableCostRow(context, granularity, role, series, `completed ${series.provider} actions`);
    }
    const costPerPercentagePoint = subscriptionCostPerPercentagePoint(
        monthlySubscriptionCostUsd,
        series.windowDurationMinutes,
    );
    const estimatedCost = pointsUsed * costPerPercentagePoint;
    const value = role === 'costPerAgent' ? estimatedCost : estimatedCost / actionCount;
    const tooltipLines: StatsTooltipLine[] = [
        { label: null, value: formatBucketRange(context) },
        { label: 'Provider', value: accountSeriesWindowDescription(series) },
        { label: role === 'costPerAgent' ? 'Estimated cost' : 'Average cost per action', value: formatDollars(value) },
        { label: null, value: SUBSCRIPTION_SHARE_NOTE },
        {
            label: 'Account limit used',
            value: `${formatCount(pointsUsed)}% \u00b7 Monthly subscription: ${formatDollars(monthlySubscriptionCostUsd)}`,
        },
    ];
    if (role === 'costPerActionAverage') {
        tooltipLines.push({ label: 'Completed actions', value: formatCount(actionCount) });
    }
    const tooltip = statsTooltip(tooltipLines);

    return {
        ...emptyTimeRow(context, granularity, role, role, 'dollars'),
        accessibleLabel: accessibleStatsTooltip(tooltip),
        // Both inputs stay in the CSV: the account points consumed, and the rate or action count they meet.
        denominator: role === 'costPerAgent' ? monthlySubscriptionCostUsd : pointsUsed,
        identity: series.provider,
        limitId: series.limitId,
        numerator: role === 'costPerAgent' ? pointsUsed : actionCount,
        provider: series.provider,
        seriesIdentity: series.provider,
        seriesLabel: series.provider,
        tooltip,
        value,
        windowId: series.windowId,
    };
}

function costRows(
    contexts: StatsBucketContext[],
    granularity: StatsShortGranularity,
    role: CostRole,
    seriesOptions: StatsAccountSeriesOption[],
    indexes: ComparisonIndexes,
): StatsChartRow[] {
    const seriesByProvider = longestWindowSeriesByProvider(seriesOptions);
    const providers = [...seriesByProvider.keys()].sort();

    return contexts.flatMap((context) => {
        if (providers.length === 0) {
            return [unavailableTimeRow(context, granularity, role, role, 'dollars', 'account usage priced by a subscription')];
        }

        return providers.map((provider) => costProviderRow(context, granularity, role, seriesByProvider.get(provider)!, indexes));
    });
}

function ratioSeriesRow(
    context: StatsBucketContext,
    granularity: StatsShortGranularity,
    role: RatioRole,
    series: StatsAccountSeriesOption,
    indexes: ComparisonIndexes,
): StatsChartRow[] {
    const isActionRatio = role === 'actionsPerAccountUsage';
    const unit: StatsUnit = role === 'tokensPerDollar'
        ? 'tokensPerDollar'
        : isActionRatio ? 'actionsPerPercentagePoint' : 'tokensPerPercentagePoint';
    const seriesKey = bucketIdentityKey(context.start, series.identity);
    const denominator = (indexes.positiveAccountByBucketSeries.get(seriesKey) ?? [])
        .reduce((total, row) => total + row.usedPercentDelta!, 0);
    if (denominator <= 0) return [];
    const providerKey = bucketIdentityKey(context.start, series.provider);
    const numerator = isActionRatio
        ? (indexes.agentActionsByBucketProvider.get(providerKey) ?? []).length
        : (indexes.tokensByBucketProvider.get(providerKey) ?? []).reduce((total, row) => total + row.totalTokens, 0);
    const seriesLabel = accountSeriesLabel(series);
    const profile = findAgentProfile(indexes.agentProfiles, series.provider);
    const monthlySubscriptionCostUsd = profile?.monthlySubscriptionCostUsd;
    if (role === 'tokensPerDollar' && monthlySubscriptionCostUsd === undefined) {
        const tooltip = statsTooltip([
            { label: null, value: formatBucketRange(context) },
            { label: 'Provider', value: accountSeriesDescription(series) },
            { label: null, value: 'Tokens per dollar unavailable: monthly subscription cost is not configured' },
        ]);

        return [{
            ...emptyTimeRow(context, granularity, role, role, unit),
            accessibleLabel: accessibleStatsTooltip(tooltip),
            available: false,
            denominator,
            identity: series.identity,
            limitId: series.limitId,
            numerator,
            provider: series.provider,
            seriesIdentity: series.identity,
            seriesLabel,
            tooltip,
            value: 0,
            windowId: series.windowId,
        }];
    }
    const ratio = numerator / denominator;
    const costPerPercentagePoint = role === 'tokensPerDollar'
        ? subscriptionCostPerPercentagePoint(monthlySubscriptionCostUsd!, series.windowDurationMinutes)
        : null;
    const value = costPerPercentagePoint === null ? ratio : ratio / costPerPercentagePoint;
    const ratioLabel = isActionRatio
        ? 'completed actions per 1% of account limit used'
        : role === 'tokensPerDollar' ? 'project tokens per dollar' : 'project tokens per 1% of account limit used';
    const tooltip = statsTooltip([
        { label: null, value: formatBucketRange(context) },
        { label: 'Provider', value: accountSeriesDescription(series) },
        { label: null, value: `${formatCount(value)} ${ratioLabel}` },
        {
            label: isActionRatio ? 'Completed actions' : 'Project tokens',
            value: `${formatCount(numerator)} · Account limit used: ${formatCount(denominator)}%`,
        },
    ]);

    return [{
        ...emptyTimeRow(context, granularity, role, role, unit),
        accessibleLabel: accessibleStatsTooltip(tooltip),
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
    const unit: StatsUnit = role === 'tokensPerDollar'
        ? 'tokensPerDollar'
        : role === 'actionsPerAccountUsage' ? 'actionsPerPercentagePoint' : 'tokensPerPercentagePoint';

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
        const tooltip = statsTooltip([
            { label: null, value: formatBucketRange(context) },
            { label: 'Group', value: count.stackLabel },
            { label: 'Action', value: count.label },
            { label: 'Completed actions', value: formatCount(count.value) },
        ]);

        return {
            ...emptyTimeRow(context, granularity, chartRole, 'actions', 'actions'),
            actionId: count.actionId,
            actionType: count.actionType,
            accessibleLabel: accessibleStatsTooltip(tooltip),
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
    agentProfiles: AgentProfile[],
    tokenRows: UsageMetricsTokenRow[],
    actions: StatsActionFact[],
    granularity: StatsShortGranularity,
): ComparisonIndexes {
    const recordedAt = (row: UsageMetricsAccountRow | UsageMetricsTokenRow) => row.recordedAt;
    const completedAt = (action: StatsActionFact) => action.completedAt;

    return {
        accountByBucketSeries: indexByBucketAndIdentity(accountRows.filter(hasUsableDelta), granularity, recordedAt, accountSeriesIdentity),
        actionsByBucket: indexByBucket(actions, granularity, completedAt),
        agentProfiles,
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
export function usageComparisonRows(source: StatsDatasetSource, controls: StatsControls, options: StatsOptions): StatsChartRow[] {
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
    const indexes = buildComparisonIndexes(accountRows, source.agentProfiles, tokenRows, actions, granularity);

    return [
        ...comparisonAccountRows(contexts, granularity, seriesOptions, indexes),
        ...projectTokenRows(contexts, granularity, source.tokenTimeAvailable, indexes),
        ...ratioRows(contexts, granularity, 'tokensPerAccountUsage', seriesOptions, indexes),
        ...ratioRows(contexts, granularity, 'tokensPerDollar', seriesOptions, indexes),
        ...costRows(contexts, granularity, 'costPerAgent', seriesOptions, indexes),
        ...costRows(contexts, granularity, 'costPerActionAverage', seriesOptions, indexes),
        ...ratioRows(contexts, granularity, 'actionsPerAccountUsage', seriesOptions, indexes),
        ...contexts.flatMap((context) => activityCountRows(context, granularity, indexes.actionsByBucket.get(context.start) ?? [])),
    ];
}
