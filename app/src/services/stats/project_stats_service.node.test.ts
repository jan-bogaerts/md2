import { describe, expect, it, vi } from 'vitest'
import type { AgentConversation, ProjectConfig, ProjectReference, StorageService } from '../../data/data_types'
import { DEFAULT_PROJECT_CONFIG } from '../../data/data_types'
import {
    findStatsSourcePaths,
    ProjectStatsService,
    type StatsCardDescriptor,
} from './project_stats_service'
import { parseProjectStatsFile } from '../../../../shared/project_stats.mjs'

const project: ProjectReference = { branch: 'main', id: 'project' }
const config: ProjectConfig = {
    ...DEFAULT_PROJECT_CONFIG,
    actionsFolder: 'design/actions',
    archivedFolder: 'design/archived',
    projectFolder: 'design',
    releasesFolder: 'design/history',
    workingFolder: 'design/active',
}
const cards: StatsCardDescriptor[] = [{ internalId: 'card-1', path: 'design/active/F_1.md', title: 'First', visibleId: 'F_1' }]
const metricsHeader = [
    'recorded_at', 'record_type', 'provider', 'limit_id', 'window_id', 'window_duration_minutes',
    'resets_at', 'input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_tokens',
    'total_tokens', 'used_percent', 'used_percent_delta',
].join(',')

function conversation(overrides: Partial<AgentConversation> = {}): AgentConversation {
    return {
        actionId: 'review',
        cardInternalId: 'card-1',
        cardPath: 'design/active/F_1.md',
        completedAt: '2026-08-12T10:00:00.000Z',
        entries: [],
        hasExplicitTitle: false,
        id: 'conversation-1',
        path: 'unused',
        providerSessions: [],
        startedAt: '2026-08-12T09:00:00.000Z',
        status: 'completed',
        timer: { elapsedMs: 1_500, runningStartedAt: null },
        title: 'Review',
        usage: { cachedInputTokens: 2, inputTokens: 3, outputTokens: 4, reasoningTokens: 1, totalTokens: 10 },
        usageSchemaVersion: 1,
        viewed: true,
        ...overrides,
    }
}

function actionRecord(runId: string, completedAt: string, overrides: Record<string, unknown> = {}) {
    return {
        commits: [],
        completedAt,
        conversationIds: [],
        details: { command: 'review', output: '', type: 'command' },
        origin: { cardInternalId: 'card-1', kind: 'card' },
        rootActionId: 'review',
        rootActionLabel: 'Review',
        runId,
        startedAt: completedAt,
        status: 'completed',
        ...overrides,
    }
}

function activityContent(options: {
    conversations?: AgentConversation[]
    origin?: { cardInternalId: string, kind: 'card' } | { kind: 'project' }
    records?: Record<string, unknown>[]
} = {}) {
    const origin = options.origin ?? { cardInternalId: 'card-1', kind: 'card' }

    return JSON.stringify({
        actionSettings: {},
        conversations: (options.conversations ?? []).map((storedConversation) => Object.fromEntries(
            Object.entries(storedConversation).filter(([fieldName]) => fieldName !== 'path'),
        )),
        origin,
        records: options.records ?? [],
        version: 4,
    })
}

function storage(files: Record<string, string>): StorageService {
    return {
        checkoutBranch: vi.fn(),
        commit: vi.fn(async (request) => {
            for (const file of request.files) files[file.path] = file.content

            return request.files
        }),
        createProject: vi.fn(),
        deleteFile: vi.fn(),
        deleteFolder: vi.fn(),
        listBranches: vi.fn(),
        listRepositories: vi.fn(),
        listRepositoryFiles: vi.fn(async () => Object.keys(files)),
        listTopLevelFolders: vi.fn(),
        loadActionFiles: vi.fn(),
        loadProject: vi.fn(),
        loadProjectConfig: vi.fn(),
        loadProjectRoot: vi.fn(),
        loadTextFile: vi.fn(async (_project, path) => ({ content: files[path], path })),
        moveFiles: vi.fn(),
        push: vi.fn(),
        saveProjectConfig: vi.fn(),
    }
}

function metricsRow(recordedAt: string, totalTokens: number) {
    return `${recordedAt},token_usage,codex,,,,,${totalTokens - 3},1,1,1,${totalTokens},,`
}

async function openService(service: ProjectStatsService, statsStorage: StorageService, loadedCards = cards) {
    service.bindProject({ config, project, storage: statsStorage })
    await service.open(loadedCards)
}

describe('ProjectStatsService source parsing', () => {
    it('discovers only current and released activity plus project usage metrics', () => {
        expect(findStatsSourcePaths([
            'design/activity/project.json',
            'design/activity/card__card-1.json',
            'design/history/0_3_0/card__card-2.json',
            'design/history/0_3_0/project.json',
            'other/card__card-3.json',
            'design/usage_metrics.csv',
        ], config)).toEqual({
            currentActivityPaths: [
                'design/activity/card__card-1.json',
                'design/activity/project.json',
            ],
            releaseActivityPaths: { '0_3_0': ['design/history/0_3_0/card__card-2.json'] },
        })
    })

    it('migrates legacy version 3 activity while loading stats', async () => {
        const legacyActivity = JSON.parse(activityContent({records: [actionRecord('legacy-run', '2026-08-12T10:00:00.000Z')]}))
        legacyActivity.version = 3
        const service = new ProjectStatsService()

        await openService(service, storage({'design/activity/card__card-1.json': JSON.stringify(legacyActivity)}))

        expect(service.getSnapshot()).toMatchObject({ status: 'ready' })
        expect(service.getSnapshot().rows).toMatchObject([{ value: 1 }])
    })

})

describe('ProjectStatsService aggregation', () => {
    it('counts completed root runs and distinct cards while excluding project records from card count', async () => {
        const cardActivity = activityContent({
            records: [
                actionRecord('run-1', '2026-08-12T10:00:00.000Z'),
                actionRecord('run-2', '2026-08-12T11:00:00.000Z', { status: 'okButNotAfter' }),
                actionRecord('run-3', '2026-08-12T12:00:00.000Z', { status: 'failed' }),
            ],
        })
        const projectActivity = activityContent({
            origin: { kind: 'project' },
            records: [actionRecord('run-4', '2026-08-12T13:00:00.000Z', { origin: { kind: 'project' } })],
        })
        const service = new ProjectStatsService()
        await openService(service, storage({
            'design/activity/card__card-1.json': cardActivity,
            'design/activity/project.json': projectActivity,
        }))

        expect(service.getSnapshot().rows).toMatchObject([{ value: 3 }])
        service.setControls({ activityMetric: 'cards' })
        expect(service.getSnapshot().rows).toMatchObject([{ value: 1 }])
    })

    it('sums terminal stored timers and tokens once while reporting missing timer coverage', async () => {
        const service = new ProjectStatsService()
        await openService(service, storage({
            'design/activity/card__card-1.json': activityContent({
                conversations: [
                    conversation(),
                    conversation({ id: 'conversation-2', status: 'failed', timer: { elapsedMs: 500, runningStartedAt: null } }),
                    conversation({id: 'conversation-3', status: 'cancelled', timer: undefined, usage: {cachedInputTokens: 0, inputTokens: 0, legacyTotalTokens: 7, outputTokens: 0, reasoningTokens: 0, totalTokens: 7}}),
                    conversation({ completedAt: null, id: 'conversation-4', status: 'running', timer: { elapsedMs: 800, runningStartedAt: '2026-08-12T10:00:00.000Z' } }),
                ],
            }),
        }))
        service.setControls({ dataset: 'totals', totalsGrouping: 'card', totalsMetric: 'duration' })

        expect(service.getSnapshot().rows).toMatchObject([{ identity: 'card-1', value: 2_000 }])
        expect(service.getSnapshot().omittedTimerCount).toBe(1)
        service.setControls({ totalsGrouping: 'action', totalsMetric: 'tokens' })
        expect(service.getSnapshot().rows).toMatchObject([{ identity: 'review', value: 37 }])
    })

    it('uses metrics deltas for UTC day, ISO-week, and month token buckets', async () => {
        const service = new ProjectStatsService()
        const metrics = [
            metricsHeader,
            metricsRow('2026-08-02T23:30:00.000Z', 5),
            metricsRow('2026-08-03T00:30:00.000Z', 7),
            metricsRow('2026-09-01T00:00:00.000Z', 9),
        ].join('\r\n')
        await openService(service, storage({ 'design/usage_metrics.csv': metrics }))
        service.setControls({ activityMetric: 'tokens', granularity: 'week' })
        expect(service.getSnapshot().rows.map(({ utcBucketStart, value }) => [utcBucketStart, value])).toEqual([
            ['2026-07-27T00:00:00.000Z', 5],
            ['2026-08-03T00:00:00.000Z', 7],
            ['2026-08-31T00:00:00.000Z', 9],
        ])
        service.setControls({ granularity: 'month' })
        expect(service.getSnapshot().rows.map(({ utcBucketStart, value }) => [utcBucketStart, value])).toEqual([
            ['2026-08-01T00:00:00.000Z', 12],
            ['2026-09-01T00:00:00.000Z', 9],
        ])
        service.setControls({ endUtc: '2026-08-31T23:59:59.999Z', startUtc: '2026-08-03T00:00:00.000Z' })
        expect(service.getSnapshot().rows.map(({ utcBucketStart, value }) => [utcBucketStart, value])).toEqual([
            ['2026-08-01T00:00:00.000Z', 7],
        ])
    })

    it('treats missing metrics as unavailable and skips malformed activity with a path warning', async () => {
        const service = new ProjectStatsService()
        await openService(service, storage({}))
        expect(service.getSnapshot()).toMatchObject({ status: 'ready', tokenTimeAvailable: false })

        service.close()
        await openService(service, storage({ 'design/activity/card__card-1.json': '{broken' }))
        expect(service.getSnapshot().status).toBe('ready')
        expect(service.getSnapshot().rows).toEqual([])
        expect(service.getSnapshot().warnings).toEqual([expect.stringContaining('design/activity/card__card-1.json')])
    })

    it('unloads on close and prevents a late result from publishing', async () => {
        let releaseFirstList: () => void = () => undefined
        const firstStorage = storage({ 'design/activity/card__card-1.json': activityContent({ records: [actionRecord('old', '2026-08-12T10:00:00.000Z')] }) })
        firstStorage.listRepositoryFiles = vi.fn(async () => {
            await new Promise<void>((resolve) => {
                releaseFirstList = resolve
            })
            return ['design/activity/card__card-1.json']
        })
        const service = new ProjectStatsService()
        service.bindProject({ config, project, storage: firstStorage })
        const firstLoad = service.open(cards)
        service.close()
        releaseFirstList()
        await firstLoad

        expect(service.getSnapshot()).toMatchObject({ rows: [], status: 'idle' })
    })

    it('loads once per session and performs one fresh load after reopening', async () => {
        const files = {'design/activity/card__card-1.json': activityContent({ records: [actionRecord('run-1', '2026-08-12T10:00:00.000Z')] })}
        const statsStorage = storage(files)
        const service = new ProjectStatsService()
        await openService(service, statsStorage)
        const listRepositoryFiles = vi.mocked(statsStorage.listRepositoryFiles)

        await service.open(cards)
        expect(listRepositoryFiles).toHaveBeenCalledTimes(1)

        files['design/activity/card__card-1.json'] = activityContent({
            records: [
                actionRecord('run-1', '2026-08-12T10:00:00.000Z'),
                actionRecord('run-2', '2026-08-12T11:00:00.000Z'),
            ],
        })
        await service.open(cards)
        expect(listRepositoryFiles).toHaveBeenCalledTimes(1)
        service.close()
        await service.open(cards)
        expect(listRepositoryFiles).toHaveBeenCalledTimes(2)
        expect(service.getSnapshot().rows).toMatchObject([{ value: 2 }])
    })

    it('migrates released activity once and reuses calculated facts', async () => {
        const releasePath = 'design/history/v1/card__card-1.json'
        const files = { [releasePath]: activityContent({ records: [actionRecord('released', '2026-08-12T10:00:00.000Z')] }) }
        const statsStorage = storage(files)
        const service = new ProjectStatsService()

        await openService(service, statsStorage)
        expect(service.getSnapshot().rows).toMatchObject([{ value: 1 }])
        expect(statsStorage.commit).toHaveBeenCalledWith(expect.objectContaining({ message: 'Update calculated release stats' }))
        service.close()
        vi.mocked(statsStorage.loadTextFile!).mockClear()

        await service.open(cards)

        expect(service.getSnapshot().rows).toMatchObject([{ value: 1 }])
        expect(statsStorage.loadTextFile).not.toHaveBeenCalledWith(project, releasePath)
    })

    it('reconciles renamed and removed release folders on next session', async () => {
        const firstPath = 'design/history/v1/card__card-1.json'
        const secondPath = 'design/history/v2/card__card-1.json'
        const files: Record<string, string> = {[firstPath]: activityContent({ records: [actionRecord('released', '2026-08-12T10:00:00.000Z')] })}
        const statsStorage = storage(files)
        const service = new ProjectStatsService()
        await openService(service, statsStorage)
        files[secondPath] = files[firstPath]
        delete files[firstPath]
        service.close()

        await service.open(cards)

        const migrationCommit = vi.mocked(statsStorage.commit).mock.calls.at(-1)?.[0]
        if (!migrationCommit) throw new Error('Missing stats migration commit')
        const parsed = parseProjectStatsFile(migrationCommit.files[0].content, 'design/project_stats.json')
        expect(Object.keys(parsed.releases)).toEqual(['v2'])
    })
})
