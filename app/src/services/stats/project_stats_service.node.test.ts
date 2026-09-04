import { describe, expect, it, vi } from 'vitest'
import type { AgentConversation, ProjectConfig, ProjectReference, StorageService } from '../../data/data_types'
import { DEFAULT_PROJECT_CONFIG } from '../../data/data_types'
import { findStatsSourcePaths } from './project_stats_loader'
import { ProjectStatsService } from './project_stats_service'
import { formatDollars } from './stats_tooltip'
import type { StatsCardDescriptor } from './project_stats_types'
import { parseProjectStatsFile } from '../../../../shared/project_stats.mjs'
import { BUILTIN_AGENT_PROFILES, type AgentProfile } from '../../data/agent_profiles'
import { completedReleaseIdentity } from './stats_options'

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

function agentRecord(
    runId: string,
    completedAt: string,
    rootConversationId: string,
    overrides: Record<string, unknown> = {},
) {
    return actionRecord(runId, completedAt, {
        conversationIds: [rootConversationId],
        details: { agent: 'codex', model: 'gpt-5', type: 'agent' },
        rootConversationId,
        ...overrides,
    })
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

async function openService(
    service: ProjectStatsService,
    statsStorage: StorageService,
    loadedCards = cards,
    agentProfiles: AgentProfile[] = BUILTIN_AGENT_PROFILES,
) {
    service.bindProject({ config, project, storage: statsStorage })
    await service.open(loadedCards, agentProfiles)
}

describe('ProjectStatsService source parsing', () => {
    it('discovers current and released card and project activity plus project usage metrics', () => {
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
            releaseActivityPaths: {'0_3_0': ['design/history/0_3_0/card__card-2.json', 'design/history/0_3_0/project.json']},
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

    it('defaults token numbers to the shortened format', () => {
        expect(new ProjectStatsService().getSnapshot().controls.shortTokenCounts).toBe(true)
    })

    it('switches the token number format without rebuilding the snapshot rows', async () => {
        const service = new ProjectStatsService()
        await openService(service, storage({'design/activity/card__card-1.json': activityContent({ conversations: [conversation()] })}))
        const rowsBefore = service.getSnapshot().rows

        service.setControls({ shortTokenCounts: false })

        // A display-only control keeps the very same rows array, proving no rebuild ran.
        expect(service.getSnapshot().controls.shortTokenCounts).toBe(false)
        expect(service.getSnapshot().rows).toBe(rowsBefore)
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

    it('prices one bar per card from the longest account window and names the agent in the legend', async () => {
        const storedConversation = conversation()
        const records = [agentRecord('run-1', '2026-08-12T10:00:00.000Z', storedConversation.id)]
        const metrics = [
            metricsHeader,
            metricsRow('2026-08-12T09:00:00.000Z', 1_000),
            '2026-08-12T10:30:00.000Z,account_usage,codex,codex_bengalfox,secondary,10080,2026-08-17T00:00:00.000Z,,,,,,0,0',
            '2026-08-12T11:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T00:00:00.000Z,,,,,,50,10',
            '2026-08-12T12:00:00.000Z,account_usage,codex,session,window-b,300,2026-08-12T17:00:00.000Z,,,,,,40,20',
        ].join('\r\n')
        const agentProfiles = BUILTIN_AGENT_PROFILES.map((profile) => (
            profile.name === 'codex' ? { ...profile, monthlySubscriptionCostUsd: 100 } : profile
        ))
        const service = new ProjectStatsService()
        await openService(service, storage({
            'design/activity/card__card-1.json': activityContent({ conversations: [storedConversation], records }),
            'design/usage_metrics.csv': metrics,
        }), cards, agentProfiles)
        service.setControls({
            dataset: 'totals',
            endUtc: '2026-08-12T23:59:59.999Z',
            startUtc: '2026-08-12T00:00:00.000Z',
            totalsGrouping: 'card',
            totalsMetric: 'cost',
        })

        // Only the active weekly window prices the bar; the inactive equal-length and shorter windows are ignored.
        expect(service.getSnapshot().rows).toMatchObject([{
            available: true,
            denominator: 10,
            displayLabel: 'F_1',
            numerator: 1_000,
            seriesLabel: 'codex',
            unit: 'dollars',
            value: 0.025,
        }])
        expect(service.getSnapshot().rows[0].tooltip).toBe(`F_1: First\n${formatDollars(0.025)}\nPriced with: codex subscription rate`)

        service.setControls({ totalsGrouping: 'action' })
        expect(service.getSnapshot().rows.map(({ actionId, displayLabel, value }) => ({ actionId, displayLabel, value }))).toEqual([
            { actionId: 'review', displayLabel: 'Review', value: 0.025 },
        ])
    })

    it('prices a mixed card per run and labels its series Mixed', async () => {
        const codexConversation = conversation({ id: 'codex-conversation' })
        const claudeConversation = conversation({ id: 'claude-conversation' })
        const records = [
            agentRecord('codex-run', '2026-08-12T10:00:00.000Z', codexConversation.id),
            agentRecord('claude-run', '2026-08-12T10:30:00.000Z', claudeConversation.id, {details: { agent: 'claude', model: 'sonnet', type: 'agent' }}),
        ]
        const metrics = [
            metricsHeader,
            '2026-08-12T09:00:00.000Z,token_usage,codex,,,,,997,1,1,1,1000,,',
            '2026-08-12T09:30:00.000Z,token_usage,claude,,,,,997,1,1,1,1000,,',
            '2026-08-12T11:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T00:00:00.000Z,,,,,,50,10',
            '2026-08-12T11:30:00.000Z,account_usage,claude,weekly,window-c,10080,2026-08-17T00:00:00.000Z,,,,,,50,20',
        ].join('\r\n')
        const agentProfiles = BUILTIN_AGENT_PROFILES.map((profile) => ({ ...profile, monthlySubscriptionCostUsd: 100 }))
        const service = new ProjectStatsService()
        await openService(service, storage({
            'design/activity/card__card-1.json': activityContent({ conversations: [codexConversation, claudeConversation], records }),
            'design/usage_metrics.csv': metrics,
        }), cards, agentProfiles)
        service.setControls({ dataset: 'totals', totalsGrouping: 'card', totalsMetric: 'cost' })

        // A weekly percentage point costs $0.25 in a fixed four-week month.
        expect(service.getSnapshot().rows).toMatchObject([{
            agent: null,
            available: true,
            displayLabel: 'F_1',
            sampleCount: 2,
            seriesIdentity: 'mixed',
            seriesLabel: 'Mixed',
        }])
        expect(service.getSnapshot().rows[0].value).toBeCloseTo(0.075, 10)
        expect(service.getSnapshot().rows[0].tooltip).toContain('Priced with: Mixed agents')
    })

    it('keeps an action cost subtotal when one conversation cannot be priced', async () => {
        const codexConversation = conversation({ id: 'codex-conversation' })
        const claudeConversation = conversation({ id: 'claude-conversation' })
        const records = [
            agentRecord('codex-run', '2026-08-12T10:00:00.000Z', codexConversation.id),
            agentRecord('claude-run', '2026-08-12T10:30:00.000Z', claudeConversation.id, { details: { agent: 'claude', model: 'sonnet', type: 'agent' } }),
        ]
        const metrics = [
            metricsHeader,
            '2026-08-12T09:00:00.000Z,token_usage,codex,,,,,997,1,1,1,1000,,',
            '2026-08-12T09:30:00.000Z,token_usage,claude,,,,,997,1,1,1,1000,,',
            '2026-08-12T11:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T00:00:00.000Z,,,,,,50,10',
            '2026-08-12T11:30:00.000Z,account_usage,claude,weekly,window-c,10080,2026-08-17T00:00:00.000Z,,,,,,50,20',
        ].join('\r\n')
        const agentProfiles = BUILTIN_AGENT_PROFILES.map((profile) => (
            profile.name === 'codex' ? { ...profile, monthlySubscriptionCostUsd: 100 } : profile
        ))
        const service = new ProjectStatsService()
        await openService(service, storage({
            'design/activity/card__card-1.json': activityContent({ conversations: [codexConversation, claudeConversation], records }),
            'design/usage_metrics.csv': metrics,
        }), cards, agentProfiles)
        service.setControls({ dataset: 'totals', totalsGrouping: 'action', totalsMetric: 'cost' })

        expect(service.getSnapshot().rows).toMatchObject([{
            actionId: 'review',
            agent: null,
            available: true,
            seriesIdentity: 'mixed',
            seriesLabel: 'Mixed',
            value: 0.025,
        }])
        expect(service.getSnapshot().rows[0].tooltip).toContain('Priced with: Mixed agents')
        expect(service.getSnapshot().rows[0].tooltip)
            .toContain('Skipped from estimate: 1 run (monthly subscription cost is not configured)')
    })

    it('marks a group unavailable when no conversation can be priced', async () => {
        const codexConversation = conversation()
        const unknownConversation = conversation({ id: 'conversation-2' })
        const records = [agentRecord('run-1', '2026-08-12T10:00:00.000Z', codexConversation.id)]
        const metrics = [
            metricsHeader,
            metricsRow('2026-08-12T09:00:00.000Z', 1_000),
            '2026-08-12T11:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T00:00:00.000Z,,,,,,50,10',
        ].join('\r\n')
        const service = new ProjectStatsService()
        await openService(service, storage({
            'design/activity/card__card-1.json': activityContent({ conversations: [codexConversation, unknownConversation], records }),
            'design/usage_metrics.csv': metrics,
        }))
        service.setControls({ dataset: 'totals', totalsMetric: 'cost' })

        expect(service.getSnapshot().rows).toEqual([
            expect.objectContaining({ available: false, displayLabel: 'F_1', sampleCount: 2, seriesLabel: 'Mixed', value: 0 }),
        ])
        expect(service.getSnapshot().rows[0].tooltip)
            .toContain('Skipped from estimate: 1 run (monthly subscription cost is not configured)')
        expect(service.getSnapshot().rows[0].tooltip)
            .toContain('Skipped from estimate: 1 run (matching account series is unavailable)')
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
        service.setControls({ activityGranularity: 'week', activityMetric: 'tokens' })
        expect(service.getSnapshot().rows.map(({ utcBucketStart, value }) => [utcBucketStart, value])).toEqual([
            ['2026-07-27T00:00:00.000Z', 5],
            ['2026-08-03T00:00:00.000Z', 7],
            ['2026-08-10T00:00:00.000Z', 0],
            ['2026-08-17T00:00:00.000Z', 0],
            ['2026-08-24T00:00:00.000Z', 0],
            ['2026-08-31T00:00:00.000Z', 9],
        ])
        service.setControls({ activityGranularity: 'month' })
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
        const firstLoad = service.open(cards, BUILTIN_AGENT_PROFILES)
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

        await service.open(cards, BUILTIN_AGENT_PROFILES)
        expect(listRepositoryFiles).toHaveBeenCalledTimes(1)

        files['design/activity/card__card-1.json'] = activityContent({
            records: [
                actionRecord('run-1', '2026-08-12T10:00:00.000Z'),
                actionRecord('run-2', '2026-08-12T11:00:00.000Z'),
            ],
        })
        await service.open(cards, BUILTIN_AGENT_PROFILES)
        expect(listRepositoryFiles).toHaveBeenCalledTimes(1)
        service.close()
        await service.open(cards, BUILTIN_AGENT_PROFILES)
        expect(listRepositoryFiles).toHaveBeenCalledTimes(2)
        expect(service.getSnapshot().rows).toMatchObject([{ value: 2 }])
    })

    it('migrates released activity once and reuses calculated facts', async () => {
        const releasePath = 'design/history/v1/card__card-1.json'
        const files = { [releasePath]: activityContent({ records: [actionRecord('released', '2026-08-12T10:00:00.000Z')] }) }
        const statsStorage = storage(files)
        const service = new ProjectStatsService()

        await openService(service, statsStorage)
        service.setControls({ releaseIdentity: completedReleaseIdentity('v1') })
        expect(service.getSnapshot().rows).toMatchObject([{ value: 1 }])
        expect(statsStorage.commit).toHaveBeenCalledWith(expect.objectContaining({ message: 'Update calculated release stats' }))
        service.close()
        vi.mocked(statsStorage.loadTextFile!).mockClear()

        await service.open(cards, BUILTIN_AGENT_PROFILES)
        service.setControls({ releaseIdentity: completedReleaseIdentity('v1') })

        expect(service.getSnapshot().rows).toMatchObject([{ value: 1 }])
        expect(statsStorage.loadTextFile).not.toHaveBeenCalledWith(project, releasePath)
    })

    it('rebuilds legacy release stats after action attribution schema changes', async () => {
        const releasePath = 'design/history/v1/card__card-1.json'
        const files = {
            'design/project_stats.json': JSON.stringify({ releases: {}, version: 2 }),
            [releasePath]: activityContent({ records: [actionRecord('released', '2026-08-12T10:00:00.000Z')] }),
        }
        const statsStorage = storage(files)
        const service = new ProjectStatsService()

        await openService(service, statsStorage)

        const migrationCommit = vi.mocked(statsStorage.commit).mock.calls.at(-1)?.[0]
        if (!migrationCommit) throw new Error('Missing stats migration commit')
        const parsed = parseProjectStatsFile(migrationCommit.files[0].content, 'design/project_stats.json')
        expect(parsed.releases.v1.actions).toMatchObject([{ actionType: 'command', agent: null }])
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

        await service.open(cards, BUILTIN_AGENT_PROFILES)

        const migrationCommit = vi.mocked(statsStorage.commit).mock.calls.at(-1)?.[0]
        if (!migrationCommit) throw new Error('Missing stats migration commit')
        const parsed = parseProjectStatsFile(migrationCommit.files[0].content, 'design/project_stats.json')
        expect(Object.keys(parsed.releases)).toEqual(['v2'])
    })

    it('defaults to current facts and selects one sorted completed release without rereading files', async () => {
        const statsStorage = storage({
            'design/activity/card__card-1.json': activityContent({records: [actionRecord('current-run', '2026-08-12T10:00:00.000Z')]}),
            'design/history/empty/README.md': 'Empty release',
            'design/history/v1/card__card-1.json': activityContent({records: [actionRecord('v1-run', '2026-08-13T10:00:00.000Z', { rootActionId: 'ship', rootActionLabel: 'Ship' })]}),
            'design/history/v2/card__card-1.json': activityContent({records: [actionRecord('v2-run', '2026-08-14T10:00:00.000Z', { rootActionId: 'test', rootActionLabel: 'Test' })]}),
        })
        const service = new ProjectStatsService()
        await openService(service, statsStorage)

        expect(service.getSnapshot().controls.releaseIdentity).toBe('current-release')
        expect(service.getSnapshot().options.releases.map(({ label }) => label)).toEqual([
            'Current release', 'empty', 'v1', 'v2',
        ])
        expect(service.getSnapshot().rows).toMatchObject([{ actionId: 'review', value: 1 }])

        service.setControls({ releaseIdentity: completedReleaseIdentity('v1') })
        expect(service.getSnapshot().rows).toMatchObject([{ actionId: 'ship', value: 1 }])
        expect(statsStorage.listRepositoryFiles).toHaveBeenCalledTimes(1)

        service.setControls({ endUtc: '2026-08-12T23:59:59.999Z', startUtc: '2026-08-12T00:00:00.000Z' })
        expect(service.getSnapshot().rows.every(({ value }) => value === 0)).toBe(true)

        service.setControls({ endUtc: null, releaseIdentity: completedReleaseIdentity('empty'), startUtc: null })
        expect(service.getSnapshot().rows).toEqual([])
    })

    it('scopes performance, totals, timer coverage, and activity comparison while preserving telemetry rows', async () => {
        const currentConversation = conversation({ id: 'current-conversation' })
        const releaseConversation = conversation({
            actionId: 'ship',
            completedAt: '2026-08-12T11:00:00.000Z',
            id: 'release-conversation',
            timer: { elapsedMs: 2_500, runningStartedAt: null },
            usage: { cachedInputTokens: 2, inputTokens: 8, outputTokens: 8, reasoningTokens: 2, totalTokens: 20 },
        })
        const missingTimer = conversation({
            actionId: 'ship',
            completedAt: '2026-08-12T12:00:00.000Z',
            id: 'release-missing-timer',
            timer: undefined,
        })
        const metrics = [
            metricsHeader,
            metricsRow('2026-08-12T09:00:00.000Z', 100),
            '2026-08-12T10:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T00:00:00.000Z,,,,,,50,5',
        ].join('\r\n')
        const statsStorage = storage({
            'design/activity/card__card-1.json': activityContent({
                conversations: [currentConversation],
                records: [agentRecord('current-run', '2026-08-12T10:00:00.000Z', currentConversation.id)],
            }),
            'design/history/v1/card__card-1.json': activityContent({
                conversations: [releaseConversation, missingTimer],
                records: [agentRecord('release-run', '2026-08-12T11:00:00.000Z', releaseConversation.id, {rootActionId: 'ship', rootActionLabel: 'Ship'})],
            }),
            'design/usage_metrics.csv': metrics,
        })
        const service = new ProjectStatsService()
        await openService(service, statsStorage)
        service.setControls({ dataset: 'usageComparison' })
        const currentTelemetry = service.getSnapshot().rows.filter(({ chartRole }) => (
            chartRole === 'accountUsage' || chartRole === 'projectTokensTotal'
        ))

        service.setControls({ releaseIdentity: completedReleaseIdentity('v1') })
        const releaseSnapshot = service.getSnapshot()
        expect(releaseSnapshot.rows.filter(({ chartRole, value }) => chartRole === 'activity' && value > 0))
            .toEqual([expect.objectContaining({ actionId: 'ship', value: 1 })])
        expect(releaseSnapshot.rows.filter(({ chartRole }) => (
            chartRole === 'accountUsage' || chartRole === 'projectTokensTotal'
        ))).toEqual(currentTelemetry)

        service.setControls({ dataset: 'agentPerformance', performanceMetric: 'duration' })
        expect(service.getSnapshot().rows).toEqual([expect.objectContaining({ value: 2_500 })])

        service.setControls({ dataset: 'totals', totalsGrouping: 'card', totalsMetric: 'duration' })
        expect(service.getSnapshot().rows).toEqual([expect.objectContaining({ identity: 'card-1', value: 2_500 })])
        expect(service.getSnapshot().omittedTimerCount).toBe(1)
    })

    it('falls back to current release after reload removes selected completed release', async () => {
        const releasePath = 'design/history/v1/card__card-1.json'
        const files: Record<string, string> = {
            'design/activity/card__card-1.json': activityContent({records: [actionRecord('current-run', '2026-08-12T10:00:00.000Z')]}),
            [releasePath]: activityContent({records: [actionRecord('release-run', '2026-08-13T10:00:00.000Z', { rootActionId: 'ship', rootActionLabel: 'Ship' })]}),
        }
        const service = new ProjectStatsService()
        await openService(service, storage(files))
        service.setControls({ releaseIdentity: completedReleaseIdentity('v1') })
        expect(service.getSnapshot().rows).toMatchObject([{ actionId: 'ship' }])

        service.close()
        delete files[releasePath]
        await service.open(cards, BUILTIN_AGENT_PROFILES)

        expect(service.getSnapshot().controls.releaseIdentity).toBe('current-release')
        expect(service.getSnapshot().rows).toMatchObject([{ actionId: 'review', value: 1 }])
    })

    it('zero-fills day ranges and emits stable stacked action series', async () => {
        const service = new ProjectStatsService()
        await openService(service, storage({
            'design/activity/card__card-1.json': activityContent({
                records: [
                    actionRecord('run-1', '2026-08-10T10:00:00.000Z'),
                    actionRecord('run-2', '2026-08-12T10:00:00.000Z'),
                    actionRecord('run-3', '2026-08-12T11:00:00.000Z', { rootActionId: 'test', rootActionLabel: 'Test' }),
                ],
            }),
        }))

        expect(service.getSnapshot().rows.map(({ identity, utcBucketStart, value }) => [identity, utcBucketStart, value])).toEqual([
            ['review', '2026-08-10T00:00:00.000Z', 1],
            ['2026-08-11T00:00:00.000Z', '2026-08-11T00:00:00.000Z', 0],
            ['review', '2026-08-12T00:00:00.000Z', 1],
            ['test', '2026-08-12T00:00:00.000Z', 1],
        ])

        service.setControls({ activityGranularity: 'month', endUtc: '2026-10-31T23:59:59.999Z', startUtc: '2026-08-01T00:00:00.000Z' })
        const monthTotals = new Map<string | null, number>()
        for (const { utcBucketStart, value } of service.getSnapshot().rows) {
            monthTotals.set(utcBucketStart, (monthTotals.get(utcBucketStart) ?? 0) + value)
        }
        expect([...monthTotals]).toEqual([
            ['2026-08-01T00:00:00.000Z', 3],
            ['2026-09-01T00:00:00.000Z', 0],
            ['2026-10-01T00:00:00.000Z', 0],
        ])
    })

    it('counts one cumulative performance sample across continuation records', async () => {
        const rootConversation = conversation({
            entries: [
                { content: 'start', id: 'tool-1-start', kind: 'event', providerItemId: 'tool-1', timestamp: '2026-08-12T09:10:00.000Z', type: 'commandExecution' },
                { content: 'done', id: 'tool-1-done', kind: 'event', providerItemId: 'tool-1', timestamp: '2026-08-12T09:20:00.000Z', type: 'commandExecution' },
                { content: 'search', id: 'tool-2', kind: 'event', timestamp: '2026-08-12T09:30:00.000Z', type: 'webSearch' },
                { content: 'reason', id: 'not-tool', kind: 'event', timestamp: '2026-08-12T09:40:00.000Z', type: 'reasoning' },
            ],
        })
        const service = new ProjectStatsService()
        await openService(service, storage({
            'design/activity/card__card-1.json': activityContent({
                conversations: [rootConversation],
                records: [
                    agentRecord('run-1', '2026-08-12T10:00:00.000Z', rootConversation.id),
                    agentRecord('run-2', '2026-08-12T10:00:00.000Z', rootConversation.id),
                ],
            }),
        }))
        service.setControls({ dataset: 'agentPerformance' })

        expect(service.getSnapshot().rows).toMatchObject([{ identity: 'codex', sampleCount: 1, value: 1_500 }])
        service.setControls({ performanceMetric: 'tokens' })
        expect(service.getSnapshot().rows).toMatchObject([{ sampleCount: 1, value: 10 }])
        service.setControls({ performanceMetric: 'toolCalls' })
        expect(service.getSnapshot().rows).toMatchObject([{ sampleCount: 1, value: 2 }])
    })

    it('applies only filter belonging to selected performance grouping', async () => {
        const conversations = [
            conversation({ id: 'codex-conversation' }),
            conversation({ id: 'claude-conversation' }),
        ]
        const service = new ProjectStatsService()
        await openService(service, storage({
            'design/activity/card__card-1.json': activityContent({
                conversations,
                records: [
                    agentRecord('codex-run', '2026-08-12T10:00:00.000Z', 'codex-conversation'),
                    agentRecord('claude-run', '2026-08-12T10:00:00.000Z', 'claude-conversation', {details: { agent: 'claude', model: 'sonnet', type: 'agent' }}),
                ],
            }),
        }))
        service.setControls({
            dataset: 'agentPerformance',
            performanceAgentIds: ['codex'],
            performanceGrouping: 'agent',
            performanceModelIds: ['claude\u0000sonnet'],
        })
        expect(service.getSnapshot().rows).toMatchObject([{ identity: 'codex' }])

        service.setControls({ performanceGrouping: 'model' })
        expect(service.getSnapshot().rows).toMatchObject([{ identity: 'claude\u0000sonnet' }])
    })

    it('includes terminal statuses and reports each in averages and status counts', async () => {
        const conversations = [
            conversation({ id: 'completed', timer: { elapsedMs: 100, runningStartedAt: null } }),
            conversation({ id: 'failed', status: 'failed', timer: { elapsedMs: 200, runningStartedAt: null } }),
            conversation({ id: 'cancelled', status: 'cancelled', timer: { elapsedMs: 300, runningStartedAt: null } }),
        ]
        const service = new ProjectStatsService()
        await openService(service, storage({
            'design/activity/card__card-1.json': activityContent({
                conversations,
                records: conversations.map(({ id }, index) => agentRecord(`run-${index}`, '2026-08-12T10:00:00.000Z', id)),
            }),
        }))
        service.setControls({ dataset: 'agentPerformance' })

        expect(service.getSnapshot().rows).toMatchObject([{
            sampleCount: 3,
            statusCounts: { cancelled: 1, completed: 1, failed: 1 },
            utcBucketStart: '2026-08-12T00:00:00.000Z',
            value: 200,
        }])
    })

    it('aggregates performance runs and filters selected actions', async () => {
        const elapsedValues = [100, 200, 300, 500]
        const conversations = elapsedValues.map((elapsedMs, index) => conversation({
            actionId: index < 2 ? 'review' : 'test',
            id: `conversation-${index}`,
            timer: { elapsedMs, runningStartedAt: null },
            title: index < 2 ? 'Review' : 'Test',
        }))
        const records = conversations.map(({ id }, index) => agentRecord(`run-${index}`, '2026-08-12T10:00:00.000Z', id, {
            rootActionId: index < 2 ? 'review' : 'test',
            rootActionLabel: index < 2 ? 'Review' : 'Test',
        }))
        const service = new ProjectStatsService()
        await openService(service, storage({'design/activity/card__card-1.json': activityContent({ conversations, records })}))
        service.setControls({ dataset: 'agentPerformance' })

        expect(service.getSnapshot().rows).toMatchObject([{aggregation: 'average', deviation: null, sampleCount: 4, value: 275}])

        service.setControls({ performanceAggregation: 'averageWithDeviation' })
        expect(service.getSnapshot().rows[0].value).toBe(275)
        expect(service.getSnapshot().rows[0].deviation).toBeCloseTo(Math.sqrt(21_875))
        expect(service.getSnapshot().rows[0].tooltip).toMatch(/Average duration per run: 0[,.]28 seconds\nStd dev: 0[,.]15 seconds/u)

        service.setControls({ performanceAggregation: 'sum' })
        expect(service.getSnapshot().rows).toMatchObject([{ aggregation: 'sum', deviation: null, value: 1_100 }])

        service.setControls({ performanceAggregation: 'median' })
        expect(service.getSnapshot().rows).toMatchObject([{ aggregation: 'median', deviation: null, value: 250 }])

        service.setControls({ performanceActionIds: ['review'], performanceAggregation: 'average' })
        expect(service.getSnapshot().rows).toMatchObject([{ sampleCount: 2, value: 150 }])

        service.setControls({ performanceActionIds: [] })
        expect(service.getSnapshot().rows).toMatchObject([{ sampleCount: 4, value: 275 }])
    })

    it('reports running, waiting, missing timer, attribution, mixed, and nested exclusions', async () => {
        const conversations = [
            conversation({ completedAt: null, id: 'running', status: 'running' }),
            conversation({ completedAt: null, id: 'waiting', status: 'waitingForInput' }),
            conversation({ id: 'missing-timer', timer: undefined }),
            conversation({ completedAt: null, id: 'missing-completion' }),
            conversation({ id: 'missing-attribution' }),
            conversation({ id: 'mixed-attribution' }),
            conversation({ id: 'nested' }),
            conversation({ id: 'child' }),
        ]
        const records = [
            agentRecord('run-running', '2026-08-12T10:00:00.000Z', 'running'),
            agentRecord('run-waiting', '2026-08-12T10:00:00.000Z', 'waiting'),
            agentRecord('run-timer', '2026-08-12T10:00:00.000Z', 'missing-timer'),
            agentRecord('run-completion', '2026-08-12T10:00:00.000Z', 'missing-completion'),
            agentRecord('run-missing', '2026-08-12T10:00:00.000Z', 'missing-attribution', { details: { agent: null, type: 'agent' } }),
            agentRecord('run-mixed-1', '2026-08-12T10:00:00.000Z', 'mixed-attribution'),
            agentRecord('run-mixed-2', '2026-08-12T10:00:00.000Z', 'mixed-attribution', { details: { agent: 'codex', model: 'gpt-4', type: 'agent' } }),
            agentRecord('run-nested', '2026-08-12T10:00:00.000Z', 'nested', { conversationIds: ['nested', 'child'] }),
        ]
        const service = new ProjectStatsService()
        await openService(service, storage({'design/activity/card__card-1.json': activityContent({ conversations, records })}))
        service.setControls({ dataset: 'agentPerformance' })

        expect(service.getSnapshot()).toMatchObject({
            excludedSampleCount: 7,
            exclusionCounts: {
                missingAttribution: 1,
                missingCompletion: 1,
                missingDuration: 1,
                mixedAttribution: 1,
                nestedConversations: 1,
                notTerminal: 2,
            },
        })
    })

    it('keeps account limits and windows separate while skipping negative corrections', async () => {
        const accountRows = [
            '2026-08-12T09:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T00:00:00.000Z,,,,,,50,-2',
            '2026-08-12T10:00:00.000Z,account_usage,codex,weekly,window-b,10080,2026-08-24T00:00:00.000Z,,,,,,60,9',
            '2026-08-12T11:00:00.000Z,account_usage,codex,weekly,window-b,10080,2026-08-25T00:00:00.000Z,,,,,,61,',
        ]
        const service = new ProjectStatsService()
        await openService(service, storage({ 'design/usage_metrics.csv': [metricsHeader, ...accountRows].join('\r\n') }))
        service.setControls({ dataset: 'usageComparison' })

        expect(service.getSnapshot().options.accountSeries).toHaveLength(2)
        expect(service.getSnapshot().rows.filter(({ chartRole }) => chartRole === 'accountUsage')).toMatchObject([{
            seriesLabel: 'codex / weekly / window-b',
            value: 9,
        }])
        const accountTooltip = service.getSnapshot().rows.find(({ chartRole }) => chartRole === 'accountUsage')?.tooltip ?? ''
        expect(accountTooltip).toContain('\nProvider: codex · Limit: weekly · Window: window-b (7 days)')
        expect(accountTooltip).toContain('\nUsed this period: 9% of window-b limit')
        expect(accountTooltip).toContain('(+1 more)')
        expect(accountTooltip).not.toMatch(/T\d{2}:\d{2}:\d{2}/u)
        expect(service.getSnapshot().rows.some(({ seriesLabel }) => seriesLabel?.includes('window-a'))).toBe(false)
    })

    it('does not double-count account usage when reset timestamps drift by one minute', async () => {
        const accountRows = [
            '2026-08-12T09:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T17:00:00.000Z,,,,,,0,',
            '2026-08-12T10:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T16:59:00.000Z,,,,,,27.88,27.88',
            '2026-08-12T11:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T17:00:00.000Z,,,,,,28,28',
        ]
        const service = new ProjectStatsService()
        await openService(service, storage({ 'design/usage_metrics.csv': [metricsHeader, ...accountRows].join('\r\n') }))
        service.setControls({ dataset: 'usageComparison' })

        expect(service.getSnapshot().rows.filter(({ chartRole }) => chartRole === 'accountUsage')).toMatchObject([{
            unit: 'percent',
            value: 28,
        }])
        expect(service.getSnapshot().rows.find(({ chartRole }) => chartRole === 'accountUsage')?.tooltip)
            .toContain('Used this period: 28% of window-a limit')
    })

    it('builds provider ratios and grouped agent activity without counting commands as provider actions', async () => {
        const codexConversation = conversation({ actionId: 'codex-review', id: 'codex-conversation', title: 'Codex review' })
        const claudeConversation = conversation({ actionId: 'claude-review', id: 'claude-conversation', title: 'Claude review' })
        const records = [
            agentRecord('codex-run', '2026-08-12T10:00:00.000Z', codexConversation.id, {rootActionId: 'codex-review', rootActionLabel: 'Review'}),
            agentRecord('claude-run', '2026-08-12T11:00:00.000Z', claudeConversation.id, {
                details: { agent: 'claude', model: 'sonnet', type: 'agent' },
                rootActionId: 'claude-review', rootActionLabel: 'Review',
            }),
            actionRecord('command-run', '2026-08-12T12:00:00.000Z', {rootActionId: 'internal-command', rootActionLabel: 'Build'}),
        ]
        const metrics = [
            metricsHeader,
            '2026-08-12T09:00:00.000Z,token_usage,codex,,,,,7,1,1,1,10,,',
            '2026-08-12T09:30:00.000Z,token_usage,claude,,,,,17,1,1,1,20,,',
            '2026-08-12T13:00:00.000Z,account_usage,codex,weekly,codex-window,10080,2026-08-17T00:00:00.000Z,,,,,,50,2',
            '2026-08-12T13:30:00.000Z,account_usage,claude,five-hour,claude-window,300,2026-08-12T18:00:00.000Z,,,,,,40,4',
        ].join('\r\n')
        const service = new ProjectStatsService()
        const agentProfiles = BUILTIN_AGENT_PROFILES.map((profile) => ({
            ...profile,
            monthlySubscriptionCostUsd: profile.name === 'claude' ? 200 : 100,
        }))
        await openService(service, storage({
            'design/activity/card__card-1.json': activityContent({ conversations: [codexConversation, claudeConversation], records }),
            'design/usage_metrics.csv': metrics,
        }), cards, agentProfiles)
        service.setControls({ dataset: 'usageComparison' })

        expect(service.getSnapshot().rows.filter(({ chartRole }) => chartRole === 'tokensPerAccountUsage')).toMatchObject([
            { denominator: 4, numerator: 20, provider: 'claude', value: 5 },
            { denominator: 2, numerator: 10, provider: 'codex', value: 5 },
        ])
        expect(service.getSnapshot().rows.filter(({ chartRole }) => chartRole === 'tokensPerDollar')).toMatchObject([
            { denominator: 4, numerator: 20, provider: 'claude', value: 336 },
            { denominator: 2, numerator: 10, provider: 'codex', value: 20 },
        ])
        expect(service.getSnapshot().rows.filter(({ chartRole }) => chartRole === 'actionsPerAccountUsage')).toMatchObject([
            { denominator: 4, numerator: 1, provider: 'claude', value: 0.25 },
            { denominator: 2, numerator: 1, provider: 'codex', value: 0.5 },
        ])
        expect(service.getSnapshot().rows.filter(({ chartRole }) => chartRole === 'activity')).toMatchObject([
            { actionId: 'claude-review', agent: 'claude', seriesLabel: 'Review', stackLabel: 'claude', value: 1 },
            { actionId: 'codex-review', agent: 'codex', seriesLabel: 'Review', stackLabel: 'codex', value: 1 },
            { actionId: 'internal-command', actionType: 'command', seriesLabel: 'Build', stackLabel: 'Command', value: 1 },
        ])
        expect(service.getSnapshot().rows.filter(({ chartRole }) => chartRole === 'activity')
            .every(({ seriesLabel }) => !seriesLabel?.includes('internal'))).toBe(true)
    })

    it('reports project token totals and per-action averages as two separate charts', async () => {
        const conversations = [conversation({ id: 'first' }), conversation({ id: 'second' })]
        const records = conversations.map(({ id }, index) => agentRecord(`run-${index}`, '2026-08-12T10:00:00.000Z', id))
        const metrics = [
            metricsHeader,
            '2026-08-12T09:00:00.000Z,token_usage,codex,,,,,97,1,1,1,100,,',
            '2026-08-12T09:30:00.000Z,token_usage,claude,,,,,37,1,1,1,40,,',
        ].join('\r\n')
        const service = new ProjectStatsService()
        await openService(service, storage({
            'design/activity/card__card-1.json': activityContent({ conversations, records }),
            'design/usage_metrics.csv': metrics,
        }))
        service.setControls({ dataset: 'usageComparison' })

        expect(service.getSnapshot().rows.filter(({ chartRole }) => chartRole === 'projectTokensTotal')).toMatchObject([
            { aggregation: 'total', provider: 'claude', value: 40 },
            { aggregation: 'total', provider: 'codex', value: 100 },
        ])
        expect(service.getSnapshot().rows.find(({ chartRole, provider }) => chartRole === 'projectTokensTotal' && provider === 'codex')?.tooltip)
            .toContain('Total project tokens: 100')

        // No control chooses between them: both charts are present in the same snapshot.
        expect(service.getSnapshot().rows.filter(({ chartRole }) => chartRole === 'projectTokensAverage')).toMatchObject([
            { aggregation: 'average', provider: 'claude', value: 0 },
            { aggregation: 'average', provider: 'codex', value: 50 },
        ])
        expect(service.getSnapshot().rows.find(({ chartRole, provider }) => chartRole === 'projectTokensAverage' && provider === 'codex')?.tooltip)
            .toContain('Average project tokens per action: 50')
    })

    it('prices account usage per agent in dollars from the longest window and flags unpriced agents', async () => {
        const storedConversation = conversation()
        const records = [agentRecord('run-1', '2026-08-12T10:00:00.000Z', storedConversation.id)]
        const metrics = [
            metricsHeader,
            '2026-08-12T11:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T00:00:00.000Z,,,,,,50,10',
            '2026-08-12T11:30:00.000Z,account_usage,codex,session,window-b,300,2026-08-12T17:00:00.000Z,,,,,,40,5',
            '2026-08-12T12:00:00.000Z,account_usage,claude,weekly,window-c,10080,2026-08-17T00:00:00.000Z,,,,,,40,4',
        ].join('\r\n')
        const agentProfiles = BUILTIN_AGENT_PROFILES.map((profile) => (
            profile.name === 'codex' ? { ...profile, monthlySubscriptionCostUsd: 100 } : profile
        ))
        const service = new ProjectStatsService()
        await openService(service, storage({
            'design/activity/card__card-1.json': activityContent({ conversations: [storedConversation], records }),
            'design/usage_metrics.csv': metrics,
        }), cards, agentProfiles)
        service.setControls({ dataset: 'usageComparison' })

        // A $100 subscription makes one weekly percentage point cost $0.25 in a fixed four-week month.
        expect(service.getSnapshot().rows.filter(({ chartRole }) => chartRole === 'costPerAgent')).toMatchObject([
            { available: false, provider: 'claude', unit: 'dollars', value: 0 },
            { available: true, denominator: 100, numerator: 10, provider: 'codex', unit: 'dollars', value: 2.5 },
        ])
        expect(service.getSnapshot().rows.filter(({ chartRole }) => chartRole === 'costPerActionAverage')).toMatchObject([
            { available: false, provider: 'claude', unit: 'dollars', value: 0 },
            { available: true, denominator: 10, numerator: 1, provider: 'codex', unit: 'dollars', value: 2.5 },
        ])
        const codexCost = service.getSnapshot().rows
            .find(({ chartRole, provider }) => chartRole === 'costPerAgent' && provider === 'codex')

        expect(codexCost?.tooltip).toContain('Estimated from the limit window\'s share of a fixed 28-day subscription month')
        expect(codexCost?.tooltip).toContain(`Estimated cost: ${formatDollars(2.5)}`)
        expect(service.getSnapshot().rows.find(({ chartRole, provider }) => chartRole === 'costPerAgent' && provider === 'claude')?.tooltip)
            .toContain('Unavailable: monthly subscription cost for claude')
    })

    it('aligns usage comparison bucket domains and clears removed account selections after reload', async () => {
        const accountRow = '2026-08-14T09:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T00:00:00.000Z,,,,,,50,2'
        const files: Record<string, string> = {
            'design/activity/card__card-1.json': activityContent({ records: [actionRecord('run-1', '2026-08-12T10:00:00.000Z')] }),
            'design/usage_metrics.csv': [metricsHeader, accountRow].join('\r\n'),
        }
        const service = new ProjectStatsService()
        await openService(service, storage(files))
        service.setControls({ dataset: 'usageComparison' })

        const domains = [
            'accountUsage',
            'projectTokensTotal',
            'projectTokensAverage',
            'tokensPerAccountUsage',
            'tokensPerDollar',
            'costPerAgent',
            'costPerActionAverage',
            'actionsPerAccountUsage',
            'activity',
        ].map((chartRole) => (
            service.getSnapshot().rows.filter((row) => row.chartRole === chartRole).map(({ utcBucketStart }) => utcBucketStart)
        ))
        expect(domains[0]).toEqual(['2026-08-12T00:00:00.000Z', '2026-08-13T00:00:00.000Z', '2026-08-14T00:00:00.000Z'])
        expect(domains[1]).toEqual(domains[0])
        for (const domain of domains.slice(1, -1)) expect(domain).toEqual(domains[0])
        expect(service.getSnapshot().rows.filter(({ chartRole }) => chartRole === 'accountUsage')).toMatchObject([
            { available: false, value: 0 },
            { available: false, value: 0 },
            { available: true, value: 2 },
        ])

        files['design/usage_metrics.csv'] = metricsHeader
        service.close()
        await service.open(cards, BUILTIN_AGENT_PROFILES)
        expect(service.getSnapshot().rows.filter(({ chartRole }) => chartRole === 'accountUsage'))
            .toEqual([expect.objectContaining({ available: false, seriesIdentity: null, value: 0 })])
    })

    it('keeps unavailable comparison values numeric zero and marks them unavailable', async () => {
        const service = new ProjectStatsService()
        await openService(service, storage({'design/activity/card__card-1.json': activityContent({records: [actionRecord('run-1', '2026-08-12T10:00:00.000Z')]})}))
        service.setControls({ dataset: 'usageComparison' })

        expect(service.getSnapshot().rows.filter(({ chartRole }) => chartRole !== 'activity')).toMatchObject([
            { available: false, chartRole: 'accountUsage', value: 0 },
            { available: false, chartRole: 'projectTokensTotal', value: 0 },
            { available: false, chartRole: 'projectTokensAverage', value: 0 },
            { available: false, chartRole: 'tokensPerAccountUsage', value: 0 },
            { available: false, chartRole: 'tokensPerDollar', value: 0 },
            { available: false, chartRole: 'costPerAgent', value: 0 },
            { available: false, chartRole: 'costPerActionAverage', value: 0 },
            { available: false, chartRole: 'actionsPerAccountUsage', value: 0 },
        ])
    })

    it('names a totals bar by id and title only, with no file path anywhere', async () => {
        const service = new ProjectStatsService()
        await openService(service, storage({'design/activity/card__card-1.json': activityContent({ conversations: [conversation()] })}))
        service.setControls({ dataset: 'totals', totalsGrouping: 'card', totalsMetric: 'tokens' })

        expect(service.getSnapshot().rows).toMatchObject([{
            accessibleLabel: 'F_1: First; 10',
            displayLabel: 'F_1',
            identity: 'card-1',
            tooltip: 'F_1: First\n10',
        }])
        expect(service.getSnapshot().rows[0].tooltip).not.toContain('design/active/F_1.md')
    })

    it('formats time-based totals as HH:MM:SS instead of raw milliseconds', async () => {
        const service = new ProjectStatsService()
        await openService(service, storage({'design/activity/card__card-1.json': activityContent({conversations: [conversation({ timer: { elapsedMs: 3_723_000, runningStartedAt: null } })]})}))
        service.setControls({ dataset: 'totals', totalsGrouping: 'card', totalsMetric: 'duration' })

        expect(service.getSnapshot().rows).toMatchObject([{ tooltip: 'F_1: First\n01:02:03', value: 3_723_000 }])
    })
})
