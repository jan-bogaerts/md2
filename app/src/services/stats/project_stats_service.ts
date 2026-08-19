import { activityOriginFromPath, projectActivityFolder } from '../../../../shared/activity_paths.mjs';
import {
    parseProjectStatsFile,
    projectStatsFilePath,
    serializeProjectStats,
    type ActivityStatsCalculationResult,
    type ReleaseStats,
    type StatsConversationFact,
} from '../../../../shared/project_stats.mjs';
import type { ProjectConfig, ProjectReference, StorageService } from '../../data/data_types';
import {
    projectUsageMetricsService,
    type UsageMetricsAccountRow,
    type UsageMetricsTokenRow,
} from '../agents/project_usage_metrics_service';
import { register } from '../service_injector';
import { calculateActivityStatsOutsideMainThread } from './project_stats_worker_client';

export type StatsDataset = 'activityOverTime' | 'agentPerformance' | 'usageComparison' | 'totals';
export type StatsGranularity = 'day' | 'week' | 'month';
export type StatsShortGranularity = Exclude<StatsGranularity, 'month'>;
export type StatsActivityMetric = 'cards' | 'actions' | 'tokens';
export type StatsPerformanceMetric = 'duration' | 'tokens' | 'toolCalls';
export type StatsPerformanceGrouping = 'agent' | 'model';
export type StatsTotalsGrouping = 'card' | 'action';
export type StatsTotalsMetric = 'duration' | 'tokens';
export type StatsStatus = 'idle' | 'loading' | 'ready' | 'error';
export type StatsChartRole =
    | 'primary'
    | 'activity'
    | 'projectTokens'
    | 'accountUsage'
    | 'tokensPerAccountUsage'
    | 'actionsPerAccountUsage';
export type StatsUnit =
    | 'actions'
    | 'actionsPerPercentagePoint'
    | 'cards'
    | 'milliseconds'
    | 'percentagePoints'
    | 'tokens'
    | 'tokensPerPercentagePoint'
    | 'toolCalls';
export type StatsExclusionReason =
    | 'missingAttribution'
    | 'missingCompletion'
    | 'missingDuration'
    | 'mixedAttribution'
    | 'nestedConversations'
    | 'notTerminal';

export interface StatsControls {
    activityGranularity: StatsGranularity;
    activityMetric: StatsActivityMetric;
    dataset: StatsDataset;
    endUtc: string | null;
    performanceActionIds: string[];
    performanceAgentIds: string[];
    performanceGranularity: StatsShortGranularity;
    performanceGrouping: StatsPerformanceGrouping;
    performanceMetric: StatsPerformanceMetric;
    performanceModelIds: string[];
    startUtc: string | null;
    totalsGrouping: StatsTotalsGrouping;
    totalsMetric: StatsTotalsMetric;
    usageGranularity: StatsShortGranularity;
}

export interface StatsStatusCounts {
    cancelled: number;
    completed: number;
    failed: number;
}

export interface StatsChartRow {
    actionId: string | null;
    actionType: 'agent' | 'command' | null;
    accessibleLabel: string;
    agent: string | null;
    available: boolean;
    chartRole: StatsChartRole;
    displayLabel: string;
    grouping: string;
    identity: string;
    denominator: number | null;
    limitId: string | null;
    metric: string;
    numerator: number | null;
    provider: string | null;
    sampleCount: number | null;
    seriesIdentity: string | null;
    seriesLabel: string | null;
    stackIdentity: string | null;
    stackLabel: string | null;
    statusCounts: StatsStatusCounts | null;
    tooltip: string;
    unit: StatsUnit;
    utcBucketEnd: string | null;
    utcBucketStart: string | null;
    value: number;
    windowId: string | null;
}

export interface StatsCardDescriptor {
    internalId: string;
    path: string;
    title: string;
    visibleId: string;
}

export interface StatsOption {
    identity: string;
    label: string;
}

export interface StatsAccountSeriesOption {
    identity: string;
    limitId: string;
    provider: string;
    windowDurationMinutes: number;
    windowId: string;
}

export interface StatsOptions {
    accountSeries: StatsAccountSeriesOption[];
    actions: StatsOption[];
    agents: StatsOption[];
    models: StatsOption[];
}

export interface ProjectStatsSnapshot {
    controls: StatsControls;
    error: Error | null;
    excludedSampleCount: number;
    exclusionCounts: Partial<Record<StatsExclusionReason, number>>;
    omittedTimerCount: number;
    options: StatsOptions;
    rows: StatsChartRow[];
    status: StatsStatus;
    tokenTimeAvailable: boolean;
    warnings: string[];
}

interface LoadedStatsSource {
    accountRows: UsageMetricsAccountRow[];
    cards: StatsCardDescriptor[];
    stats: ReleaseStats;
    tokenRows: UsageMetricsTokenRow[];
    tokenTimeAvailable: boolean;
    warnings: string[];
}

interface StatsProjectBinding {
    config: ProjectConfig;
    project: ProjectReference;
    storage: StorageService;
}

interface EligibleSample {
    actionId: string;
    agent: string;
    completedAt: string;
    metricValue: number;
    model: string;
    status: 'cancelled' | 'completed' | 'failed';
}

type StatsCalculator = (
    storage: StorageService,
    project: ProjectReference,
    paths: string[],
    signal: AbortSignal,
) => Promise<ActivityStatsCalculationResult>;

const TERMINAL_CONVERSATION_STATUSES = new Set(['cancelled', 'completed', 'failed']);
const EMPTY_OPTIONS: StatsOptions = { accountSeries: [], actions: [], agents: [], models: [] };
const INITIAL_CONTROLS: StatsControls = {
    activityGranularity: 'day',
    activityMetric: 'actions',
    dataset: 'activityOverTime',
    endUtc: null,
    performanceActionIds: [],
    performanceAgentIds: [],
    performanceGranularity: 'day',
    performanceGrouping: 'agent',
    performanceMetric: 'duration',
    performanceModelIds: [],
    startUtc: null,
    totalsGrouping: 'card',
    totalsMetric: 'duration',
    usageGranularity: 'day',
};
const INITIAL_SNAPSHOT: ProjectStatsSnapshot = {
    controls: INITIAL_CONTROLS,
    error: null,
    excludedSampleCount: 0,
    exclusionCounts: {},
    omittedTimerCount: 0,
    options: EMPTY_OPTIONS,
    rows: [],
    status: 'idle',
    tokenTimeAvailable: false,
    warnings: [],
};

function normalizePath(path: string) {
    return path.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '');
}

function isValidIsoTimestamp(value: string) {
    const milliseconds = Date.parse(value);

    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function recognizedCurrentActivityPath(path: string, config: ProjectConfig) {
    const normalizedPath = normalizePath(path);
    const activityFolder = normalizePath(projectActivityFolder(config.projectFolder));
    const activityPrefix = `${activityFolder}/`;
    if (normalizedPath.startsWith(activityPrefix) && !normalizedPath.slice(activityPrefix.length).includes('/')) {
        return activityOriginFromPath(normalizedPath) ? normalizedPath : null;
    }
    return null;
}

export function findStatsSourcePaths(repositoryFiles: string[], config: ProjectConfig) {
    const currentActivityPaths = repositoryFiles
        .map((path) => recognizedCurrentActivityPath(path, config))
        .filter((path): path is string => path !== null)
        .sort((left, right) => left.localeCompare(right));
    const releaseActivityPaths: Record<string, string[]> = {};
    const releasesFolder = normalizePath(config.releasesFolder);
    const releasePrefix = `${releasesFolder}/`;
    for (const path of repositoryFiles.map(normalizePath)) {
        if (!path.startsWith(releasePrefix)) continue;
        const releaseParts = path.slice(releasePrefix.length).split('/');
        if (releaseParts.length < 2 || releaseParts[0].length === 0) continue;
        const releaseName = releaseParts[0];
        releaseActivityPaths[releaseName] ??= [];
        if (releaseParts.length !== 2 || !/^card__[^/]+\.json$/u.test(releaseParts[1]) || !activityOriginFromPath(path)) continue;
        releaseActivityPaths[releaseName] = [...(releaseActivityPaths[releaseName] ?? []), path];
    }
    for (const paths of Object.values(releaseActivityPaths)) paths.sort((left, right) => left.localeCompare(right));

    return { currentActivityPaths, releaseActivityPaths };
}

function utcBucketStart(timestamp: string, granularity: StatsGranularity) {
    const date = new Date(timestamp);
    date.setUTCHours(0, 0, 0, 0);
    if (granularity === 'week') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    if (granularity === 'month') date.setUTCDate(1);

    return date.toISOString();
}

function nextUtcBucket(timestamp: string, granularity: StatsGranularity) {
    const date = new Date(timestamp);
    if (granularity === 'day') date.setUTCDate(date.getUTCDate() + 1);
    if (granularity === 'week') date.setUTCDate(date.getUTCDate() + 7);
    if (granularity === 'month') date.setUTCMonth(date.getUTCMonth() + 1);

    return date.toISOString();
}

function isoWeekNumber(timestamp: string) {
    const date = new Date(timestamp);
    date.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));

    return 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604_800_000);
}

function shortBucketLabel(timestamp: string, granularity: StatsGranularity) {
    const date = new Date(timestamp);
    const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
    if (granularity === 'day') return dayMonth;
    if (granularity === 'week') return `W${isoWeekNumber(timestamp)} - ${dayMonth}`;

    return new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC', year: 'numeric' }).format(date);
}

function localBucketLabel(start: string, end: string) {
    const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

    return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`;
}

function inRange(timestamp: string, controls: StatsControls) {
    const milliseconds = Date.parse(timestamp);
    if (controls.startUtc && milliseconds < Date.parse(controls.startUtc)) return false;
    if (controls.endUtc && milliseconds > Date.parse(controls.endUtc)) return false;

    return true;
}

function bucketDomain(timestamps: string[], granularity: StatsGranularity, controls: StatsControls) {
    const matchingTimestamps = timestamps.filter((timestamp) => inRange(timestamp, controls)).sort();
    const startSource = controls.startUtc ?? matchingTimestamps[0];
    const endSource = controls.endUtc ?? matchingTimestamps.at(-1);
    if (!startSource || !endSource) return [];
    const start = utcBucketStart(startSource, granularity);
    const end = utcBucketStart(endSource, granularity);
    if (start > end) return [];
    const buckets: string[] = [];
    for (let bucket = start; bucket <= end; bucket = nextUtcBucket(bucket, granularity)) buckets.push(bucket);

    return buckets;
}

function rowContext(bucket: string, granularity: StatsGranularity) {
    const end = nextUtcBucket(bucket, granularity);
    const displayLabel = shortBucketLabel(bucket, granularity);
    const interval = `${bucket} to ${end}`;

    return { displayLabel, end, interval, localLabel: localBucketLabel(bucket, end) };
}

function cardDisplay(cardInternalId: string, cardPath: string | null, cardsById: Map<string, StatsCardDescriptor>) {
    const card = cardsById.get(cardInternalId);
    if (card) return { label: card.visibleId, tooltip: `${card.visibleId}: ${card.title}; ${card.path}` };
    const fallback = cardPath ?? cardInternalId;

    return { label: fallback, tooltip: fallback };
}

function actionLabel(actionId: string, storedLabel: string | null) {
    return storedLabel ?? actionId;
}

function mergeStats(statsSources: ReleaseStats[]) {
    const actions = new Map(statsSources.flatMap(({ actions }) => actions.map((action) => [action.identity, action])));
    const conversations = new Map(statsSources.flatMap(({ conversations }) => (
        conversations.map((conversation) => [conversation.identity, conversation])
    )));

    return { actions: [...actions.values()], conversations: [...conversations.values()] };
}

function optionList(entries: Array<[string, string]>) {
    return [...new Map(entries).entries()]
        .map(([identity, label]) => ({ identity, label }))
        .sort((left, right) => left.label.localeCompare(right.label) || left.identity.localeCompare(right.identity));
}

function modelIdentity(agent: string, model: string) {
    return `${agent}\u0000${model}`;
}

function accountSeriesIdentity(row: UsageMetricsAccountRow) {
    return `${row.provider}\u0000${row.limitId}\u0000${row.windowId}`;
}

function buildOptions(source: LoadedStatsSource): StatsOptions {
    const attributed = source.stats.conversations.filter(({ agent, isRootConversation, model }) => isRootConversation && agent && model);
    const actions = optionList([
        ...source.stats.actions.map(({ actionId, actionLabel }) => [actionId, actionLabel] as [string, string]),
        ...source.stats.conversations.flatMap(({ actionId, actionLabel }) => (
            actionId ? [[actionId, actionLabel ?? actionId] as [string, string]] : []
        )),
    ]);
    const agents = optionList(attributed.map(({ agent }) => [agent!, agent!]));
    const models = optionList(attributed.map(({ agent, model }) => [modelIdentity(agent!, model!), `${agent} - ${model}`]));
    const accountSeries = [...new Map(source.accountRows.map((row) => [accountSeriesIdentity(row), {
        identity: accountSeriesIdentity(row),
        limitId: row.limitId,
        provider: row.provider,
        windowDurationMinutes: row.windowDurationMinutes,
        windowId: row.windowId,
    }])).values()].sort((left, right) => left.identity.localeCompare(right.identity));

    return { accountSeries, actions, agents, models };
}

function retainValidSelections(selected: string[], available: Set<string>) {
    return selected.filter((identity) => available.has(identity));
}

function reconcileControls(controls: StatsControls, options: StatsOptions) {
    return {
        ...controls,
        performanceActionIds: retainValidSelections(
            controls.performanceActionIds,
            new Set(options.actions.map(({ identity }) => identity)),
        ),
        performanceAgentIds: retainValidSelections(controls.performanceAgentIds, new Set(options.agents.map(({ identity }) => identity))),
        performanceModelIds: retainValidSelections(controls.performanceModelIds, new Set(options.models.map(({ identity }) => identity))),
    };
}

function emptyTimeRow(
    bucket: string,
    granularity: StatsGranularity,
    chartRole: StatsChartRole,
    metric: string,
    unit: StatsUnit,
): StatsChartRow {
    const context = rowContext(bucket, granularity);
    const tooltip = `${context.localLabel}; UTC ${context.interval}; 0 ${unit}`;

    return {
        actionId: null,
        actionType: null,
        accessibleLabel: tooltip,
        agent: null,
        available: true,
        chartRole,
        displayLabel: context.displayLabel,
        grouping: granularity,
        identity: bucket,
        denominator: null,
        limitId: null,
        metric,
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
        utcBucketEnd: context.end,
        utcBucketStart: bucket,
        value: 0,
        windowId: null,
    } satisfies StatsChartRow;
}

function unavailableTimeRow(
    bucket: string,
    granularity: StatsGranularity,
    chartRole: StatsChartRole,
    metric: string,
    unit: StatsUnit,
    unavailableLabel: string,
) {
    const row = emptyTimeRow(bucket, granularity, chartRole, metric, unit);
    const context = rowContext(bucket, granularity);
    const tooltip = `${context.localLabel}; UTC ${context.interval}; ${unavailableLabel} unavailable`;

    return { ...row, accessibleLabel: tooltip, available: false, tooltip };
}

function activityRows(
    source: LoadedStatsSource,
    controls: StatsControls,
    granularity: StatsGranularity,
    chartRole: StatsChartRole = 'primary',
): StatsChartRow[] {
    const metric = chartRole === 'activity' ? 'actions' : controls.activityMetric;
    const actionRecords = source.stats.actions.filter(({ completedAt }) => inRange(completedAt, controls));
    const tokenRows = source.tokenRows.filter(({ recordedAt }) => inRange(recordedAt, controls));
    const timestamps = metric === 'tokens'
        ? tokenRows.map(({ recordedAt }) => recordedAt)
        : actionRecords.map(({ completedAt }) => completedAt);
    const buckets = bucketDomain(timestamps, granularity, controls);
    if (metric === 'actions') {
        return buckets.flatMap<StatsChartRow>((bucket) => {
            const records = actionRecords.filter(({ completedAt }) => utcBucketStart(completedAt, granularity) === bucket);
            if (records.length === 0) return [emptyTimeRow(bucket, granularity, chartRole, metric, 'actions')];
            const counts = new Map<string, { label: string, value: number }>();
            for (const record of records) {
                const current = counts.get(record.actionId);
                counts.set(record.actionId, { label: actionLabel(record.actionId, record.actionLabel), value: (current?.value ?? 0) + 1 });
            }
            const context = rowContext(bucket, granularity);
            const total = records.length;

            return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([identity, count]) => {
                const tooltip = `${context.localLabel}; UTC ${context.interval}; total ${total} actions; ${count.label}: ${count.value}`;

                return {
                    ...emptyTimeRow(bucket, granularity, chartRole, metric, 'actions'),
                    actionId: identity,
                    accessibleLabel: tooltip,
                    identity,
                    seriesIdentity: identity,
                    seriesLabel: count.label,
                    stackIdentity: identity,
                    tooltip,
                    value: count.value,
                } satisfies StatsChartRow;
            });
        });
    }
    if (metric === 'cards') {
        return buckets.map((bucket) => {
            const count = new Set(actionRecords.filter(({ completedAt }) => (
                utcBucketStart(completedAt, granularity) === bucket
            )).flatMap(({ cardInternalId }) => cardInternalId ? [cardInternalId] : [])).size;
            const context = rowContext(bucket, granularity);
            const tooltip = `${context.localLabel}; UTC ${context.interval}; ${count} cards`;

            return {
                ...emptyTimeRow(bucket, granularity, chartRole, metric, 'cards'),
                accessibleLabel: tooltip,
                tooltip,
                value: count,
            };
        });
    }

    return buckets.map((bucket) => {
        const value = tokenRows.filter(({ recordedAt }) => utcBucketStart(recordedAt, granularity) === bucket)
            .reduce((total, row) => total + row.totalTokens, 0);
        const context = rowContext(bucket, granularity);
        const tooltip = `${context.localLabel}; UTC ${context.interval}; ${value} tokens`;

        return { ...emptyTimeRow(bucket, granularity, chartRole, metric, 'tokens'), accessibleLabel: tooltip, tooltip, value };
    });
}

function projectTokenRows(
    source: LoadedStatsSource,
    controls: StatsControls,
    granularity: StatsShortGranularity,
    buckets: string[],
): StatsChartRow[] {
    const tokenRows = source.tokenRows.filter(({ recordedAt }) => inRange(recordedAt, controls));
    const providers = [...new Set(tokenRows.map(({ provider }) => provider))].sort();

    return buckets.flatMap<StatsChartRow>((bucket) => {
        if (providers.length === 0) {
            return source.tokenTimeAvailable
                ? [emptyTimeRow(bucket, granularity, 'projectTokens', 'tokens', 'tokens')]
                : [unavailableTimeRow(bucket, granularity, 'projectTokens', 'tokens', 'tokens', 'project token usage')];
        }
        const context = rowContext(bucket, granularity);

        return providers.map((provider) => {
            const value = tokenRows.filter((row) => (
                row.provider === provider && utcBucketStart(row.recordedAt, granularity) === bucket
            )).reduce((total, row) => total + row.totalTokens, 0);
            const tooltip = `${context.localLabel}; UTC ${context.interval}; ${provider}: ${value} tokens`;

            return {
                ...emptyTimeRow(bucket, granularity, 'projectTokens', 'tokens', 'tokens'),
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

function accountSeriesLabel(series: StatsAccountSeriesOption) {
    return `${series.provider} / ${series.limitId} / ${series.windowId}`;
}

function visibleAccountSeries(source: LoadedStatsSource, controls: StatsControls) {
    const options = buildOptions(source).accountSeries;

    return options.filter((series) => source.accountRows.filter((row) => (
        accountSeriesIdentity(row) === series.identity
        && inRange(row.recordedAt, controls)
        && row.usedPercentDelta !== null
        && row.usedPercentDelta >= 0
    )).reduce((total, row) => total + row.usedPercentDelta!, 0) > 0);
}

function comparisonAccountRows(
    source: LoadedStatsSource,
    controls: StatsControls,
    granularity: StatsShortGranularity,
    buckets: string[],
    seriesOptions: StatsAccountSeriesOption[],
): StatsChartRow[] {
    return buckets.flatMap((bucket) => {
        if (seriesOptions.length === 0) {
            return [unavailableTimeRow(bucket, granularity, 'accountUsage', 'accountUsage', 'percentagePoints', 'positive account usage')];
        }
        const context = rowContext(bucket, granularity);

        return seriesOptions.map((series) => {
            const rows = source.accountRows.filter((row) => (
                accountSeriesIdentity(row) === series.identity
                && inRange(row.recordedAt, controls)
                && utcBucketStart(row.recordedAt, granularity) === bucket
                && (row.usedPercentDelta === null || row.usedPercentDelta >= 0)
            ));
            const available = rows.some(({ usedPercentDelta }) => usedPercentDelta !== null);
            const value = rows.reduce((total, row) => total + (row.usedPercentDelta ?? 0), 0);
            const resetTimes = [...new Set(rows.map(({ resetsAt }) => resetsAt))].join(', ') || 'unavailable';
            const seriesLabel = accountSeriesLabel(series);
            const displayedValue = available ? `${value} percentage points` : 'percentage-point delta unavailable';
            const tooltip = `${context.localLabel}; UTC ${context.interval}; ${seriesLabel}; ${displayedValue}; window ${series.windowDurationMinutes} minutes; reset ${resetTimes}`;

            return {
                ...emptyTimeRow(bucket, granularity, 'accountUsage', 'accountUsage', 'percentagePoints'),
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
        });
    });
}

function comparisonActivityRows(
    source: LoadedStatsSource,
    controls: StatsControls,
    granularity: StatsShortGranularity,
    buckets: string[],
) {
    const actionRecords = source.stats.actions.filter(({ completedAt }) => inRange(completedAt, controls));

    return buckets.flatMap<StatsChartRow>((bucket) => {
        const records = actionRecords.filter(({ completedAt }) => utcBucketStart(completedAt, granularity) === bucket);
        if (records.length === 0) return [emptyTimeRow(bucket, granularity, 'activity', 'actions', 'actions')];
        const counts = new Map<string, { actionId: string; actionType: 'agent' | 'command'; agent: string | null; label: string; stackIdentity: string; stackLabel: string; value: number }>();
        for (const record of records) {
            const stackIdentity = record.actionType === 'command' ? 'command' : `agent:${record.agent ?? 'unknown'}`;
            const stackLabel = record.actionType === 'command' ? 'Command' : record.agent ?? 'Unknown agent';
            const identity = `${stackIdentity}\u0000${record.actionId}`;
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
        const context = rowContext(bucket, granularity);

        return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([identity, count]) => {
            const tooltip = `${context.localLabel}; UTC ${context.interval}; ${count.stackLabel}; ${count.label}: ${count.value} completed actions`;

            return {
                ...emptyTimeRow(bucket, granularity, 'activity', 'actions', 'actions'),
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
    });
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

function eligibleSamples(source: LoadedStatsSource, controls: StatsControls) {
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

function performanceRows(controls: StatsControls, samples: EligibleSample[]): StatsChartRow[] {
    const entityFiltered = samples.filter((sample) => {
        if (controls.performanceActionIds.length > 0 && !controls.performanceActionIds.includes(sample.actionId)) return false;
        if (controls.performanceGrouping === 'agent'
            && controls.performanceAgentIds.length > 0
            && !controls.performanceAgentIds.includes(sample.agent)) return false;
        const identity = modelIdentity(sample.agent, sample.model);
        if (controls.performanceGrouping === 'model'
            && controls.performanceModelIds.length > 0
            && !controls.performanceModelIds.includes(identity)) return false;

        return inRange(sample.completedAt, controls);
    });
    const buckets = bucketDomain(entityFiltered.map(({ completedAt }) => completedAt), controls.performanceGranularity, controls);
    const unit = controls.performanceMetric === 'duration'
        ? 'milliseconds'
        : controls.performanceMetric === 'toolCalls' ? 'toolCalls' : 'tokens';
    const rows = buckets.flatMap<StatsChartRow>((bucket) => {
        const bucketSamples = entityFiltered.filter(({ completedAt }) => (
            utcBucketStart(completedAt, controls.performanceGranularity) === bucket
        ));
        if (bucketSamples.length === 0) {
            return [emptyTimeRow(bucket, controls.performanceGranularity, 'primary', controls.performanceMetric, unit)];
        }
        const groups = new Map<string, EligibleSample[]>();
        for (const sample of bucketSamples) {
            const identity = controls.performanceGrouping === 'agent'
                ? sample.agent
                : modelIdentity(sample.agent, sample.model);
            groups.set(identity, [...(groups.get(identity) ?? []), sample]);
        }
        const context = rowContext(bucket, controls.performanceGranularity);

        return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([identity, groupSamples]) => {
            const seriesLabel = controls.performanceGrouping === 'agent'
                ? identity
                : `${groupSamples[0].agent} - ${groupSamples[0].model}`;
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
                utcBucketStart: bucket,
                value,
                windowId: null,
            } satisfies StatsChartRow;
        });
    });

    return rows;
}

function totalsRows(source: LoadedStatsSource, controls: StatsControls): StatsChartRow[] {
    const cardsById = new Map(source.cards.map((card) => [card.internalId, card]));
    const totals = new Map<string, { label: string; tooltip: string; value: number }>();
    const conversations = source.stats.conversations.filter((conversation) => {
        if (controls.totalsMetric === 'duration') {
            return TERMINAL_CONVERSATION_STATUSES.has(conversation.status)
                && conversation.completedAt !== null
                && inRange(conversation.completedAt, controls);
        }
        if (!controls.startUtc && !controls.endUtc) return true;

        return conversation.completedAt !== null && inRange(conversation.completedAt, controls);
    });
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
    const unit = controls.totalsMetric === 'duration' ? 'milliseconds' : 'tokens';

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

function ratioRows(
    source: LoadedStatsSource,
    controls: StatsControls,
    buckets: string[],
    seriesOptions: StatsAccountSeriesOption[],
    role: 'tokensPerAccountUsage' | 'actionsPerAccountUsage',
) {
    const isTokenRatio = role === 'tokensPerAccountUsage';
    const metric = isTokenRatio ? 'tokensPerAccountUsage' : 'actionsPerAccountUsage';
    const unit: StatsUnit = isTokenRatio ? 'tokensPerPercentagePoint' : 'actionsPerPercentagePoint';

    return buckets.flatMap<StatsChartRow>((bucket) => {
        const context = rowContext(bucket, controls.usageGranularity);
        const rows = seriesOptions.flatMap((series) => {
            const denominator = source.accountRows.filter((row) => (
                accountSeriesIdentity(row) === series.identity
                && inRange(row.recordedAt, controls)
                && utcBucketStart(row.recordedAt, controls.usageGranularity) === bucket
                && row.usedPercentDelta !== null
                && row.usedPercentDelta >= 0
            )).reduce((total, row) => total + row.usedPercentDelta!, 0);
            if (denominator <= 0) return [];
            const numerator = isTokenRatio
                ? source.tokenRows.filter((row) => (
                    row.provider === series.provider
                    && inRange(row.recordedAt, controls)
                    && utcBucketStart(row.recordedAt, controls.usageGranularity) === bucket
                )).reduce((total, row) => total + row.totalTokens, 0)
                : source.stats.actions.filter((action) => (
                    action.actionType === 'agent'
                    && action.agent === series.provider
                    && inRange(action.completedAt, controls)
                    && utcBucketStart(action.completedAt, controls.usageGranularity) === bucket
                )).length;
            const value = numerator / denominator;
            const seriesLabel = accountSeriesLabel(series);
            const numeratorLabel = isTokenRatio ? `${numerator} project tokens` : `${numerator} completed ${series.provider} actions`;
            const tooltip = `${context.localLabel}; UTC ${context.interval}; ${seriesLabel}; ${numeratorLabel}; ${denominator} account percentage points; ratio ${value}`;

            return [{
                ...emptyTimeRow(bucket, controls.usageGranularity, role, metric, unit),
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
        });

        return rows.length > 0
            ? rows
            : [unavailableTimeRow(bucket, controls.usageGranularity, role, metric, unit, 'positive account usage denominator')];
    });
}

function usageComparisonRows(source: LoadedStatsSource, controls: StatsControls) {
    const seriesOptions = visibleAccountSeries(source, controls);
    const visibleSeriesIdentities = new Set(seriesOptions.map(({ identity }) => identity));
    const timestamps = [
        ...source.stats.actions.map(({ completedAt }) => completedAt),
        ...source.tokenRows.map(({ recordedAt }) => recordedAt),
        ...source.accountRows.flatMap((row) => (
            visibleSeriesIdentities.has(accountSeriesIdentity(row)) && (row.usedPercentDelta === null || row.usedPercentDelta >= 0)
                ? [row.recordedAt]
                : []
        )),
    ];
    const buckets = bucketDomain(timestamps, controls.usageGranularity, controls);

    return [
        ...comparisonAccountRows(source, controls, controls.usageGranularity, buckets, seriesOptions),
        ...projectTokenRows(source, controls, controls.usageGranularity, buckets),
        ...ratioRows(source, controls, buckets, seriesOptions, 'tokensPerAccountUsage'),
        ...ratioRows(source, controls, buckets, seriesOptions, 'actionsPerAccountUsage'),
        ...comparisonActivityRows(source, controls, controls.usageGranularity, buckets),
    ];
}

function buildSnapshot(source: LoadedStatsSource, requestedControls: StatsControls): ProjectStatsSnapshot {
    const options = buildOptions(source);
    const controls = reconcileControls(requestedControls, options);
    const performance = eligibleSamples(source, controls);
    let rows: StatsChartRow[];
    if (controls.dataset === 'activityOverTime') rows = activityRows(source, controls, controls.activityGranularity);
    else if (controls.dataset === 'agentPerformance') rows = performanceRows(controls, performance.samples);
    else if (controls.dataset === 'usageComparison') rows = usageComparisonRows(source, controls);
    else rows = totalsRows(source, controls);
    const omittedTimerCount = source.stats.conversations.filter((conversation) => (
        TERMINAL_CONVERSATION_STATUSES.has(conversation.status)
        && conversation.completedAt !== null
        && inRange(conversation.completedAt, controls)
        && conversation.elapsedMs === null
    )).length;
    const excludedSampleCount = Object.values(performance.exclusionCounts).reduce((total, count) => total + count, 0);

    return {
        controls,
        error: null,
        excludedSampleCount,
        exclusionCounts: performance.exclusionCounts,
        omittedTimerCount,
        options,
        rows,
        status: 'ready',
        tokenTimeAvailable: source.tokenTimeAvailable,
        warnings: source.warnings,
    };
}

function validateRangeTimestamp(value: string | null, field: string) {
    if (value !== null && !isValidIsoTimestamp(value)) throw new Error(`Invalid stats ${field}`);
}

export class ProjectStatsService extends EventTarget {
    private abortController: AbortController | null = null;
    private readonly calculateStats: StatsCalculator;
    private loadRevision = 0;
    private binding: StatsProjectBinding | null = null;
    private cards: StatsCardDescriptor[] = [];
    private isOpen = false;
    private projectKey: string | null = null;
    private snapshot = INITIAL_SNAPSHOT;
    private source: LoadedStatsSource | null = null;

    constructor(calculateStats: StatsCalculator = calculateActivityStatsOutsideMainThread) {
        super();
        this.calculateStats = calculateStats;
    }

    getSnapshot = () => this.snapshot;

    subscribe = (listener: () => void) => {
        this.addEventListener('changed', listener);

        return () => this.removeEventListener('changed', listener);
    };

    bindProject(binding: StatsProjectBinding) {
        const projectKey = `${binding.project.id}:${binding.project.branch}`;
        if (projectKey !== this.projectKey) this.clear();
        this.projectKey = projectKey;
        this.binding = binding;
    }

    clear() {
        this.close();
        this.binding = null;
        this.projectKey = null;
    }

    async open(cards: StatsCardDescriptor[]) {
        if (!this.binding) throw new Error('Project stats are not bound to a project');
        if (this.isOpen) return;
        this.cards = cards;
        this.isOpen = true;
        this.abortController = new AbortController();
        await this.load(this.binding, this.abortController.signal);
    }

    close() {
        this.loadRevision += 1;
        this.abortController?.abort();
        this.abortController = null;
        this.cards = [];
        this.isOpen = false;
        this.source = null;
        projectUsageMetricsService.clear();
        this.publish({ ...INITIAL_SNAPSHOT, controls: this.snapshot.controls });
    }

    setControls(changes: Partial<StatsControls>) {
        const controls = { ...this.snapshot.controls, ...changes };
        validateRangeTimestamp(controls.startUtc, 'startUtc');
        validateRangeTimestamp(controls.endUtc, 'endUtc');
        if (controls.startUtc && controls.endUtc && Date.parse(controls.startUtc) > Date.parse(controls.endUtc)) {
            throw new Error('Stats start date must not be after end date');
        }
        if (!this.source) {
            this.publish({ ...this.snapshot, controls });
            return;
        }

        this.publish(buildSnapshot(this.source, controls));
    }

    private async load(binding: StatsProjectBinding, signal: AbortSignal) {
        const revision = ++this.loadRevision;
        this.publish({ ...this.snapshot, error: null, rows: [], status: 'loading' });
        try {
            const repositoryFiles = await binding.storage.listRepositoryFiles(binding.project);
            if (!this.isCurrentLoad(revision, binding, signal)) return;
            const { currentActivityPaths, releaseActivityPaths } = findStatsSourcePaths(repositoryFiles, binding.config);
            const [current, released] = await Promise.all([
                this.calculateStats(binding.storage, binding.project, currentActivityPaths, signal),
                this.loadReleasedStats(binding, repositoryFiles, releaseActivityPaths, signal),
            ]);
            if (!this.isCurrentLoad(revision, binding, signal)) return;
            const usageMetrics = await projectUsageMetricsService.load(
                binding.project,
                binding.config.projectFolder,
                binding.storage,
                repositoryFiles,
            );
            if (!this.isCurrentLoad(revision, binding, signal)) return;

            this.source = {
                accountRows: usageMetrics.accountRows,
                cards: this.cards,
                stats: mergeStats([current.stats, released.stats]),
                tokenRows: usageMetrics.tokenRows,
                tokenTimeAvailable: usageMetrics.available,
                warnings: [...current.warnings, ...released.warnings, ...usageMetrics.warnings],
            };
            this.publish(buildSnapshot(this.source, this.snapshot.controls));
        } catch (error) {
            if (!this.isCurrentLoad(revision, binding, signal)) return;
            const normalizedError = error instanceof Error ? error : new Error(String(error));
            this.source = null;
            this.publish({ ...this.snapshot, error: normalizedError, rows: [], status: 'error' });
        }
    }

    private async loadReleasedStats(
        binding: StatsProjectBinding,
        repositoryFiles: string[],
        releaseActivityPaths: Record<string, string[]>,
        signal: AbortSignal,
    ): Promise<ActivityStatsCalculationResult> {
        const statsPath = projectStatsFilePath(binding.config.projectFolder);
        const normalizedRepositoryFiles = new Set(repositoryFiles.map(normalizePath));
        let cachedReleases: Record<string, ReleaseStats> = {};
        let statsFile: Awaited<ReturnType<NonNullable<StorageService['loadTextFile']>>> | null = null;
        const warnings: string[] = [];
        if (normalizedRepositoryFiles.has(normalizePath(statsPath))) {
            if (!binding.storage.loadTextFile) throw new Error('Repository text file loading is not available');
            try {
                statsFile = await binding.storage.loadTextFile(binding.project, statsPath);
                const parsed = parseProjectStatsFile(statsFile.content, statsPath);
                cachedReleases = parsed.releases;
                warnings.push(...parsed.warnings);
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                warnings.push(`${statsPath}: ${detail}`);
            }
        }

        const releaseNames = Object.keys(releaseActivityPaths).sort((left, right) => left.localeCompare(right));
        const releases: Record<string, ReleaseStats> = {};
        let changed = Object.keys(cachedReleases).some((releaseName) => !releaseActivityPaths[releaseName]);
        for (const releaseName of releaseNames) {
            const cached = cachedReleases[releaseName];
            if (cached) {
                releases[releaseName] = cached;
                continue;
            }
            const calculated = await this.calculateStats(binding.storage, binding.project, releaseActivityPaths[releaseName], signal);
            releases[releaseName] = calculated.stats;
            warnings.push(...calculated.warnings);
            changed = true;
        }

        if (changed && !signal.aborted) {
            const content = serializeProjectStats(releases);
            const file = statsFile ? { ...statsFile, content } : { content, path: statsPath };
            try {
                await binding.storage.commit({
                    branch: binding.project.branch,
                    files: [file],
                    message: 'Update calculated release stats',
                });
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                warnings.push(`${statsPath}: could not persist calculated release stats: ${detail}`);
            }
        }

        return { stats: mergeStats(Object.values(releases)), warnings };
    }

    private isCurrentLoad(revision: number, binding: StatsProjectBinding, signal: AbortSignal) {
        return !signal.aborted && this.isOpen && revision === this.loadRevision && binding === this.binding;
    }

    private publish(snapshot: ProjectStatsSnapshot) {
        this.snapshot = snapshot;
        this.dispatchEvent(new Event('changed'));
    }
}

export const projectStatsService = register('projectStatsService', new ProjectStatsService());
