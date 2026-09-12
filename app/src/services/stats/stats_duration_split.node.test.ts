import { describe, expect, it } from 'vitest'
import type { StatsConversationFact } from '../../../../shared/project_stats.mjs'
import { INITIAL_CONTROLS, type StatsChartRow, type StatsControls, type StatsDatasetSource } from './project_stats_types'
import { eligibleSamples, performanceRows } from './stats_performance_dataset'
import { totalsRows } from './stats_totals_dataset'

function conversationFact(overrides: Partial<StatsConversationFact> = {}): StatsConversationFact {
    return {
        actionId: 'review',
        actionLabel: 'Review',
        agent: 'claude',
        cardInternalId: 'card-1',
        cardPath: 'design/active/F_1.md',
        completedAt: '2026-08-12T10:00:00.000Z',
        elapsedMs: 100_000,
        hasMixedAttribution: false,
        hasNestedAgentConversations: false,
        identity: 'conversation-1',
        isRootConversation: true,
        model: 'sonnet',
        reasoningMs: 20_000,
        status: 'completed',
        toolCallCount: 2,
        toolMs: 50_000,
        totalTokens: 10,
        ...overrides,
    }
}

function source(conversations: StatsConversationFact[]): StatsDatasetSource {
    return {
        accountRows: [],
        agentProfiles: [],
        cards: [{ internalId: 'card-1', path: 'design/active/F_1.md', title: 'First', visibleId: 'F_1' }],
        stats: { actions: [], conversations },
        tokenRows: [],
        tokenTimeAvailable: true,
        warnings: [],
    }
}

function controls(overrides: Partial<StatsControls> = {}): StatsControls {
    return { ...INITIAL_CONTROLS, dataset: 'agentPerformance', performanceMetric: 'duration', ...overrides }
}

function performanceFor(conversations: StatsConversationFact[], overrides: Partial<StatsControls> = {}) {
    const activeControls = controls(overrides)

    return performanceRows(activeControls, eligibleSamples(source(conversations), activeControls).samples)
}

function segments(rows: StatsChartRow[], stackIdentity: string) {
    return rows.filter((row) => row.stackIdentity === stackIdentity).map((row) => [row.seriesLabel, row.value] as const)
}

describe('duration split in agent/model performance', () => {
    it('stacks tools, reasoning, agent and unmeasured in a fixed order that adds up to the total', () => {
        const rows = performanceFor([conversationFact()], { performanceAggregation: 'sum' })

        expect(segments(rows, 'claude')).toEqual([
            ['claude - Tools', 50_000],
            ['claude - Reasoning', 20_000],
            ['claude - Agent', 30_000],
            ['claude - Unmeasured', 0],
        ])
        expect(rows.reduce((total, row) => total + row.value, 0)).toBe(100_000)
    })

    it('divides every component by the same run count so an average bar still adds up', () => {
        const rows = performanceFor([
            conversationFact(),
            conversationFact({ elapsedMs: 60_000, identity: 'conversation-2', reasoningMs: 10_000, toolMs: 20_000 }),
        ], { performanceAggregation: 'average' })

        expect(segments(rows, 'claude')).toEqual([
            ['claude - Tools', 35_000],
            ['claude - Reasoning', 15_000],
            ['claude - Agent', 30_000],
            ['claude - Unmeasured', 0],
        ])
    })

    it('charges a run recorded before the split to the unmeasured component only', () => {
        const rows = performanceFor(
            [conversationFact({ reasoningMs: null, toolMs: null })],
            { performanceAggregation: 'sum' },
        )

        expect(segments(rows, 'claude')).toEqual([
            ['claude - Tools', 0],
            ['claude - Reasoning', 0],
            ['claude - Agent', 0],
            ['claude - Unmeasured', 100_000],
        ])
    })

    it('gives each component its own colour group and each agent its own series identity', () => {
        const rows = performanceFor([
            conversationFact(),
            conversationFact({ agent: 'codex', identity: 'conversation-2', model: 'gpt-5' }),
        ], { performanceAggregation: 'sum' })
        const toolRows = rows.filter((row) => row.colorGroup === 'duration:tool')

        expect(toolRows.map((row) => row.seriesIdentity)).toEqual(['claude tool', 'codex tool'])
        expect(new Set(rows.map((row) => row.colorGroup))).toEqual(new Set([
            'duration:tool', 'duration:reasoning', 'duration:agent', 'duration:unmeasured',
        ]))
    })

    it.each(['median', 'averageWithDeviation'] as const)('keeps one bar with its whisker under %s', (aggregation) => {
        const rows = performanceFor([
            conversationFact(),
            conversationFact({ elapsedMs: 60_000, identity: 'conversation-2' }),
        ], { performanceAggregation: aggregation })

        expect(rows).toHaveLength(1)
        expect(rows[0].stackIdentity).toBeNull()
        expect(rows[0].colorGroup).toBeNull()
        expect(rows[0].deviation === null).toBe(aggregation === 'median')
        expect(rows[0].tooltip).toContain('Average split per run')
        expect(rows[0].tooltip).toContain('Tools:')
    })
})

describe('duration split in totals', () => {
    it('emits one stack per card with the legend naming every duration type', () => {
        const rows = totalsRows(source([conversationFact()]), controls({ dataset: 'totals', totalsMetric: 'duration' }))

        expect(rows.map((row) => [row.seriesIdentity, row.seriesLabel, row.value])).toEqual([
            ['tool', 'Tools', 50_000],
            ['reasoning', 'Reasoning', 20_000],
            ['agent', 'Agent', 30_000],
            ['unmeasured', 'Unmeasured', 0],
        ])
        expect(new Set(rows.map((row) => row.stackIdentity))).toEqual(new Set(['card-1']))
    })

    it('sorts bars by their stack total while keeping the component order inside each bar', () => {
        const rows = totalsRows(
            source([
                conversationFact({ cardInternalId: 'card-small', elapsedMs: 10_000, identity: 'conversation-2', reasoningMs: 1_000, toolMs: 2_000 }),
                conversationFact(),
            ]),
            controls({ dataset: 'totals', totalsMetric: 'duration' }),
        )

        expect(rows.map((row) => row.stackIdentity)).toEqual([
            'card-1', 'card-1', 'card-1', 'card-1',
            'card-small', 'card-small', 'card-small', 'card-small',
        ])
        expect(rows.slice(4).map((row) => row.seriesIdentity)).toEqual(['tool', 'reasoning', 'agent', 'unmeasured'])
    })

    it('reports a conversation recorded before the split as one unmeasured segment carrying its total', () => {
        const rows = totalsRows(
            source([conversationFact({ reasoningMs: null, toolMs: null })]),
            controls({ dataset: 'totals', totalsMetric: 'duration' }),
        )

        expect(rows.map((row) => row.value)).toEqual([0, 0, 0, 100_000])
        expect(rows[3].tooltip).toContain('Duration type: Unmeasured')
        expect(rows[3].tooltip).toContain('Share: 100% of 00:01:40')
    })
})
