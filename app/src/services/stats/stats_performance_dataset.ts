import type { StatsConversationFact } from '../../../../shared/project_stats.mjs';
import {
    TERMINAL_CONVERSATION_STATUSES,
    type StatsChartRow,
    type StatsControls,
    type StatsDatasetSource,
    type StatsExclusionReason,
    type StatsPerformanceAggregation,
    type StatsPerformanceMetric,
    type StatsStatusCounts,
    type StatsUnit,
} from './project_stats_types';
import { emptyTimeRow } from './stats_chart_rows';
import {
    DURATION_COMPONENTS,
    addDurationComponents,
    durationComponentShare,
    durationComponents,
    emptyDurationComponents,
    scaleDurationComponents,
    totalDurationComponents,
    type StatsDurationComponents,
} from './stats_duration_components';
import { modelIdentity } from './stats_identities';
import { bucketContexts, bucketDomain, inRange, indexByBucket, type StatsBucketContext } from './stats_time_buckets';
import { accessibleStatsTooltip, formatBucketRange, formatCount, formatDurationHms, statsTooltip, type StatsTooltipLine } from './stats_tooltip';

export interface EligibleSample {
    actionId: string;
    agent: string;
    completedAt: string;
    /** How this run's measured total was spent; all zero when the metric is not duration. */
    durationSplit: StatsDurationComponents;
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
export function eligibleSamples(source: StatsDatasetSource, controls: StatsControls): PerformanceSamples {
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
            durationSplit: conversation.elapsedMs === null
                ? emptyDurationComponents()
                : durationComponents(conversation.elapsedMs, conversation.reasoningMs, conversation.toolMs),
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

function median(values: number[]) {
    const sortedValues = [...values].sort((left, right) => left - right);
    const middleIndex = Math.floor(sortedValues.length / 2);
    if (sortedValues.length % 2 === 1) return sortedValues[middleIndex];

    return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
}

function aggregationLabel(aggregation: StatsPerformanceAggregation, metric: StatsPerformanceMetric) {
    const metricLabel = metric === 'toolCalls' ? 'tool calls' : metric;
    if (aggregation === 'sum') return `Total ${metricLabel}`;
    if (aggregation === 'median') return `Median ${metricLabel} per run`;

    return `Average ${metricLabel} per run`;
}

function formattedMetricValue(value: number, unit: StatsUnit) {
    if (unit === 'milliseconds') return formatDurationHms(value);

    return `${formatCount(value)} ${unit === 'toolCalls' ? 'tool calls' : unit}`;
}

/**
 * Sum and average split a duration bar into its components; median and average-with-deviation keep a
 * single bar, because a median of the parts does not add up to the median of the total and a whisker
 * on a stack segment has no meaning.
 */
export function isStackedDurationPerformance(controls: StatsControls) {
    return controls.performanceMetric === 'duration'
        && (controls.performanceAggregation === 'sum' || controls.performanceAggregation === 'average');
}

interface GroupAggregate {
    componentTotals: StatsDurationComponents;
    deviation: number | null;
    sampleCount: number;
    seriesLabel: string;
    statusCounts: StatsStatusCounts;
    value: number;
}

function groupAggregate(controls: StatsControls, identity: string, groupSamples: EligibleSample[]): GroupAggregate {
    const metricValues: number[] = [];
    const statusCounts: StatsStatusCounts = { cancelled: 0, completed: 0, failed: 0 };
    let componentTotals = emptyDurationComponents();
    let sum = 0;
    let sumOfSquares = 0;
    for (const sample of groupSamples) {
        metricValues.push(sample.metricValue);
        sum += sample.metricValue;
        sumOfSquares += sample.metricValue ** 2;
        statusCounts[sample.status] += 1;
        componentTotals = addDurationComponents(componentTotals, sample.durationSplit);
    }
    const sampleCount = groupSamples.length;
    const average = sum / sampleCount;
    const populationVariance = Math.max(0, (sumOfSquares / sampleCount) - (average ** 2));

    return {
        componentTotals,
        deviation: controls.performanceAggregation === 'averageWithDeviation' ? Math.sqrt(populationVariance) : null,
        sampleCount,
        seriesLabel: controls.performanceGrouping === 'agent' ? identity : `${groupSamples[0].agent} - ${groupSamples[0].model}`,
        statusCounts,
        value: controls.performanceAggregation === 'sum'
            ? sum
            : controls.performanceAggregation === 'median' ? median(metricValues) : average,
    };
}

function performanceRow(
    context: StatsBucketContext,
    controls: StatsControls,
    unit: StatsUnit,
    identity: string,
    aggregate: GroupAggregate,
    tooltipLines: StatsTooltipLine[],
    overrides: Partial<StatsChartRow>,
): StatsChartRow {
    const tooltip = statsTooltip(tooltipLines);

    return {
        actionId: null,
        actionType: null,
        accessibleLabel: accessibleStatsTooltip(tooltip),
        aggregation: controls.performanceAggregation,
        agent: null,
        available: true,
        chartRole: 'primary',
        colorGroup: null,
        displayLabel: context.displayLabel,
        grouping: controls.performanceGrouping,
        identity,
        denominator: null,
        deviation: aggregate.deviation,
        limitId: null,
        metric: controls.performanceMetric,
        numerator: null,
        provider: null,
        sampleCount: aggregate.sampleCount,
        seriesIdentity: identity,
        seriesLabel: aggregate.seriesLabel,
        stackIdentity: null,
        stackLabel: null,
        statusCounts: aggregate.statusCounts,
        tooltip,
        unit,
        utcBucketEnd: context.end,
        utcBucketStart: context.start,
        value: aggregate.value,
        windowId: null,
        ...overrides,
    } satisfies StatsChartRow;
}

function runCountLines(aggregate: GroupAggregate): StatsTooltipLine[] {
    const { cancelled, completed, failed } = aggregate.statusCounts;

    return [
        { label: 'Runs', value: formatCount(aggregate.sampleCount) },
        { label: 'Statuses', value: `${completed} completed \u00b7 ${failed} failed \u00b7 ${cancelled} cancelled` },
    ];
}

/** Components aggregate exactly like the total, so the stack always adds up to the unsplit bar. */
function aggregatedComponents(controls: StatsControls, aggregate: GroupAggregate) {
    return controls.performanceAggregation === 'sum'
        ? aggregate.componentTotals
        : scaleDurationComponents(aggregate.componentTotals, aggregate.sampleCount);
}

function stackedGroupRows(
    context: StatsBucketContext,
    controls: StatsControls,
    unit: StatsUnit,
    identity: string,
    aggregate: GroupAggregate,
): StatsChartRow[] {
    const components = aggregatedComponents(controls, aggregate);
    const barTotal = totalDurationComponents(components);

    return DURATION_COMPONENTS.map((component) => {
        const value = components[component.key];
        const seriesLabel = `${aggregate.seriesLabel} - ${component.label}`;
        const tooltipLines: StatsTooltipLine[] = [
            { label: null, value: formatBucketRange(context) },
            { label: 'Series', value: seriesLabel },
            {
                label: aggregationLabel(controls.performanceAggregation, controls.performanceMetric),
                value: formattedMetricValue(value, unit),
            },
            { label: 'Share', value: `${durationComponentShare(value, barTotal)} of ${formattedMetricValue(barTotal, unit)}` },
            ...runCountLines(aggregate),
        ];

        return performanceRow(context, controls, unit, identity, aggregate, tooltipLines, {
            colorGroup: component.colorGroup,
            deviation: null,
            seriesIdentity: `${identity} ${component.key}`,
            seriesLabel,
            stackIdentity: identity,
            stackLabel: aggregate.seriesLabel,
            value,
        });
    });
}

function singleGroupRow(
    context: StatsBucketContext,
    controls: StatsControls,
    unit: StatsUnit,
    identity: string,
    aggregate: GroupAggregate,
): StatsChartRow {
    const tooltipLines: StatsTooltipLine[] = [
        { label: null, value: formatBucketRange(context) },
        { label: 'Series', value: aggregate.seriesLabel },
        {
            label: aggregationLabel(controls.performanceAggregation, controls.performanceMetric),
            value: formattedMetricValue(aggregate.value, unit),
        },
    ];
    if (aggregate.deviation !== null) tooltipLines.push({ label: 'Std dev', value: formattedMetricValue(aggregate.deviation, unit) });
    tooltipLines.push(...runCountLines(aggregate));
    if (controls.performanceMetric === 'duration') {
        // This bar stays unsplit, so the split is reported per run rather than as segments.
        const perRun = scaleDurationComponents(aggregate.componentTotals, aggregate.sampleCount);
        tooltipLines.push({ label: null, value: 'Average split per run' });
        for (const component of DURATION_COMPONENTS) {
            tooltipLines.push({ label: component.label, value: formattedMetricValue(perRun[component.key], unit) });
        }
    }

    return performanceRow(context, controls, unit, identity, aggregate, tooltipLines, {});
}

function groupRows(
    context: StatsBucketContext,
    controls: StatsControls,
    unit: StatsUnit,
    identity: string,
    groupSamples: EligibleSample[],
): StatsChartRow[] {
    const aggregate = groupAggregate(controls, identity, groupSamples);
    if (isStackedDurationPerformance(controls)) return stackedGroupRows(context, controls, unit, identity, aggregate);

    return [singleGroupRow(context, controls, unit, identity, aggregate)];
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
        .flatMap(([identity, groupSamples]) => groupRows(context, controls, unit, identity, groupSamples));
}

/** Aggregated agent or model performance per UTC bucket, grouped from one bucket index. */
export function performanceRows(controls: StatsControls, samples: EligibleSample[]): StatsChartRow[] {
    const entityFiltered = samples.filter((sample) => matchesEntityFilters(sample, controls));
    const buckets = bucketDomain(entityFiltered.map(({ completedAt }) => completedAt), controls.performanceGranularity, controls);
    const contexts = bucketContexts(buckets, controls.performanceGranularity);
    const unit = performanceUnit(controls.performanceMetric);
    const samplesByBucket = indexByBucket(entityFiltered, controls.performanceGranularity, ({ completedAt }) => completedAt);

    return contexts.flatMap((context) => bucketRows(context, controls, unit, samplesByBucket.get(context.start) ?? []));
}
