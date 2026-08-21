import { describe, expect, it } from 'vitest'
import { INITIAL_CONTROLS, type StatsControls } from './project_stats_types'
import {
    bucketContext,
    bucketDomain,
    bucketIdentityKey,
    inRange,
    indexByBucket,
    indexByBucketAndIdentity,
    nextUtcBucket,
    utcBucketStart,
} from './stats_time_buckets'

function controls(overrides: Partial<StatsControls> = {}): StatsControls {
    return { ...INITIAL_CONTROLS, ...overrides }
}

function record(recordedAt: string, provider: string | null = 'codex') {
    return { provider, recordedAt }
}

describe('utcBucketStart', () => {
    it('truncates to the UTC day, ISO week Monday, and month regardless of local time', () => {
        expect(utcBucketStart('2026-08-12T23:30:00.000Z', 'day')).toBe('2026-08-12T00:00:00.000Z')
        expect(utcBucketStart('2026-08-12T23:30:00.000Z', 'week')).toBe('2026-08-10T00:00:00.000Z')
        expect(utcBucketStart('2026-08-12T23:30:00.000Z', 'month')).toBe('2026-08-01T00:00:00.000Z')
    })

    it('keeps a Sunday inside the ISO week that started the previous Monday', () => {
        expect(utcBucketStart('2026-08-16T12:00:00.000Z', 'week')).toBe('2026-08-10T00:00:00.000Z')
        expect(utcBucketStart('2026-08-17T00:00:00.000Z', 'week')).toBe('2026-08-17T00:00:00.000Z')
    })
})

describe('nextUtcBucket', () => {
    it('advances by one day, seven days, or one month', () => {
        expect(nextUtcBucket('2026-08-12T00:00:00.000Z', 'day')).toBe('2026-08-13T00:00:00.000Z')
        expect(nextUtcBucket('2026-08-10T00:00:00.000Z', 'week')).toBe('2026-08-17T00:00:00.000Z')
        expect(nextUtcBucket('2026-08-01T00:00:00.000Z', 'month')).toBe('2026-09-01T00:00:00.000Z')
    })

    it('crosses year boundaries for every granularity', () => {
        expect(nextUtcBucket('2026-12-31T00:00:00.000Z', 'day')).toBe('2027-01-01T00:00:00.000Z')
        expect(nextUtcBucket('2026-12-01T00:00:00.000Z', 'month')).toBe('2027-01-01T00:00:00.000Z')
    })
})

describe('inRange', () => {
    it('includes both range boundaries and rejects timestamps outside them', () => {
        const range = controls({ endUtc: '2026-08-12T00:00:00.000Z', startUtc: '2026-08-10T00:00:00.000Z' })

        expect(inRange('2026-08-10T00:00:00.000Z', range)).toBe(true)
        expect(inRange('2026-08-12T00:00:00.000Z', range)).toBe(true)
        expect(inRange('2026-08-09T23:59:59.999Z', range)).toBe(false)
        expect(inRange('2026-08-12T00:00:00.001Z', range)).toBe(false)
    })

    it('accepts every timestamp when no range is selected', () => {
        expect(inRange('1999-01-01T00:00:00.000Z', controls())).toBe(true)
    })
})

describe('bucketDomain', () => {
    it('zero-fills gaps between the first and last in-range timestamp', () => {
        expect(bucketDomain(['2026-08-12T10:00:00.000Z', '2026-08-10T10:00:00.000Z'], 'day', controls())).toEqual([
            '2026-08-10T00:00:00.000Z',
            '2026-08-11T00:00:00.000Z',
            '2026-08-12T00:00:00.000Z',
        ])
    })

    it('spans the selected range even when no record falls inside it', () => {
        const range = controls({ endUtc: '2026-08-03T00:00:00.000Z', startUtc: '2026-08-01T00:00:00.000Z' })

        expect(bucketDomain([], 'day', range)).toEqual([
            '2026-08-01T00:00:00.000Z',
            '2026-08-02T00:00:00.000Z',
            '2026-08-03T00:00:00.000Z',
        ])
    })

    it('returns no buckets without timestamps or an inverted range', () => {
        expect(bucketDomain([], 'day', controls())).toEqual([])
        expect(bucketDomain(['2026-08-12T10:00:00.000Z'], 'day', controls({ startUtc: '2026-09-01T00:00:00.000Z' }))).toEqual([])
    })
})

describe('bucketContext', () => {
    it('reports the UTC interval bounds used by row tooltips', () => {
        const context = bucketContext('2026-08-10T00:00:00.000Z', 'week')

        expect(context.start).toBe('2026-08-10T00:00:00.000Z')
        expect(context.end).toBe('2026-08-17T00:00:00.000Z')
        expect(context.interval).toBe('2026-08-10T00:00:00.000Z to 2026-08-17T00:00:00.000Z')
        expect(context.displayLabel).toContain('W33')
    })
})

describe('indexByBucket', () => {
    it('groups records by bucket and keeps their input order inside each bucket', () => {
        const records = [
            record('2026-08-12T09:00:00.000Z'),
            record('2026-08-10T09:00:00.000Z'),
            record('2026-08-12T11:00:00.000Z'),
        ]

        const index = indexByBucket(records, 'day', ({ recordedAt }) => recordedAt)

        expect(index.get('2026-08-12T00:00:00.000Z')).toEqual([records[0], records[2]])
        expect(index.get('2026-08-10T00:00:00.000Z')).toEqual([records[1]])
        expect(index.get('2026-08-11T00:00:00.000Z')).toBeUndefined()
    })
})

describe('indexByBucketAndIdentity', () => {
    it('separates identities inside one bucket and skips records without an identity', () => {
        const records = [
            record('2026-08-12T09:00:00.000Z', 'codex'),
            record('2026-08-12T10:00:00.000Z', 'claude'),
            record('2026-08-12T11:00:00.000Z', null),
        ]

        const index = indexByBucketAndIdentity(records, 'day', ({ recordedAt }) => recordedAt, ({ provider }) => provider)

        expect(index.get(bucketIdentityKey('2026-08-12T00:00:00.000Z', 'codex'))).toEqual([records[0]])
        expect(index.get(bucketIdentityKey('2026-08-12T00:00:00.000Z', 'claude'))).toEqual([records[1]])
        expect(index.size).toBe(2)
    })
})
