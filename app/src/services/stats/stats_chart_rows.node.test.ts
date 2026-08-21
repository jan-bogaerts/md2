import { describe, expect, it } from 'vitest'
import { emptyTimeRow, unavailableTimeRow } from './stats_chart_rows'
import { bucketContext } from './stats_time_buckets'

const context = bucketContext('2026-08-12T00:00:00.000Z', 'day')

describe('emptyTimeRow', () => {
    it('keeps the bucket present with a zero value and available data', () => {
        const row = emptyTimeRow(context, 'day', 'primary', 'actions', 'actions')

        expect(row).toMatchObject({
            available: true,
            grouping: 'day',
            identity: '2026-08-12T00:00:00.000Z',
            utcBucketEnd: '2026-08-13T00:00:00.000Z',
            utcBucketStart: '2026-08-12T00:00:00.000Z',
            value: 0,
        })
    })

    it('carries the UTC interval and unit in the tooltip and the accessible label', () => {
        const row = emptyTimeRow(context, 'day', 'projectTokens', 'tokens', 'tokens')

        expect(row.tooltip).toContain('UTC 2026-08-12T00:00:00.000Z to 2026-08-13T00:00:00.000Z; 0 tokens')
        expect(row.accessibleLabel).toBe(row.tooltip)
    })
})

describe('unavailableTimeRow', () => {
    it('marks the bucket unavailable while keeping the value numerically zero', () => {
        const row = unavailableTimeRow(context, 'day', 'accountUsage', 'accountUsage', 'percentagePoints', 'positive account usage')

        expect(row).toMatchObject({ available: false, chartRole: 'accountUsage', value: 0 })
        expect(row.tooltip).toContain('positive account usage unavailable')
        expect(row.accessibleLabel).toBe(row.tooltip)
    })
})
