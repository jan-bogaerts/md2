import { describe, expect, it } from 'vitest'
import type { CardActivityFile } from '../../../../shared/card_activity.mjs'
import {
    calculateActivityStats,
    parseProjectStatsFile,
    projectStatsFilePath,
    serializeProjectStats,
} from '../../../../shared/project_stats.mjs'

function activity(): CardActivityFile {
    const origin = { cardInternalId: 'card-1', kind: 'card' } as const

    return {
        actionSettings: {},
        conversations: [{
            actionId: 'review',
            cardInternalId: 'card-1',
            cardPath: 'design/F_1.md',
            completedAt: '2026-08-12T10:00:00.000Z',
            entries: [{ content: 'large transcript', id: 'message-1', kind: 'message', role: 'assistant', timestamp: '2026-08-12T10:00:00.000Z' }],
            hasExplicitTitle: true,
            id: 'conversation-1',
            providerSessions: [],
            startedAt: '2026-08-12T09:00:00.000Z',
            status: 'completed',
            timer: { elapsedMs: 1_500, runningStartedAt: null },
            title: 'Review',
            usage: { cachedInputTokens: 2, inputTokens: 3, outputTokens: 4, reasoningTokens: 1, totalTokens: 10 },
            usageSchemaVersion: 1,
            viewed: true,
        }],
        origin,
        records: [{
            commits: [],
            completedAt: '2026-08-12T10:00:00.000Z',
            conversationIds: [],
            details: { command: 'review', output: '', type: 'command' },
            origin,
            rootActionId: 'review',
            rootActionLabel: 'Review',
            runId: 'run-1',
            startedAt: '2026-08-12T09:00:00.000Z',
            status: 'completed',
        }],
        version: 4,
    }
}

describe('project stats schema', () => {
    it('calculates compact chart facts with stable identities', () => {
        const facts = calculateActivityStats([activity(), activity()])

        expect(facts.actions).toEqual([expect.objectContaining({ identity: 'card:card-1:run-1' })])
        expect(facts.conversations).toEqual([expect.objectContaining({
            elapsedMs: 1_500,
            identity: 'card:card-1:conversation-1',
            totalTokens: 10,
        })])
        expect(facts.conversations[0]).not.toHaveProperty('entries')
    })

    it('strictly validates entries while keeping valid releases', () => {
        const valid = calculateActivityStats([activity()])
        const content = JSON.stringify({
            releases: {
                broken: { actions: [{ identity: 'missing-fields' }], conversations: [] },
                v1: valid,
            },
            version: 1,
        })

        const parsed = parseProjectStatsFile(content, 'design/project_stats.json')

        expect(parsed.releases).toEqual({ v1: valid })
        expect(parsed.warnings).toEqual([expect.stringContaining('design/project_stats.json: broken:')])
    })

    it('round trips release facts without transcript content', () => {
        const releases = { v1: calculateActivityStats([activity()]) }
        const serialized = serializeProjectStats(releases)

        expect(projectStatsFilePath('design')).toBe('design/project_stats.json')
        expect(serialized).not.toContain('large transcript')
        expect(parseProjectStatsFile(serialized, 'design/project_stats.json').releases).toEqual(releases)
    })

    it('rejects malformed root schema', () => {
        expect(() => parseProjectStatsFile('{"releases":{},"version":2}', 'design/project_stats.json'))
            .toThrow('unsupported version 2')
        expect(() => parseProjectStatsFile('{broken', 'design/project_stats.json')).toThrow()
    })
})
