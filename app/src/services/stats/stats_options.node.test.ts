import { describe, expect, it } from 'vitest'
import type { StatsActionFact, StatsConversationFact } from '../../../../shared/project_stats.mjs'
import type { UsageMetricsAccountRow } from '../agents/project_usage_metrics_service'
import {
    CURRENT_RELEASE_IDENTITY,
    INITIAL_CONTROLS,
    type LoadedStatsSource,
    type StatsControls,
    type StatsDatasetSource,
} from './project_stats_types'
import { modelIdentity } from './stats_identities'
import { buildOptions, buildReleaseOptions, completedReleaseIdentity, reconcileControls } from './stats_options'

function actionFact(overrides: Partial<StatsActionFact> = {}): StatsActionFact {
    return {
        actionId: 'review',
        actionLabel: 'Review',
        actionType: 'command',
        agent: null,
        cardInternalId: 'card-1',
        completedAt: '2026-08-12T10:00:00.000Z',
        identity: 'action-1',
        ...overrides,
    }
}

function conversationFact(overrides: Partial<StatsConversationFact> = {}): StatsConversationFact {
    return {
        actionId: 'review',
        actionLabel: 'Review',
        agent: 'codex',
        cardInternalId: 'card-1',
        cardPath: 'design/active/F_1.md',
        completedAt: '2026-08-12T10:00:00.000Z',
        elapsedMs: 1_500,
        hasMixedAttribution: false,
        hasNestedAgentConversations: false,
        identity: 'conversation-1',
        isRootConversation: true,
        model: 'gpt-5',
        status: 'completed',
        toolCallCount: 2,
        totalTokens: 10,
        ...overrides,
    }
}

function accountRow(overrides: Partial<UsageMetricsAccountRow> = {}): UsageMetricsAccountRow {
    return {
        limitId: 'weekly',
        provider: 'codex',
        recordedAt: '2026-08-12T09:00:00.000Z',
        resetsAt: '2026-08-17T00:00:00.000Z',
        usedPercent: 50,
        usedPercentDelta: 2,
        windowDurationMinutes: 10_080,
        windowId: 'window-a',
        ...overrides,
    }
}

function source(overrides: Partial<StatsDatasetSource> = {}): StatsDatasetSource {
    return {
        accountRows: [],
        agentProfiles: [],
        cards: [],
        stats: { actions: [], conversations: [] },
        tokenRows: [],
        tokenTimeAvailable: false,
        warnings: [],
        ...overrides,
    }
}

function loadedSource(overrides: Partial<LoadedStatsSource> = {}): LoadedStatsSource {
    return {
        accountRows: [],
        agentProfiles: [],
        cards: [],
        currentStats: { actions: [], conversations: [] },
        releaseStats: {},
        tokenRows: [],
        tokenTimeAvailable: false,
        warnings: [],
        ...overrides,
    }
}

function controls(overrides: Partial<StatsControls> = {}): StatsControls {
    return { ...INITIAL_CONTROLS, ...overrides }
}

describe('buildOptions', () => {
    it('collects action labels from action facts and conversations without duplicating an identity', () => {
        const options = buildOptions(source({
            stats: {
                actions: [actionFact(), actionFact({ actionId: 'build', actionLabel: 'Build', identity: 'action-2' })],
                conversations: [conversationFact({ actionId: 'test', actionLabel: 'Test' }), conversationFact({ identity: 'conversation-2' })],
            },
        }), [])

        expect(options.actions).toEqual([
            { identity: 'build', label: 'Build' },
            { identity: 'review', label: 'Review' },
            { identity: 'test', label: 'Test' },
        ])
    })

    it('offers agents and models only for attributed root conversations', () => {
        const options = buildOptions(source({
            stats: {
                actions: [],
                conversations: [
                    conversationFact(),
                    conversationFact({ agent: 'claude', identity: 'conversation-2', model: 'sonnet' }),
                    conversationFact({ identity: 'conversation-3', isRootConversation: false }),
                    conversationFact({ agent: null, identity: 'conversation-4' }),
                    conversationFact({ identity: 'conversation-5', model: null }),
                ],
            },
        }), [])

        expect(options.agents).toEqual([{ identity: 'claude', label: 'claude' }, { identity: 'codex', label: 'codex' }])
        expect(options.models).toEqual([
            { identity: modelIdentity('claude', 'sonnet'), label: 'claude - sonnet' },
            { identity: modelIdentity('codex', 'gpt-5'), label: 'codex - gpt-5' },
        ])
    })

    it('deduplicates account series per provider, limit, and window', () => {
        const options = buildOptions(source({
            accountRows: [
                accountRow(),
                accountRow({ recordedAt: '2026-08-12T10:00:00.000Z' }),
                accountRow({ windowId: 'window-b' }),
            ],
        }), [])

        expect(options.accountSeries.map(({ windowId }) => windowId)).toEqual(['window-a', 'window-b'])
    })
})

describe('buildReleaseOptions', () => {
    it('offers current release first and completed releases once in stable name order', () => {
        const options = buildReleaseOptions(loadedSource({
            releaseStats: {
                v2: { actions: [], conversations: [] },
                v1: { actions: [], conversations: [] },
            },
        }))

        expect(options).toEqual([
            { identity: CURRENT_RELEASE_IDENTITY, label: 'Current release', releaseName: null },
            { identity: completedReleaseIdentity('v1'), label: 'v1', releaseName: 'v1' },
            { identity: completedReleaseIdentity('v2'), label: 'v2', releaseName: 'v2' },
        ])
    })
})

describe('reconcileControls', () => {
    it('drops selections the loaded source no longer offers and keeps the rest', () => {
        const releaseOptions = buildReleaseOptions(loadedSource())
        const options = buildOptions(source({ stats: { actions: [actionFact()], conversations: [conversationFact()] } }), releaseOptions)

        const reconciled = reconcileControls(controls({
            performanceActionIds: ['review', 'removed'],
            performanceAgentIds: ['codex', 'removed'],
            performanceModelIds: [modelIdentity('codex', 'gpt-5'), 'removed'],
        }), options)

        expect(reconciled.performanceActionIds).toEqual(['review'])
        expect(reconciled.performanceAgentIds).toEqual(['codex'])
        expect(reconciled.performanceModelIds).toEqual([modelIdentity('codex', 'gpt-5')])
    })

    it('leaves non-entity controls untouched', () => {
        const reconciled = reconcileControls(
            controls({ dataset: 'totals', startUtc: '2026-08-01T00:00:00.000Z' }),
            buildOptions(source(), buildReleaseOptions(loadedSource())),
        )

        expect(reconciled).toMatchObject({ dataset: 'totals', startUtc: '2026-08-01T00:00:00.000Z' })
    })

    it('falls back to current release when selected completed release disappears', () => {
        const options = buildOptions(source(), buildReleaseOptions(loadedSource()))
        const reconciled = reconcileControls(controls({ releaseIdentity: completedReleaseIdentity('removed') }), options)

        expect(reconciled.releaseIdentity).toBe(CURRENT_RELEASE_IDENTITY)
    })
})
