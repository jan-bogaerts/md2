import type { StatsConversationFact } from '../../../../shared/project_stats.mjs';
import {
    TERMINAL_CONVERSATION_STATUSES,
    type LoadedStatsSource,
    type StatsChartRow,
    type StatsControls,
    type StatsExclusionReason,
    type StatsPerformanceMetric,
    type StatsStatusCounts,
    type StatsUnit,
} from './project_stats_types';
import { emptyTimeRow } from './stats_chart_rows';
import { modelIdentity } from './stats_identities';
import { bucketContexts, bucketDomain, inRange, indexByBucket, type StatsBucketContext } from './stats_time_buckets';

export interface EligibleSample {
    actionId: string;
    agent: string;
    completedAt: string;
    metricValue: number;
    model: string;
    status: 'cancelled' | 'completed' | 'failed';
}

export interface PerformanceSamples {
    exclusionCounts: Partial<Record<StatsExclusionReason, number>>;
    samples: EligibleSample[];
}

function sampleExclusion(conversation: StatsConversationFact, metric: StatsPerformanceMetric): StatsExclusionReason | null {
    if (!TERMINAL_CONVERSATION_STATUSES.has(conversation.status)) return 'notTerminal';
    if (!conversation.completedAt) return 'missingCompletion';
    if (conversation.hasNestedAgentConversations) return 'nestedConversations';
    if (conversation.hasMixedAttribution) return 'mixedAttribution';
    if (!conversation.agent || !conversation.model) return 'missingAttribution';
    if (metric === 'duration' && conversation.elapsedMs === null) return 'missingDuration';

    return null;
}

function performanceMetricValue(conversation: StatsConversationFact, metric: StatsPerformanceMetric) {
    if (metric === 'duration') return conversation.elapsedMs!;
    if (metric === 'toolCalls') return conversation.toolCallCount;

    return conversation.totalTokens;
}

/** Splits canonical root conversations into comparable samples and counted exclusion reasons. */
export function eligibleSamples(source: LoadedStatsSource, controls: StatsControls): PerformanceSamples {
    const exclusionCounts: Partial<Record<StatsExclusionReason, number>> = {};
    const samples: EligibleSample[] = [];
    for (const conversation of source.stats.conversations.filter(({ isRootConversation }) => isRootConversation)) {
        const reason = sampleExclusion(conversation, controls.performanceMetric);
        if (reason) {
            exclusionCounts[reason] = (exclusionCounts[reason] ?? 0) + 1;
            continue;
        }
        samples.push({
            actionId: conversation.actionId!,
            agent: conversation.agent!,
            completedAt: conversation.completedAt!,
            metricValue: performanceMetricValue(conversation, controls.performanceMetric),
            model: conversation.model!,
            status: conversation.status as EligibleSample['status'],
        });
    }

    return { exclusionCounts, samples };
}

function matchesEntityFilters(sample: EligibleSample, controls: StatsControls) {
    if (controls.performanceActionIds.length > 0 && !controls.performanceActionIds.includes(sample.actionId)) return false;
    if (controls.performanceGrouping === 'agent'
        && controls.performanceAgentIds.length > 0
        && !controls.performanceAgentIds.includes(sample.agent)) return false;
    const identity = modelIdentity(sample.agent, sample.model);
    if (controls.performanceGrouping === 'model'
        && controls.performanceModelIds.length > 0
        && !controls.performanceModelIds.includes(identity)) return false;

    return inRange(sample.completedAt, controls);
}

function performanceUnit(metric: StatsPerformanceMetric): StatsUnit {
    if (metric === 'duration') return 'milliseconds';

    return metric === 'toolCalls' ? 'toolCalls' : 'tokens';
}

function groupRow(
    context: StatsBucketContext,
    controls: StatsControls,
    unit: StatsUnit,
    identity: string,
    groupSamples: EligibleSample[],
): StatsChartRow {
    const seriesLabel = controls.performanceGrouping === 'agent' ? identity : `${groupSamples[0].agent} - ${groupSamples[0].model}`;
    const sampleCount = groupSamples.length;
    const value = groupSamples.reduce((total, sample) => total + sample.metricValue, 0) / sampleCount;
    const statusCounts = groupSamples.reduce<StatsStatusCounts>((counts, sample) => ({
        ...counts,
        [sample.status]: counts[sample.status] + 1,
    }), { cancelled: 0, completed: 0, failed: 0 });
    const tooltip = `${context.localLabel}; UTC ${context.interval}; ${seriesLabel}: ${value} ${unit}; ${sampleCount} samples; completed ${statusCounts.completed}, failed ${statusCounts.failed}, cancelled ${statusCounts.cancelled}`;

    return {
        actionId: null,
        actionType: null,
        accessibleLabel: tooltip,
        agent: null,
        available: true,
        chartRole: 'primary',
        displayLabel: context.displayLabel,
        grouping: controls.performanceGrouping,
        identity,
        denominator: null,
        limitId: null,
        metric: controls.performanceMetric,
        numerator: null,
        provider: null,
        sampleCount,
        seriesIdentity: identity,
        seriesLabel,
        stackIdentity: null,
        stackLabel: null,
        statusCounts,
        tooltip,
        unit,
        utcBucketEnd: context.end,
        utcBucketStart: context.start,
        value,
        windowId: null,
    } satisfies StatsChartRow;
}

function bucketRows(
    context: StatsBucketContext,
    controls: StatsControls,
    unit: StatsUnit,
    bucketSamples: EligibleSample[],
): StatsChartRow[] {
    if (bucketSamples.length === 0) {
        return [emptyTimeRow(context, controls.performanceGranularity, 'primary', controls.performanceMetric, unit)];
    }
    const groups = new Map<string, EligibleSample[]>();
    for (const sample of bucketSamples) {
        const identity = controls.performanceGrouping === 'agent' ? sample.agent : modelIdentity(sample.agent, sample.model);
        const groupSamples = groups.get(identity);
        if (groupSamples) groupSamples.push(sample);
        else groups.set(identity, [sample]);
    }

    return [...groups.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([identity, groupSamples]) => groupRow(context, controls, unit, identity, groupSamples));
}

/** Averaged agent or model performance per UTC bucket, grouped from one bucket index. */
export function performanceRows(controls: StatsControls, samples: EligibleSample[]): StatsChartRow[] {
    const entityFiltered = samples.filter((sample) => matchesEntityFilters(sample, controls));
    const buckets = bucketDomain(entityFiltered.map(({ completedAt }) => completedAt), controls.performanceGranularity, controls);
    const contexts = bucketContexts(buckets, controls.performanceGranularity);
    const unit = performanceUnit(controls.performanceMetric);
    const samplesByBucket = indexByBucket(entityFiltered, controls.performanceGranularity, ({ completedAt }) => completedAt);

    return contexts.flatMap((context) => bucketRows(context, controls, unit, samplesByBucket.get(context.start) ?? []));
}
