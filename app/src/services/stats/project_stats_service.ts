import { activityOriginFromPath, projectActivityFolder } from '../../../../shared/activity_paths.mjs'
import { parseActivityFileForMigration, type CardActivityFile } from '../../../../shared/card_activity.mjs'
import type {
    AgentConversation,
    ProjectConfig,
    ProjectReference,
    ProjectWatchEvent,
    StorageService,
} from '../../data/data_types'
import {
    projectUsageMetricsService,
    type UsageMetricsTokenRow,
} from '../agents/project_usage_metrics_service'
import { register } from '../service_injector'

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
    activity: CardActivityFile[]
    cards: StatsCardDescriptor[]
    tokenRows: UsageMetricsTokenRow[]
    tokenTimeAvailable: boolean
    warnings: string[]
}

interface StatsProjectBinding {
    config: ProjectConfig
    project: ProjectReference
    storage: StorageService
}

interface TimedConversation {
    actionId: string | null
    actionLabel: string | null
    cardInternalId: string | null
    cardPath: string | null
    completedAt: string | null
    elapsedMs: number | null
    status: AgentConversation['status']
    totalTokens: number
}

const TERMINAL_CONVERSATION_STATUSES = new Set(['cancelled', 'completed', 'failed'])
const COMPLETED_ACTION_STATUSES = new Set(['completed', 'okButNotAfter'])
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

function recognizedActivityPath(path: string, config: ProjectConfig) {
    const normalizedPath = normalizePath(path)
    const activityFolder = normalizePath(projectActivityFolder(config.projectFolder))
    const activityPrefix = `${activityFolder}/`
    if (normalizedPath.startsWith(activityPrefix) && !normalizedPath.slice(activityPrefix.length).includes('/')) {
        return activityOriginFromPath(normalizedPath) ? normalizedPath : null
    }
    const releasesFolder = normalizePath(config.releasesFolder)
    const releasePrefix = `${releasesFolder}/`
    if (!normalizedPath.startsWith(releasePrefix)) return null
    const releaseParts = normalizedPath.slice(releasePrefix.length).split('/')
    if (releaseParts.length !== 2 || !/^card__[^/]+\.json$/u.test(releaseParts[1])) return null

    return activityOriginFromPath(normalizedPath) ? normalizedPath : null
}

export function findStatsSourcePaths(repositoryFiles: string[], config: ProjectConfig) {
    const activityPaths = repositoryFiles
        .map((path) => recognizedActivityPath(path, config))
        .filter((path): path is string => path !== null)
        .sort((left, right) => left.localeCompare(right))
    return { activityPaths }
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

function canonicalConversations(activityFiles: CardActivityFile[]) {
    const conversations = new Map<string, TimedConversation>()
    const actionLabels = new Map<string, string>()
    for (const activity of activityFiles) {
        for (const record of activity.records) {
            if (record.type === 'system') continue
            actionLabels.set(record.rootActionId, record.rootActionLabel)
        }
        for (const conversation of activity.conversations) {
            const originIdentity = activity.origin.kind === 'card' ? `card:${activity.origin.cardInternalId}` : 'project'
            const identity = `${originIdentity}:${conversation.id}`
            if (conversations.has(identity)) continue
            const cardInternalId = conversation.cardInternalId ?? (activity.origin.kind === 'card' ? activity.origin.cardInternalId : null)
            conversations.set(identity, {
                actionId: conversation.actionId ?? null,
                actionLabel: conversation.actionId ? actionLabels.get(conversation.actionId) ?? conversation.title : null,
                cardInternalId,
                cardPath: conversation.cardPath,
                completedAt: conversation.completedAt,
                elapsedMs: conversation.timer?.elapsedMs ?? null,
                status: conversation.status,
                totalTokens: conversation.usage?.totalTokens ?? 0,
            })
        }
    }

    return [...conversations.values()]
}

function completedRecords(activityFiles: CardActivityFile[]) {
    const records = new Map<string, {
        actionId: string
        actionLabel: string
        cardInternalId: string | null
        completedAt: string
    }>()
    for (const activity of activityFiles) {
        for (const record of activity.records) {
            if (record.type === 'system' || !COMPLETED_ACTION_STATUSES.has(record.status)) continue
            const originIdentity = record.origin.kind === 'card' ? `card:${record.origin.cardInternalId}` : 'project'
            const identity = `${originIdentity}:${record.runId}`
            if (records.has(identity)) continue
            records.set(identity, {
                actionId: record.rootActionId,
                actionLabel: record.rootActionLabel,
                cardInternalId: record.origin.kind === 'card' ? record.origin.cardInternalId : null,
                completedAt: record.completedAt,
            })
        }
    }

    return [...records.values()]
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
        for (const record of completedRecords(source.activity).filter(({ completedAt }) => inRange(completedAt, controls))) {
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
    const conversations = canonicalConversations(source.activity).filter((conversation) => {
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
    const filteredConversations = canonicalConversations(source.activity).filter((conversation) => (
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
    private loadRevision = 0
    private binding: StatsProjectBinding | null = null
    private cards: StatsCardDescriptor[] = []
    private isOpen = false
    private projectKey: string | null = null
    private snapshot = INITIAL_SNAPSHOT
    private source: LoadedStatsSource | null = null

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
        this.loadRevision += 1
        this.binding = null
        this.cards = []
        this.isOpen = false
        this.projectKey = null
        this.source = null
        projectUsageMetricsService.clear()
        this.publish({ ...INITIAL_SNAPSHOT, controls: this.snapshot.controls })
    }

    async open(cards: StatsCardDescriptor[]) {
        if (!this.binding) throw new Error('Project stats are not bound to a project')
        this.cards = cards
        this.isOpen = true
        await this.load(this.binding)
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

    handleRepositoryChange(event: ProjectWatchEvent) {
        const binding = this.binding
        if (!binding || !this.isOpen) return
        const path = normalizePath(event.path)
        const usageMetricsPath = normalizePath(`${binding.config.projectFolder}/usage_metrics.csv`)
        if (path !== usageMetricsPath && !recognizedActivityPath(path, binding.config)) return

        void this.load(binding)
    }

    private async load(binding: StatsProjectBinding) {
        const revision = ++this.loadRevision
        this.publish({ ...this.snapshot, error: null, rows: [], status: 'loading' })
        try {
            const repositoryFiles = await binding.storage.listRepositoryFiles(binding.project)
            if (revision !== this.loadRevision || binding !== this.binding) return
            if (!binding.storage.loadTextFile) throw new Error('Repository text file loading is not available')
            const { activityPaths } = findStatsSourcePaths(repositoryFiles, binding.config)
            const activityFiles = await Promise.all(activityPaths.map(async (path) => {
                const file = await binding.storage.loadTextFile?.(binding.project, path)
                if (!file) throw new Error(`Activity file could not be loaded: ${path}`)
                const origin = activityOriginFromPath(path)
                if (!origin) throw new Error(`Invalid activity path: ${path}`)

                return parseActivityFileForMigration(file.content, origin)
            }))
            const usageMetrics = await projectUsageMetricsService.load(
                binding.project,
                binding.config.projectFolder,
                binding.storage,
                repositoryFiles,
            )
            if (revision !== this.loadRevision || binding !== this.binding) return

            this.source = {
                activity: activityFiles,
                cards: this.cards,
                tokenRows: usageMetrics.tokenRows,
                tokenTimeAvailable: usageMetrics.available,
                warnings: usageMetrics.warnings,
            }
            this.publish(buildSnapshot(this.source, this.snapshot.controls))
        } catch (error) {
            if (revision !== this.loadRevision || binding !== this.binding) return
            const normalizedError = error instanceof Error ? error : new Error(String(error))
            this.source = null
            this.publish({ ...this.snapshot, error: normalizedError, rows: [], status: 'error' })
        }
    }

    private publish(snapshot: ProjectStatsSnapshot) {
        this.snapshot = snapshot
        this.dispatchEvent(new Event('changed'))
    }
}

export const projectStatsService = register('projectStatsService', new ProjectStatsService())
