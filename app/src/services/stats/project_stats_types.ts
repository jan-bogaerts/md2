import type { ReleaseStats } from '../../../../shared/project_stats.mjs';
import type { ProjectConfig, ProjectReference, StorageService } from '../../data/data_types';
import type { UsageMetricsAccountRow, UsageMetricsTokenRow } from '../agents/project_usage_metrics_service';
import type { AgentProfile } from '../../data/agent_profiles';

export type StatsDataset = 'activityOverTime' | 'agentPerformance' | 'usageComparison' | 'totals';
export type StatsGranularity = 'day' | 'week' | 'month';
export type StatsShortGranularity = Exclude<StatsGranularity, 'month'>;
export type StatsActivityMetric = 'cards' | 'actions' | 'tokens';
export type StatsPerformanceMetric = 'duration' | 'tokens' | 'toolCalls';
export type StatsPerformanceAggregation = 'average' | 'averageWithDeviation' | 'median' | 'sum';
export type StatsPerformanceGrouping = 'agent' | 'model';
export type StatsTotalsGrouping = 'card' | 'action';
export type StatsTotalsMetric = 'cost' | 'duration' | 'tokens';
export type StatsStatus = 'idle' | 'loading' | 'ready' | 'error';
export type StatsChartRole =
    | 'primary'
    | 'activity'
    | 'projectTokensAverage'
    | 'projectTokensTotal'
    | 'accountUsage'
    | 'costPerActionAverage'
    | 'costPerAgent'
    | 'tokensPerAccountUsage'
    | 'tokensPerDollar'
    | 'actionsPerAccountUsage';
export type StatsUnit =
    | 'actions'
    | 'actionsPerPercentagePoint'
    | 'cards'
    | 'dollars'
    | 'milliseconds'
    | 'percent'
    | 'tokens'
    | 'tokensPerDollar'
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
    performanceAggregation: StatsPerformanceAggregation;
    performanceAgentIds: string[];
    performanceGranularity: StatsShortGranularity;
    performanceGrouping: StatsPerformanceGrouping;
    performanceMetric: StatsPerformanceMetric;
    performanceModelIds: string[];
    releaseIdentity: string;
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
    aggregation: string | null;
    accessibleLabel: string;
    agent: string | null;
    available: boolean;
    chartRole: StatsChartRole;
    displayLabel: string;
    grouping: string;
    identity: string;
    denominator: number | null;
    deviation: number | null;
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

export interface StatsReleaseOption extends StatsOption {
    releaseName: string | null;
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
    releases: StatsReleaseOption[];
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

/** Fully loaded, immutable input every dataset aggregator reads. */
export interface LoadedStatsSource {
    accountRows: UsageMetricsAccountRow[];
    agentProfiles: AgentProfile[];
    cards: StatsCardDescriptor[];
    currentStats: ReleaseStats;
    releaseStats: Record<string, ReleaseStats>;
    tokenRows: UsageMetricsTokenRow[];
    tokenTimeAvailable: boolean;
    warnings: string[];
}

export type StatsDatasetSource = Omit<LoadedStatsSource, 'currentStats' | 'releaseStats'> & { stats: ReleaseStats };

export interface StatsProjectBinding {
    config: ProjectConfig;
    project: ProjectReference;
    storage: StorageService;
}

export const TERMINAL_CONVERSATION_STATUSES = new Set(['cancelled', 'completed', 'failed']);
export const CURRENT_RELEASE_IDENTITY = 'current-release';
export const EMPTY_OPTIONS: StatsOptions = {accountSeries: [], actions: [], agents: [], models: [], releases: []};
export const INITIAL_CONTROLS: StatsControls = {
    activityGranularity: 'day',
    activityMetric: 'actions',
    dataset: 'activityOverTime',
    endUtc: null,
    performanceActionIds: [],
    performanceAggregation: 'average',
    performanceAgentIds: [],
    performanceGranularity: 'day',
    performanceGrouping: 'agent',
    performanceMetric: 'duration',
    performanceModelIds: [],
    releaseIdentity: CURRENT_RELEASE_IDENTITY,
    startUtc: null,
    totalsGrouping: 'card',
    totalsMetric: 'duration',
    usageGranularity: 'day',
};
export const INITIAL_SNAPSHOT: ProjectStatsSnapshot = {
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
