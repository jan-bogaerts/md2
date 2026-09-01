import { activityOriginFromPath, projectActivityFolder } from '../../../../shared/activity_paths.mjs';
import {
    parseProjectStatsFile,
    projectStatsFilePath,
    serializeProjectStats,
    type ActivityStatsCalculationResult,
    type ReleaseStats,
} from '../../../../shared/project_stats.mjs';
import type { ProjectConfig, ProjectReference, StorageService } from '../../data/data_types';
import { projectUsageMetricsService } from '../agents/project_usage_metrics_service';
import type { LoadedStatsSource, StatsCardDescriptor, StatsProjectBinding } from './project_stats_types';
import { calculateActivityStatsOutsideMainThread } from './project_stats_worker_client';

const RELEASE_STATS_COMMIT_MESSAGE = 'Update calculated release stats';

interface ReleasedStatsResult {
    releaseStats: Record<string, ReleaseStats>;
    warnings: string[];
}

export type StatsCalculator = (
    storage: StorageService,
    project: ProjectReference,
    paths: string[],
    signal: AbortSignal,
) => Promise<ActivityStatsCalculationResult>;

function normalizePath(path: string) {
    return path.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '');
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

/** Splits repository files into current activity files and per-release activity files. */
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
        if (releaseParts.length !== 2 || !activityOriginFromPath(path)) continue;
        releaseActivityPaths[releaseName] = [...(releaseActivityPaths[releaseName] ?? []), path];
    }
    for (const paths of Object.values(releaseActivityPaths)) paths.sort((left, right) => left.localeCompare(right));

    return { currentActivityPaths, releaseActivityPaths };
}

/** Deduplicates facts by canonical identity so a conversation counted in two sources counts once. */
export function mergeStats(statsSources: ReleaseStats[]): ReleaseStats {
    const actions = new Map(statsSources.flatMap(({ actions }) => actions.map((action) => [action.identity, action])));
    const conversations = new Map(statsSources.flatMap(({ conversations }) => (
        conversations.map((conversation) => [conversation.identity, conversation])
    )));

    return { actions: [...actions.values()], conversations: [...conversations.values()] };
}

/**
 * Owns stats source discovery, the released-stat cache, and cache persistence.
 * Awaits are guarded by the caller's `isCurrent` check so a closed session stops before touching shared services.
 */
export class ProjectStatsLoader {
    private readonly calculateStats: StatsCalculator;

    constructor(calculateStats: StatsCalculator = calculateActivityStatsOutsideMainThread) {
        this.calculateStats = calculateStats;
    }

    /** Returns the fully loaded source, or null when the session was closed or superseded mid-load. */
    async loadSource(
        binding: StatsProjectBinding,
        cards: StatsCardDescriptor[],
        signal: AbortSignal,
        isCurrent: () => boolean,
    ): Promise<Omit<LoadedStatsSource, 'agentProfiles'> | null> {
        const repositoryFiles = await binding.storage.listRepositoryFiles(binding.project);
        if (!isCurrent()) return null;
        const { currentActivityPaths, releaseActivityPaths } = findStatsSourcePaths(repositoryFiles, binding.config);
        const [current, released] = await Promise.all([
            this.calculateStats(binding.storage, binding.project, currentActivityPaths, signal),
            this.loadReleasedStats(binding, repositoryFiles, releaseActivityPaths, signal),
        ]);
        if (!isCurrent()) return null;
        const usageMetrics = await projectUsageMetricsService.load(
            binding.project,
            binding.config.projectFolder,
            binding.storage,
            repositoryFiles,
        );
        if (!isCurrent()) return null;

        return {
            accountRows: usageMetrics.accountRows,
            cards,
            currentStats: current.stats,
            releaseStats: released.releaseStats,
            tokenRows: usageMetrics.tokenRows,
            tokenTimeAvailable: usageMetrics.available,
            warnings: [...current.warnings, ...released.warnings, ...usageMetrics.warnings],
        };
    }

    private async loadReleasedStats(
        binding: StatsProjectBinding,
        repositoryFiles: string[],
        releaseActivityPaths: Record<string, string[]>,
        signal: AbortSignal,
    ): Promise<ReleasedStatsResult> {
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
                await binding.storage.commit({ branch: binding.project.branch, files: [file], message: RELEASE_STATS_COMMIT_MESSAGE });
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                warnings.push(`${statsPath}: could not persist calculated release stats: ${detail}`);
            }
        }

        return { releaseStats: releases, warnings };
    }
}
