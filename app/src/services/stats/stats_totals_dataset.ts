import type { StatsConversationFact } from '../../../../shared/project_stats.mjs';
import {
    TERMINAL_CONVERSATION_STATUSES,
    type LoadedStatsSource,
    type StatsChartRow,
    type StatsControls,
    type StatsUnit,
} from './project_stats_types';
import { actionLabel, cardDisplay } from './stats_identities';
import { inRange } from './stats_time_buckets';

interface TotalEntry {
    label: string;
    tooltip: string;
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

/** Ungrouped totals per card or action, accumulated in a single pass over conversations. */
export function totalsRows(source: LoadedStatsSource, controls: StatsControls): StatsChartRow[] {
    const cardsById = new Map(source.cards.map((card) => [card.internalId, card]));
    const totals = new Map<string, TotalEntry>();
    for (const conversation of source.stats.conversations.filter((fact) => isCountedConversation(fact, controls))) {
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

    return [...totals.entries()]
        .map(([identity, { label, tooltip, value }]) => ({
            actionId: controls.totalsGrouping === 'action' ? identity : null,
            actionType: null,
            accessibleLabel: `${tooltip}: ${value} ${unit}`,
            agent: null,
            available: true,
            chartRole: 'primary',
            displayLabel: label,
            grouping: controls.totalsGrouping,
            identity,
            denominator: null,
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
        } satisfies StatsChartRow))
        .sort((left, right) => right.value - left.value || left.displayLabel.localeCompare(right.displayLabel));
}
