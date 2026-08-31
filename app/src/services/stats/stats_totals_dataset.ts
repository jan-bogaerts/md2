import type { StatsConversationFact } from '../../../../shared/project_stats.mjs';
import { findAgentProfile } from '../../data/agent_profiles';
import {
    TERMINAL_CONVERSATION_STATUSES,
    type StatsAccountSeriesOption,
    type StatsChartRow,
    type StatsControls,
    type StatsDatasetSource,
    type StatsUnit,
} from './project_stats_types';
import { accountSeriesIdentity, actionLabel, cardDisplay } from './stats_identities';
import { inRange } from './stats_time_buckets';
import { accessibleStatsTooltip, formatCount, formatDollars, formatDurationHms, statsTooltip, type StatsTooltipLine } from './stats_tooltip';
import { longestWindowSeriesByProvider } from './stats_usage_comparison_dataset';
import { subscriptionCostPerPercentagePoint } from './stats_subscription_cost';

const MIXED_AGENT_IDENTITY = 'mixed';
const UNKNOWN_AGENT_LABEL = 'Unknown agent';
const NO_ACCOUNT_SERIES_REASON = 'matching account series is unavailable';

interface TotalEntry {
    label: string;
    title: string;
    value: number;
}

interface ConversationGroup {
    conversations: StatsConversationFact[];
    label: string;
    title: string;
}

interface ProviderRate {
    available: boolean;
    denominator: number;
    limitId: string;
    numerator: number;
    reason: string | null;
    tokensPerDollar: number;
    windowId: string;
}

interface GroupCost {
    available: boolean;
    rate: ProviderRate | null;
    /** The one agent behind this bar, or null when its runs mixed agents. */
    singleAgent: string | null;
    unpricedByReason: Map<string, number>;
    value: number;
}

function isCountedConversation(conversation: StatsConversationFact, controls: StatsControls) {
    if (controls.totalsMetric === 'duration') {
        return TERMINAL_CONVERSATION_STATUSES.has(conversation.status)
            && conversation.completedAt !== null
            && inRange(conversation.completedAt, controls);
    }
    if (!controls.startUtc && !controls.endUtc) return true;

    return conversation.completedAt !== null && inRange(conversation.completedAt, controls);
}

function formatTotalsValue(value: number, unit: StatsUnit) {
    if (unit === 'milliseconds') return formatDurationHms(value);
    if (unit === 'dollars') return formatDollars(value);

    return formatCount(value);
}

/** Two tooltip lines by contract: what the bar is, then what it is worth; notes may follow. */
function totalRow(
    controls: StatsControls,
    identity: string,
    entry: TotalEntry,
    unit: StatsUnit,
    extraLines: StatsTooltipLine[] = [],
): StatsChartRow {
    const { label, title, value } = entry;
    const tooltip = statsTooltip([
        { label: null, value: title },
        { label: null, value: formatTotalsValue(value, unit) },
        ...extraLines,
    ]);

    return {
        actionId: controls.totalsGrouping === 'action' ? identity : null,
        actionType: null,
        accessibleLabel: accessibleStatsTooltip(tooltip),
        aggregation: 'sum',
        agent: null,
        available: true,
        chartRole: 'primary',
        displayLabel: label,
        grouping: controls.totalsGrouping,
        identity,
        denominator: null,
        deviation: null,
        limitId: null,
        metric: controls.totalsMetric,
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
        utcBucketEnd: null,
        utcBucketStart: null,
        value,
        windowId: null,
    };
}

function cardsIndex(source: StatsDatasetSource) {
    return new Map(source.cards.map((card) => [card.internalId, card]));
}

function displayFor(
    controls: StatsControls,
    conversation: StatsConversationFact,
    identity: string,
    cardsById: ReturnType<typeof cardsIndex>,
) {
    if (controls.totalsGrouping === 'card') return cardDisplay(identity, conversation.cardPath, cardsById);
    const label = actionLabel(identity, conversation.actionLabel);

    return { label, title: label };
}

function basicTotalsRows(source: StatsDatasetSource, controls: StatsControls, conversations: StatsConversationFact[]) {
    const cardsById = cardsIndex(source);
    const totals = new Map<string, TotalEntry>();
    for (const conversation of conversations) {
        const identity = controls.totalsGrouping === 'card' ? conversation.cardInternalId : conversation.actionId;
        if (!identity) continue;
        const display = displayFor(controls, conversation, identity, cardsById);
        const value = controls.totalsMetric === 'duration' ? conversation.elapsedMs : conversation.totalTokens;
        if (value === null) continue;
        const current = totals.get(identity);
        totals.set(identity, { label: display.label, title: display.title, value: (current?.value ?? 0) + value });
    }
    const unit: StatsUnit = controls.totalsMetric === 'duration' ? 'milliseconds' : 'tokens';

    return [...totals.entries()].map(([identity, entry]) => totalRow(controls, identity, entry, unit));
}

function conversationGroups(source: StatsDatasetSource, controls: StatsControls, conversations: StatsConversationFact[]) {
    const cardsById = cardsIndex(source);
    const groups = new Map<string, ConversationGroup>();
    for (const conversation of conversations) {
        const identity = controls.totalsGrouping === 'card' ? conversation.cardInternalId : conversation.actionId;
        if (!identity) continue;
        const display = displayFor(controls, conversation, identity, cardsById);
        const group = groups.get(identity) ?? { conversations: [], label: display.label, title: display.title };
        group.conversations.push(conversation);
        groups.set(identity, group);
    }

    return groups;
}

function accountSeries(source: StatsDatasetSource, controls: StatsControls) {
    const seriesByIdentity = new Map<string, StatsAccountSeriesOption>();
    for (const row of source.accountRows.filter(({ recordedAt }) => inRange(recordedAt, controls))) {
        const identity = accountSeriesIdentity(row);
        seriesByIdentity.set(identity, {
            identity,
            limitId: row.limitId,
            provider: row.provider,
            windowDurationMinutes: row.windowDurationMinutes,
            windowId: row.windowId,
        });
    }

    return [...seriesByIdentity.values()].sort((left, right) => left.identity.localeCompare(right.identity));
}

/** One subscription rate per agent, taken from that agent's longest reported limit window. */
function providerRates(source: StatsDatasetSource, controls: StatsControls) {
    const accountRows = source.accountRows.filter(({ recordedAt }) => inRange(recordedAt, controls));
    const tokenRows = source.tokenRows.filter(({ recordedAt }) => inRange(recordedAt, controls));
    const denominatorsBySeries = new Map<string, number>();
    for (const row of accountRows) {
        if (row.usedPercentDelta === null || row.usedPercentDelta <= 0) continue;
        const identity = accountSeriesIdentity(row);
        denominatorsBySeries.set(identity, (denominatorsBySeries.get(identity) ?? 0) + row.usedPercentDelta);
    }
    const activeSeries = accountSeries(source, controls)
        .filter(({ identity }) => (denominatorsBySeries.get(identity) ?? 0) > 0);
    const rates = new Map<string, ProviderRate>();
    for (const [provider, series] of longestWindowSeriesByProvider(activeSeries)) {
        const denominator = denominatorsBySeries.get(series.identity)!;
        const numerator = tokenRows
            .filter((row) => row.provider === provider)
            .reduce((total, row) => total + row.totalTokens, 0);
        const profile = findAgentProfile(source.agentProfiles, provider);
        const monthlySubscriptionCostUsd = profile?.monthlySubscriptionCostUsd;
        let reason: string | null = null;
        if (denominator <= 0) reason = 'positive account usage denominator is unavailable';
        else if (!profile) reason = 'matching agent profile is unavailable';
        else if (monthlySubscriptionCostUsd === undefined) reason = 'monthly subscription cost is not configured';
        else if (numerator <= 0) reason = 'positive provider token total is unavailable';
        const costPerPercentagePoint = reason
            ? 0
            : subscriptionCostPerPercentagePoint(monthlySubscriptionCostUsd!, series.windowDurationMinutes);
        const tokensPerDollar = reason ? 0 : (numerator / denominator) / costPerPercentagePoint;

        rates.set(provider, {
            available: reason === null,
            denominator,
            limitId: series.limitId,
            numerator,
            reason,
            tokensPerDollar,
            windowId: series.windowId,
        });
    }

    return rates;
}

/** Prices every run at its own agent's rate, so one card may mix agents without losing either. */
function groupCost(group: ConversationGroup, rates: Map<string, ProviderRate>): GroupCost {
    const agentIdentities = new Set<string>();
    const unpricedByReason = new Map<string, number>();
    let pricedRunCount = 0;
    let value = 0;
    for (const { agent, totalTokens } of group.conversations) {
        agentIdentities.add(agent ?? UNKNOWN_AGENT_LABEL);
        const rate = agent === null ? undefined : rates.get(agent);
        if (rate?.available) {
            value += totalTokens / rate.tokensPerDollar;
            pricedRunCount += 1;
            continue;
        }
        const reason = rate?.reason ?? NO_ACCOUNT_SERIES_REASON;
        unpricedByReason.set(reason, (unpricedByReason.get(reason) ?? 0) + 1);
    }
    const singleAgent = agentIdentities.size === 1 ? [...agentIdentities][0] : null;

    return {
        available: pricedRunCount > 0,
        rate: singleAgent ? rates.get(singleAgent) ?? null : null,
        singleAgent,
        unpricedByReason,
        value,
    };
}

function costRow(
    controls: StatsControls,
    groupIdentity: string,
    group: ConversationGroup,
    rates: Map<string, ProviderRate>,
): StatsChartRow {
    const { available, rate, singleAgent, unpricedByReason, value } = groupCost(group, rates);
    const extraLines: StatsTooltipLine[] = [{
        label: 'Priced with',
        value: singleAgent ? `${singleAgent} subscription rate` : 'Mixed agents',
    }];
    for (const [reason, count] of unpricedByReason) {
        extraLines.push({ label: null, value: `Skipped from estimate: ${count} run${count === 1 ? '' : 's'} (${reason})` });
    }
    const row = totalRow(controls, groupIdentity, { label: group.label, title: group.title, value }, 'dollars', extraLines);

    return {
        ...row,
        agent: singleAgent,
        available,
        denominator: rate?.denominator ?? null,
        limitId: rate?.limitId ?? null,
        numerator: rate?.numerator ?? null,
        provider: singleAgent,
        sampleCount: group.conversations.length,
        seriesIdentity: singleAgent ?? MIXED_AGENT_IDENTITY,
        seriesLabel: singleAgent ?? 'Mixed',
        windowId: rate?.windowId ?? null,
    };
}

function costTotalsRows(source: StatsDatasetSource, controls: StatsControls, conversations: StatsConversationFact[]) {
    const rates = providerRates(source, controls);

    return [...conversationGroups(source, controls, conversations)]
        .map(([groupIdentity, group]) => costRow(controls, groupIdentity, group, rates));
}

/** One bar per card or action; cost prices every run at the rate of the agent that ran it. */
export function totalsRows(source: StatsDatasetSource, controls: StatsControls): StatsChartRow[] {
    const conversations = source.stats.conversations.filter((fact) => isCountedConversation(fact, controls));
    const rows = controls.totalsMetric === 'cost'
        ? costTotalsRows(source, controls, conversations)
        : basicTotalsRows(source, controls, conversations);

    return rows.sort((left, right) => right.value - left.value || left.displayLabel.localeCompare(right.displayLabel));
}
