import {
    TERMINAL_CONVERSATION_STATUSES,
    type LoadedStatsSource,
    type ProjectStatsSnapshot,
    type StatsChartRow,
    type StatsControls,
    type StatsDatasetSource,
    type StatsOptions,
} from './project_stats_types';
import { activityRows } from './stats_activity_dataset';
import { buildOptions, buildReleaseOptions, reconcileControls } from './stats_options';
import { eligibleSamples, performanceRows, type EligibleSample } from './stats_performance_dataset';
import { inRange } from './stats_time_buckets';
import { totalsRows } from './stats_totals_dataset';
import { usageComparisonRows } from './stats_usage_comparison_dataset';

function datasetRows(
    source: StatsDatasetSource,
    controls: StatsControls,
    options: StatsOptions,
    samples: EligibleSample[],
): StatsChartRow[] {
    if (controls.dataset === 'activityOverTime') return activityRows(source, controls, controls.activityGranularity);
    if (controls.dataset === 'agentPerformance') return performanceRows(controls, samples);
    if (controls.dataset === 'usageComparison') return usageComparisonRows(source, controls, options);

    return totalsRows(source, controls);
}

function omittedTimerCount(source: StatsDatasetSource, controls: StatsControls) {
    return source.stats.conversations.filter((conversation) => (
        TERMINAL_CONVERSATION_STATUSES.has(conversation.status)
        && conversation.completedAt !== null
        && inRange(conversation.completedAt, controls)
        && conversation.elapsedMs === null
    )).length;
}

/** Reconciles controls against the loaded source, then aggregates the selected dataset once. */
export function buildSnapshot(source: LoadedStatsSource, requestedControls: StatsControls): ProjectStatsSnapshot {
    const releases = buildReleaseOptions(source);
    const releaseIdentity = releases.some(({ identity }) => identity === requestedControls.releaseIdentity)
        ? requestedControls.releaseIdentity
        : releases[0].identity;
    const selectedRelease = releases.find(({ identity }) => identity === releaseIdentity);
    if (!selectedRelease) throw new Error('Selected stats release is unavailable');
    const stats = selectedRelease.releaseName === null ? source.currentStats : source.releaseStats[selectedRelease.releaseName];
    if (!stats) throw new Error(`Missing stats for release ${selectedRelease.releaseName}`);
    const datasetSource: StatsDatasetSource = { ...source, stats };
    const options = buildOptions(datasetSource, releases);
    const controls = reconcileControls({ ...requestedControls, releaseIdentity }, options);
    const performance = eligibleSamples(datasetSource, controls);
    const rows = datasetRows(datasetSource, controls, options, performance.samples);
    const excludedSampleCount = Object.values(performance.exclusionCounts).reduce((total, count) => total + count, 0);

    return {
        controls,
        error: null,
        excludedSampleCount,
        exclusionCounts: performance.exclusionCounts,
        omittedTimerCount: omittedTimerCount(datasetSource, controls),
        options,
        rows,
        status: 'ready',
        tokenTimeAvailable: source.tokenTimeAvailable,
        warnings: source.warnings,
    };
}
