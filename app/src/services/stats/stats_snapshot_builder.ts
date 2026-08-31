import {
    TERMINAL_CONVERSATION_STATUSES,
    type LoadedStatsSource,
    type ProjectStatsSnapshot,
    type StatsChartRow,
    type StatsControls,
    type StatsOptions,
} from './project_stats_types';
import { activityRows } from './stats_activity_dataset';
import { buildOptions, reconcileControls } from './stats_options';
import { eligibleSamples, performanceRows, type EligibleSample } from './stats_performance_dataset';
import { inRange } from './stats_time_buckets';
import { totalsRows } from './stats_totals_dataset';
import { usageComparisonRows } from './stats_usage_comparison_dataset';

function datasetRows(
    source: LoadedStatsSource,
    controls: StatsControls,
    options: StatsOptions,
    samples: EligibleSample[],
): StatsChartRow[] {
    if (controls.dataset === 'activityOverTime') return activityRows(source, controls, controls.activityGranularity);
    if (controls.dataset === 'agentPerformance') return performanceRows(controls, samples);
    if (controls.dataset === 'usageComparison') return usageComparisonRows(source, controls, options);

    return totalsRows(source, controls);
}

function omittedTimerCount(source: LoadedStatsSource, controls: StatsControls) {
    return source.stats.conversations.filter((conversation) => (
        TERMINAL_CONVERSATION_STATUSES.has(conversation.status)
        && conversation.completedAt !== null
        && inRange(conversation.completedAt, controls)
        && conversation.elapsedMs === null
    )).length;
}

/** Reconciles controls against the loaded source, then aggregates the selected dataset once. */
export function buildSnapshot(source: LoadedStatsSource, requestedControls: StatsControls): ProjectStatsSnapshot {
    const options = buildOptions(source);
    const controls = reconcileControls(requestedControls, options);
    const performance = eligibleSamples(source, controls);
    const rows = datasetRows(source, controls, options, performance.samples);
    const excludedSampleCount = Object.values(performance.exclusionCounts).reduce((total, count) => total + count, 0);

    return {
        controls,
        error: null,
        excludedSampleCount,
        exclusionCounts: performance.exclusionCounts,
        omittedTimerCount: omittedTimerCount(source, controls),
        options,
        rows,
        status: 'ready',
        tokenTimeAvailable: source.tokenTimeAvailable,
        warnings: source.warnings,
    };
}
