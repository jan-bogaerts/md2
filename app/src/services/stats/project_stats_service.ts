import { activityOriginFromPath, projectActivityFolder } from '../../../../shared/activity_paths.mjs'
import {
    parseProjectStatsFile,
    projectStatsFilePath,
    serializeProjectStats,
    type ActivityStatsCalculationResult,
    type ReleaseStats,
} from '../../../../shared/project_stats.mjs'
import type {
    ProjectConfig,
    ProjectReference,
    StorageService,
} from '../../data/data_types'
import {
    projectUsageMetricsService,
    type UsageMetricsTokenRow,
} from '../agents/project_usage_metrics_service'
import { register } from '../service_injector'
import { calculateActivityStatsOutsideMainThread } from './project_stats_worker_client'

export type StatsDataset = 'activityOverTime' | 'totals'
export type StatsGranularity = 'day' | 'week' | 'month'
export type StatsActivityMetric = 'cards' | 'actions' | 'tokens'
export type StatsTotalsGrouping = 'card' | 'action'
export type StatsTotalsMetric = 'duration' | 'tokens'
export type StatsStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface StatsControls {
    activityMetric: StatsActivityMetric
    dataset: StatsDataset
    endUtc: string | null
    granularity: StatsGranularity
    startUtc: string | null
    totalsGrouping: StatsTotalsGrouping
    totalsMetric: StatsTotalsMetric
}

export interface StatsChartRow {
    displayLabel: string
    grouping: string
    identity: string
    metric: string
    unit: 'actions' | 'cards' | 'milliseconds' | 'tokens'
    utcBucketStart: string | null
    value: number
}

export interface StatsCardDescriptor {
    internalId: string
    path: string
    title: string
    visibleId: string
}

export interface ProjectStatsSnapshot {
    controls: StatsControls
    error: Error | null
    omittedTimerCount: number
    rows: StatsChartRow[]
    status: StatsStatus
    tokenTimeAvailable: boolean
    warnings: string[]
}

interface LoadedStatsSource {
    cards: StatsCardDescriptor[]
    stats: ReleaseStats
    tokenRows: UsageMetricsTokenRow[]
    tokenTimeAvailable: boolean
    warnings: string[]
}

interface StatsProjectBinding {
    config: ProjectConfig
    project: ProjectReference
    storage: StorageService
}

type StatsCalculator = (
    storage: StorageService,
    project: ProjectReference,
    paths: string[],
    signal: AbortSignal,
) => Promise<ActivityStatsCalculationResult>

const TERMINAL_CONVERSATION_STATUSES = new Set(['cancelled', 'completed', 'failed'])
const INITIAL_CONTROLS: StatsControls = {
    activityMetric: 'actions',
    dataset: 'activityOverTime',
    endUtc: null,
    granularity: 'day',
    startUtc: null,
    totalsGrouping: 'card',
    totalsMetric: 'duration',
}
const INITIAL_SNAPSHOT: ProjectStatsSnapshot = {
    controls: INITIAL_CONTROLS,
    error: null,
    omittedTimerCount: 0,
    rows: [],
    status: 'idle',
    tokenTimeAvailable: false,
    warnings: [],
}

function normalizePath(path: string) {
    return path.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
}

function isValidIsoTimestamp(value: string) {
    const milliseconds = Date.parse(value)

    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
}

function recognizedCurrentActivityPath(path: string, config: ProjectConfig) {
    const normalizedPath = normalizePath(path)
    const activityFolder = normalizePath(projectActivityFolder(config.projectFolder))
    const activityPrefix = `${activityFolder}/`
    if (normalizedPath.startsWith(activityPrefix) && !normalizedPath.slice(activityPrefix.length).includes('/')) {
        return activityOriginFromPath(normalizedPath) ? normalizedPath : null
    }
    return null
}

export function findStatsSourcePaths(repositoryFiles: string[], config: ProjectConfig) {
    const currentActivityPaths = repositoryFiles
        .map((path) => recognizedCurrentActivityPath(path, config))
        .filter((path): path is string => path !== null)
        .sort((left, right) => left.localeCompare(right))
    const releaseActivityPaths: Record<string, string[]> = {}
    const releasesFolder = normalizePath(config.releasesFolder)
    const releasePrefix = `${releasesFolder}/`
    for (const path of repositoryFiles.map(normalizePath)) {
        if (!path.startsWith(releasePrefix)) continue
        const releaseParts = path.slice(releasePrefix.length).split('/')
        if (releaseParts.length < 2 || releaseParts[0].length === 0) continue
        const releaseName = releaseParts[0]
        releaseActivityPaths[releaseName] ??= []
        if (releaseParts.length !== 2 || !/^card__[^/]+\.json$/u.test(releaseParts[1]) || !activityOriginFromPath(path)) continue
        releaseActivityPaths[releaseName] = [...(releaseActivityPaths[releaseName] ?? []), path]
    }
    for (const paths of Object.values(releaseActivityPaths)) paths.sort((left, right) => left.localeCompare(right))

    return { currentActivityPaths, releaseActivityPaths }
}

function utcBucketStart(timestamp: string, granularity: StatsGranularity) {
    const date = new Date(timestamp)
    date.setUTCHours(0, 0, 0, 0)
    if (granularity === 'week') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
    if (granularity === 'month') date.setUTCDate(1)

    return date.toISOString()
}

function localBucketLabel(utcTimestamp: string) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(utcTimestamp))
}

function inRange(timestamp: string, controls: StatsControls) {
    const milliseconds = Date.parse(timestamp)
    if (controls.startUtc && milliseconds < Date.parse(controls.startUtc)) return false
    if (controls.endUtc && milliseconds > Date.parse(controls.endUtc)) return false

    return true
}

function cardLabel(cardInternalId: string, cardPath: string | null, cardsById: Map<string, StatsCardDescriptor>) {
    const card = cardsById.get(cardInternalId)
    if (card) return `${card.visibleId}: ${card.title}`

    return cardPath ?? cardInternalId
}

function actionLabel(actionId: string, storedLabel: string | null) {
    return storedLabel && storedLabel !== actionId ? `${storedLabel} (${actionId})` : actionId
}

function mergeStats(statsSources: ReleaseStats[]) {
    const actions = new Map(statsSources.flatMap(({ actions: sourceActions }) => sourceActions.map((action) => [action.identity, action])))
    const conversations = new Map(statsSources.flatMap(({ conversations: sourceConversations }) => (
        sourceConversations.map((conversation) => [conversation.identity, conversation])
    )))

    return { actions: [...actions.values()], conversations: [...conversations.values()] }
}

function activityRows(source: LoadedStatsSource, controls: StatsControls): StatsChartRow[] {
    const buckets = new Map<string, { actionCount: number, cards: Set<string>, tokens: number }>()
    if (controls.activityMetric === 'tokens') {
        for (const row of source.tokenRows.filter(({ recordedAt }) => inRange(recordedAt, controls))) {
            const bucket = utcBucketStart(row.recordedAt, controls.granularity)
            const current = buckets.get(bucket) ?? { actionCount: 0, cards: new Set<string>(), tokens: 0 }
            current.tokens += row.totalTokens
            buckets.set(bucket, current)
        }
    } else {
        for (const record of source.stats.actions.filter(({ completedAt }) => inRange(completedAt, controls))) {
            const bucket = utcBucketStart(record.completedAt, controls.granularity)
            const current = buckets.get(bucket) ?? { actionCount: 0, cards: new Set<string>(), tokens: 0 }
            current.actionCount += 1
            if (record.cardInternalId) current.cards.add(record.cardInternalId)
            buckets.set(bucket, current)
        }
    }
    const unit = controls.activityMetric

    return [...buckets.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([bucket, values]) => ({
            displayLabel: localBucketLabel(bucket),
            grouping: controls.granularity,
            identity: bucket,
            metric: controls.activityMetric,
            unit,
            utcBucketStart: bucket,
            value: controls.activityMetric === 'cards'
                ? values.cards.size
                : controls.activityMetric === 'actions' ? values.actionCount : values.tokens,
        }))
}

function totalsRows(source: LoadedStatsSource, controls: StatsControls): StatsChartRow[] {
    const cardsById = new Map(source.cards.map((card) => [card.internalId, card]))
    const totals = new Map<string, { label: string, value: number }>()
    const conversations = source.stats.conversations.filter((conversation) => {
        if (controls.totalsMetric === 'duration') {
            return TERMINAL_CONVERSATION_STATUSES.has(conversation.status)
                && conversation.completedAt !== null
                && inRange(conversation.completedAt, controls)
        }
        if (!controls.startUtc && !controls.endUtc) return true

        return conversation.completedAt !== null && inRange(conversation.completedAt, controls)
    })
    for (const conversation of conversations) {
        const identity = controls.totalsGrouping === 'card' ? conversation.cardInternalId : conversation.actionId
        if (!identity) continue
        const label = controls.totalsGrouping === 'card'
            ? cardLabel(identity, conversation.cardPath, cardsById)
            : actionLabel(identity, conversation.actionLabel)
        const value = controls.totalsMetric === 'duration' ? conversation.elapsedMs : conversation.totalTokens
        if (value === null) continue
        const current = totals.get(identity)
        totals.set(identity, { label, value: (current?.value ?? 0) + value })
    }
    const unit = controls.totalsMetric === 'duration' ? 'milliseconds' : 'tokens'

    return [...totals.entries()]
        .map(([identity, { label, value }]) => ({
            displayLabel: label,
            grouping: controls.totalsGrouping,
            identity,
            metric: controls.totalsMetric,
            unit,
            utcBucketStart: null,
            value,
        } as StatsChartRow))
        .sort((left, right) => right.value - left.value || left.displayLabel.localeCompare(right.displayLabel))
}

function buildSnapshot(source: LoadedStatsSource, controls: StatsControls): ProjectStatsSnapshot {
    const filteredConversations = source.stats.conversations.filter((conversation) => (
        TERMINAL_CONVERSATION_STATUSES.has(conversation.status)
        && conversation.completedAt !== null
        && inRange(conversation.completedAt, controls)
    ))
    const omittedTimerCount = filteredConversations.filter(({ elapsedMs }) => elapsedMs === null).length
    const rows = controls.dataset === 'activityOverTime' ? activityRows(source, controls) : totalsRows(source, controls)

    return {
        controls,
        error: null,
        omittedTimerCount,
        rows,
        status: 'ready',
        tokenTimeAvailable: source.tokenTimeAvailable,
        warnings: source.warnings,
    }
}

function validateRangeTimestamp(value: string | null, field: string) {
    if (value !== null && !isValidIsoTimestamp(value)) throw new Error(`Invalid stats ${field}`)
}

export class ProjectStatsService extends EventTarget {
    private abortController: AbortController | null = null
    private readonly calculateStats: StatsCalculator
    private loadRevision = 0
    private binding: StatsProjectBinding | null = null
    private cards: StatsCardDescriptor[] = []
    private isOpen = false
    private projectKey: string | null = null
    private snapshot = INITIAL_SNAPSHOT
    private source: LoadedStatsSource | null = null

    constructor(calculateStats: StatsCalculator = calculateActivityStatsOutsideMainThread) {
        super()
        this.calculateStats = calculateStats
    }

    getSnapshot = () => this.snapshot

    subscribe = (listener: () => void) => {
        this.addEventListener('changed', listener)

        return () => this.removeEventListener('changed', listener)
    }

    bindProject(binding: StatsProjectBinding) {
        const projectKey = `${binding.project.id}:${binding.project.branch}`
        if (projectKey !== this.projectKey) this.clear()
        this.projectKey = projectKey
        this.binding = binding
    }

    clear() {
        this.close()
        this.binding = null
        this.projectKey = null
    }

    async open(cards: StatsCardDescriptor[]) {
        if (!this.binding) throw new Error('Project stats are not bound to a project')
        if (this.isOpen) return
        this.cards = cards
        this.isOpen = true
        this.abortController = new AbortController()
        await this.load(this.binding, this.abortController.signal)
    }

    close() {
        this.loadRevision += 1
        this.abortController?.abort()
        this.abortController = null
        this.cards = []
        this.isOpen = false
        this.source = null
        projectUsageMetricsService.clear()
        this.publish({ ...INITIAL_SNAPSHOT, controls: this.snapshot.controls })
    }

    setControls(changes: Partial<StatsControls>) {
        const controls = { ...this.snapshot.controls, ...changes }
        validateRangeTimestamp(controls.startUtc, 'startUtc')
        validateRangeTimestamp(controls.endUtc, 'endUtc')
        if (controls.startUtc && controls.endUtc && Date.parse(controls.startUtc) > Date.parse(controls.endUtc)) {
            throw new Error('Stats start date must not be after end date')
        }
        if (!this.source) {
            this.publish({ ...this.snapshot, controls })
            return
        }

        this.publish(buildSnapshot(this.source, controls))
    }

    private async load(binding: StatsProjectBinding, signal: AbortSignal) {
        const revision = ++this.loadRevision
        this.publish({ ...this.snapshot, error: null, rows: [], status: 'loading' })
        try {
            const repositoryFiles = await binding.storage.listRepositoryFiles(binding.project)
            if (!this.isCurrentLoad(revision, binding, signal)) return
            const { currentActivityPaths, releaseActivityPaths } = findStatsSourcePaths(repositoryFiles, binding.config)
            const [current, released] = await Promise.all([
                this.calculateStats(binding.storage, binding.project, currentActivityPaths, signal),
                this.loadReleasedStats(binding, repositoryFiles, releaseActivityPaths, signal),
            ])
            if (!this.isCurrentLoad(revision, binding, signal)) return
            const usageMetrics = await projectUsageMetricsService.load(
                binding.project,
                binding.config.projectFolder,
                binding.storage,
                repositoryFiles,
            )
            if (!this.isCurrentLoad(revision, binding, signal)) return

            this.source = {
                cards: this.cards,
                stats: mergeStats([current.stats, released.stats]),
                tokenRows: usageMetrics.tokenRows,
                tokenTimeAvailable: usageMetrics.available,
                warnings: [...current.warnings, ...released.warnings, ...usageMetrics.warnings],
            }
            this.publish(buildSnapshot(this.source, this.snapshot.controls))
        } catch (error) {
            if (!this.isCurrentLoad(revision, binding, signal)) return
            const normalizedError = error instanceof Error ? error : new Error(String(error))
            this.source = null
            this.publish({ ...this.snapshot, error: normalizedError, rows: [], status: 'error' })
        }
    }

    private async loadReleasedStats(
        binding: StatsProjectBinding,
        repositoryFiles: string[],
        releaseActivityPaths: Record<string, string[]>,
        signal: AbortSignal,
    ): Promise<ActivityStatsCalculationResult> {
        const statsPath = projectStatsFilePath(binding.config.projectFolder)
        const normalizedRepositoryFiles = new Set(repositoryFiles.map(normalizePath))
        let cachedReleases: Record<string, ReleaseStats> = {}
        let statsFile: Awaited<ReturnType<NonNullable<StorageService['loadTextFile']>>> | null = null
        const warnings: string[] = []
        if (normalizedRepositoryFiles.has(normalizePath(statsPath))) {
            if (!binding.storage.loadTextFile) throw new Error('Repository text file loading is not available')
            try {
                statsFile = await binding.storage.loadTextFile(binding.project, statsPath)
                const parsed = parseProjectStatsFile(statsFile.content, statsPath)
                cachedReleases = parsed.releases
                warnings.push(...parsed.warnings)
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error)
                warnings.push(`${statsPath}: ${detail}`)
            }
        }

        const releaseNames = Object.keys(releaseActivityPaths).sort((left, right) => left.localeCompare(right))
        const releases: Record<string, ReleaseStats> = {}
        let changed = Object.keys(cachedReleases).some((releaseName) => !releaseActivityPaths[releaseName])
        for (const releaseName of releaseNames) {
            const cached = cachedReleases[releaseName]
            if (cached) {
                releases[releaseName] = cached
                continue
            }
            const calculated = await this.calculateStats(
                binding.storage,
                binding.project,
                releaseActivityPaths[releaseName],
                signal,
            )
            releases[releaseName] = calculated.stats
            warnings.push(...calculated.warnings)
            changed = true
        }

        if (changed && !signal.aborted) {
            const content = serializeProjectStats(releases)
            const file = statsFile ? { ...statsFile, content } : { content, path: statsPath }
            try {
                await binding.storage.commit({
                    branch: binding.project.branch,
                    files: [file],
                    message: 'Update calculated release stats',
                })
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error)
                warnings.push(`${statsPath}: could not persist calculated release stats: ${detail}`)
            }
        }

        return { stats: mergeStats(Object.values(releases)), warnings }
    }

    private isCurrentLoad(revision: number, binding: StatsProjectBinding, signal: AbortSignal) {
        return !signal.aborted && this.isOpen && revision === this.loadRevision && binding === this.binding
    }

    private publish(snapshot: ProjectStatsSnapshot) {
        this.snapshot = snapshot
        this.dispatchEvent(new Event('changed'))
    }
}

export const projectStatsService = register('projectStatsService', new ProjectStatsService())
