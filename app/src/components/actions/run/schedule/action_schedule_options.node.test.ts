import { describe, expect, it } from 'vitest'
import type { Card } from '../../../../data/data_types'
import { accountTrackerOptions, cardScheduleOptions, scheduleTargetStates } from './action_schedule_options'

describe('action schedule options', () => {
    it('projects exact live account windows and keeps reset-less windows visible', () => {
        const trackers = accountTrackerOptions(
            {
                receivedAt: 1,
                stale: false,
                snapshot: {
                    available: true,
                    observedAt: 1,
                    windows: [{ id: 'five_hour', resetsAt: null, usedPercent: 20 }],
                },
            },
            {
                receivedAt: 1,
                stale: false,
                snapshot: {
                    available: true,
                    buckets: [{
                        credits: null,
                        individualLimit: null,
                        limitId: 'codex,pro',
                        limitName: 'Pro',
                        planType: null,
                        primary: { resetsAt: 1_800_000_000, usedPercent: 42, windowDurationMins: 300 },
                        rateLimitReachedType: null,
                        secondary: null,
                    }],
                    observedAt: 1,
                    rateLimitResetCredits: null,
                },
            },
        )

        expect(trackers).toEqual([
            expect.objectContaining({ agent: 'claude', expectedResetAt: null, limitId: 'default', windowId: 'five_hour' }),
            expect.objectContaining({agent: 'codex', expectedResetAt: '2027-01-15T08:00:00.000Z', limitId: 'codex,pro', windowId: 'primary'}),
        ])
    })

    it('omits unavailable snapshots, current card, and cards without internal identity', () => {
        const cards = [
            { header: { internalId: 'current', status: 'new', title: 'Current' }, path: 'design/F_1.md' },
            { header: { internalId: 'other', status: 'doing', title: 'Other' }, path: 'design/F_2.md' },
            { header: { internalId: null, status: 'new', title: 'Missing' }, path: 'design/F_3.md' },
        ] as Card[]

        expect(cardScheduleOptions(cards, 'current')).toEqual([{cardInternalId: 'other', label: 'Other · design/F_2.md', registrationState: 'doing'}])
        expect(scheduleTargetStates([{ alwaysVisible: true, state: 'ready' }])).toEqual(['ready'])
        expect(accountTrackerOptions(
            { receivedAt: null, snapshot: null, stale: false },
            { receivedAt: 1, snapshot: null, stale: true },
        )).toEqual([])
    })
})
