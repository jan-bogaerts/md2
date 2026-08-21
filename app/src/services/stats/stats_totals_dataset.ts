import type { StatsConversationFact } from '../../../../shared/project_stats.mjs';
import { findAgentProfile } from '../../data/agent_profiles';
import {
    TERMINAL_CONVERSATION_STATUSES,
    type LoadedStatsSource,
    type StatsAccountSeriesOption,
    type StatsChartRow,
    type StatsControls,
    type StatsUnit,
} from './project_stats_types';
import { accountSeriesIdentity, accountSeriesLabel, actionLabel, cardDisplay, IDENTITY_SEPARATOR } from './stats_identities';
import { inRange } from './stats_time_buckets';

interface TotalEntry {
    label: string;
    tooltip: string;
    value: number;
}

interface ConversationGroup {
    conversations: StatsConversationFact[];
    label: string;
    tooltip: string;
}

interface SeriesRate {
    available: boolean;
    denominator: number;
    numerator: number;
    reason: string | null;
    series: StatsAccountSeriesOption;
    tokensPerDollar: number;
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

function totalRow(controls: StatsControls, identity: string, entry: TotalEntry, unit: StatsUnit): StatsChartRow {
    const { label, tooltip, value } = entry;

    return {
        actionId: controls.totalsGrouping === 'action' ? identity : null,
        actionType: null,
        accessibleLabel: `${tooltip}: ${value} ${unit}`,
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
        tooltip: `${tooltip}: ${value} ${unit}`,
        unit,
        utcBucketEnd: null,
        utcBucketStart: null,
        value,
        windowId: null,
    };
}

function basicTotalsRows(source: LoadedStatsSource, controls: StatsControls, conversations: StatsConversationFact[]) {
    const cardsById = new Map(source.cards.map((card) => [card.internalId, card]));
    const totals = new Map<string, TotalEntry>();
    for (const conversation of conversations) {
        const identity = controls.totalsGrouping === 'card' ? conversation.cardInternalId : conversation.actionId;
        if (!identity) continue;
        const display = controls.totalsGrouping === 'card'
            ? cardDisplay(identity, conversation.cardPath, cardsById)
            : { label: actionLabel(identity, conversation.actionLabel), tooltip: actionLabel(identity, conversation.actionLabel) };
        const value = controls.totalsMetric === 'duration' ? conversation.elapsedMs : conversation.totalTokens;
        if (value === null) continue;
        const current = totals.get(identity);
        totals.set(identity, { label: display.label, tooltip: display.tooltip, value: (current?.value ?? 0) + value });
    }
    const unit: StatsUnit = controls.totalsMetric === 'duration' ? 'milliseconds' : 'tokens';

    return [...totals.entries()].map(([identity, entry]) => totalRow(controls, identity, entry, unit));
}

function conversationGroups(source: LoadedStatsSource, controls: StatsControls, conversations: StatsConversationFact[]) {
    const cardsById = new Map(source.cards.map((card) => [card.internalId, card]));
    const groups = new Map<string, ConversationGroup>();
    for (const conversation of conversations) {
        const identity = controls.totalsGrouping === 'card' ? conversation.cardInternalId : conversation.actionId;
        if (!identity) continue;
        const display = controls.totalsGrouping === 'card'
            ? cardDisplay(identity, conversation.cardPath, cardsById)
            : { label: actionLabel(identity, conversation.actionLabel), tooltip: actionLabel(identity, conversation.actionLabel) };
        const group = groups.get(identity) ?? { conversations: [], label: display.label, tooltip: display.tooltip };
        group.conversations.push(conversation);
        groups.set(identity, group);
    }

    return groups;
}

function accountSeries(source: LoadedStatsSource, controls: StatsControls) {
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

function seriesRates(source: LoadedStatsSource, controls: StatsControls) {
    const accountRows = source.accountRows.filter(({ recordedAt }) => inRange(recordedAt, controls));
    const tokenRows = source.tokenRows.filter(({ recordedAt }) => inRange(recordedAt, controls));

    return accountSeries(source, controls).map((series): SeriesRate => {
        const denominator = accountRows
            .filter((row) => accountSeriesIdentity(row) === series.identity && row.usedPercentDelta !== null && row.usedPercentDelta > 0)
            .reduce((total, row) => total + row.usedPercentDelta!, 0);
        const numerator = tokenRows
            .filter(({ provider }) => provider === series.provider)
            .reduce((total, row) => total + row.totalTokens, 0);
        const profile = findAgentProfile(source.agentProfiles, series.provider);
        const monthlySubscriptionCostUsd = profile?.monthlySubscriptionCostUsd;
        let reason: string | null = null;
        if (denominator <= 0) reason = 'positive account usage denominator is unavailable';
        else if (!profile) reason = 'matching agent profile is unavailable';
        else if (monthlySubscriptionCostUsd === undefined) reason = 'monthly subscription cost is not configured';
        else if (numerator <= 0) reason = 'positive provider token total is unavailable';
        const tokensPerDollar = reason ? 0 : (numerator / denominator) / (monthlySubscriptionCostUsd! / 100);

        return { available: reason === null, denominator, numerator, reason, series, tokensPerDollar };
    });
}

function costRow(
    controls: StatsControls,
    groupIdentity: string,
    group: ConversationGroup,
    conversations: StatsConversationFact[],
    rate: SeriesRate,
): StatsChartRow {
    const seriesLabel = accountSeriesLabel(rate.series);
    const identity = `${groupIdentity}${IDENTITY_SEPARATOR}${rate.series.identity}`;
    const value = rate.available
        ? conversations.reduce((total, conversation) => total + (conversation.totalTokens / rate.tokensPerDollar), 0)
        : 0;
    const result = rate.available ? `$${value.toFixed(2)} estimated cost` : `Cost unavailable: ${rate.reason}`;
    const tooltip = `${group.tooltip}; ${seriesLabel}; ${result}`;

    return {
        actionId: controls.totalsGrouping === 'action' ? groupIdentity : null,
        actionType: null,
        accessibleLabel: tooltip,
        aggregation: 'sum',
        agent: rate.series.provider,
        available: rate.available,
        chartRole: 'primary',
        displayLabel: `${group.label} / ${seriesLabel}`,
        grouping: controls.totalsGrouping,
        identity,
        denominator: rate.denominator,
        deviation: null,
        limitId: rate.series.limitId,
        metric: controls.totalsMetric,
        numerator: rate.numerator,
        provider: rate.series.provider,
        sampleCount: conversations.length,
        seriesIdentity: rate.series.identity,
        seriesLabel,
        stackIdentity: null,
        stackLabel: null,
        statusCounts: null,
        tooltip,
        unit: 'dollars',
        utcBucketEnd: null,
        utcBucketStart: null,
        value,
        windowId: rate.series.windowId,
    };
}

function unavailableAgentRow(
    controls: StatsControls,
    groupIdentity: string,
    group: ConversationGroup,
    agent: string | null,
    sampleCount: number,
): StatsChartRow {
    const agentLabel = agent ?? 'Unknown agent';
    const seriesLabel = `${agentLabel} / account series unavailable`;
    const identity = `${groupIdentity}${IDENTITY_SEPARATOR}unavailable:${agentLabel}`;
    const tooltip = `${group.tooltip}; ${seriesLabel}; Cost unavailable: matching account series is unavailable`;

    return {
        actionId: controls.totalsGrouping === 'action' ? groupIdentity : null,
        actionType: null,
        accessibleLabel: tooltip,
        aggregation: 'sum',
        agent,
        available: false,
        chartRole: 'primary',
        displayLabel: `${group.label} / ${seriesLabel}`,
        grouping: controls.totalsGrouping,
        identity,
        denominator: null,
        deviation: null,
        limitId: null,
        metric: controls.totalsMetric,
        numerator: null,
        provider: agent,
        sampleCount,
        seriesIdentity: identity,
        seriesLabel,
        stackIdentity: null,
        stackLabel: null,
        statusCounts: null,
        tooltip,
        unit: 'dollars',
        utcBucketEnd: null,
        utcBucketStart: null,
        value: 0,
        windowId: null,
    };
}

function groupRatesByProvider(rates: SeriesRate[]) {
    const ratesByProvider = new Map<string, SeriesRate[]>();
    for (const rate of rates) {
        const providerRates = ratesByProvider.get(rate.series.provider) ?? [];
        providerRates.push(rate);
        ratesByProvider.set(rate.series.provider, providerRates);
    }

    return ratesByProvider;
}

function groupConversationsByAgent(conversations: StatsConversationFact[]) {
    const conversationsByAgent = new Map<string | null, StatsConversationFact[]>();
    for (const conversation of conversations) {
        const agentConversations = conversationsByAgent.get(conversation.agent) ?? [];
        agentConversations.push(conversation);
        conversationsByAgent.set(conversation.agent, agentConversations);
    }

    return conversationsByAgent;
}

function costTotalsRows(source: LoadedStatsSource, controls: StatsControls, conversations: StatsConversationFact[]) {
    const rates = seriesRates(source, controls);
    const ratesByProvider = groupRatesByProvider(rates);
    const rows: StatsChartRow[] = [];
    for (const [groupIdentity, group] of conversationGroups(source, controls, conversations)) {
        const conversationsByAgent = groupConversationsByAgent(group.conversations);
        for (const [agent, agentConversations] of conversationsByAgent) {
            const agentRates = agent === null ? [] : ratesByProvider.get(agent) ?? [];
            if (agentRates.length === 0) {
                rows.push(unavailableAgentRow(controls, groupIdentity, group, agent, agentConversations.length));
                continue;
            }
            rows.push(...agentRates.map((rate) => costRow(controls, groupIdentity, group, agentConversations, rate)));
        }
    }

    return rows;
}

/** Totals per card or action; cost estimates remain separate per account series. */
export function totalsRows(source: LoadedStatsSource, controls: StatsControls): StatsChartRow[] {
    const conversations = source.stats.conversations.filter((fact) => isCountedConversation(fact, controls));
    const rows = controls.totalsMetric === 'cost'
        ? costTotalsRows(source, controls, conversations)
        : basicTotalsRows(source, controls, conversations);

    return rows.sort((left, right) => right.value - left.value || left.displayLabel.localeCompare(right.displayLabel));
}
