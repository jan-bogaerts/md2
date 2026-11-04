import { describe, expect, it } from 'vitest'
import { parseUsageMetrics } from './project_usage_metrics_service'

const legacyMetricsHeader = [
    'recorded_at', 'record_type', 'provider', 'limit_id', 'window_id', 'window_duration_minutes',
    'resets_at', 'input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_tokens',
    'total_tokens', 'used_percent', 'used_percent_delta',
].join(',')
const metricsHeader = `${legacyMetricsHeader},account_id`

describe('project usage metrics parsing', () => {
    it('reads account identities and treats legacy rows below an extended header as the initial account', () => {
        const legacyRow = '2026-08-12T09:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T00:00:00.000Z,,,,,,20,'
        const workRow = '2026-08-12T09:30:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T00:00:00.000Z,,,,,,70,,work'
        const initialRow = '2026-08-12T10:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T00:00:00.000Z,,,,,,25,5,codex-initial'
        const tokenRow = '2026-08-12T10:30:00.000Z,token_usage,codex,,,,,3,2,4,1,10,,,work'
        const content = `${metricsHeader}\r\n${legacyRow}\r\n${workRow}\r\n${initialRow}\r\n${tokenRow}\r\n`

        const parsed = parseUsageMetrics(content)

        expect(parsed.accountRows.map(({ accountId, usedPercentDelta }) => ({ accountId, usedPercentDelta }))).toEqual([
            { accountId: 'codex-initial', usedPercentDelta: null },
            { accountId: 'work', usedPercentDelta: null },
            { accountId: 'codex-initial', usedPercentDelta: 5 },
        ])
        expect(parsed.tokenRows).toEqual([{ accountId: 'work', provider: 'codex', recordedAt: '2026-08-12T10:30:00.000Z', totalTokens: 10 }])
    })

    it('never repairs a delta against another account of the same provider', () => {
        const initialRow = '2026-08-12T09:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T00:00:00.000Z,,,,,,20,,codex-initial'
        const workRow = '2026-08-12T10:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T00:00:00.000Z,,,,,,70,,work'

        const accountRows = parseUsageMetrics(`${metricsHeader}\r\n${initialRow}\r\n${workRow}\r\n`).accountRows

        expect(accountRows.at(-1)?.usedPercentDelta).toBeNull()
    })

    it('keeps valid token rows and warns when malformed account usage is skipped', () => {
        const malformedAccountRow = '2026-08-12T09:00:00.000Z,account_usage,codex,weekly,window,0,broken,,,,,,50,'
        const tokenRow = '2026-08-12T10:00:00.000Z,token_usage,codex,,,,,3,2,4,1,10,,'

        expect(parseUsageMetrics(`${legacyMetricsHeader}\r\n${malformedAccountRow}\r\n${tokenRow}\r\n`)).toEqual({
            accountRows: [],
            tokenRows: [{ accountId: 'codex-initial', provider: 'codex', recordedAt: '2026-08-12T10:00:00.000Z', totalTokens: 10 }],
            warnings: ['Malformed account_usage row 2 was skipped.'],
        })
    })

    it('retains separated account observations and negative corrections', () => {
        const first = '2026-08-12T09:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T00:00:00.000Z,,,,,,50,'
        const correction = '2026-08-12T10:00:00.000Z,account_usage,codex,weekly,window-b,10080,2026-08-24T00:00:00.000Z,,,,,,48,-2.5'

        expect(parseUsageMetrics(`${legacyMetricsHeader}\r\n${first}\r\n${correction}\r\n`).accountRows).toEqual([
            {
                accountId: 'codex-initial', limitId: 'weekly', provider: 'codex', recordedAt: '2026-08-12T09:00:00.000Z',
                resetsAt: '2026-08-17T00:00:00.000Z', usedPercent: 50, usedPercentDelta: null,
                windowDurationMinutes: 10080, windowId: 'window-a',
            },
            {
                accountId: 'codex-initial', limitId: 'weekly', provider: 'codex', recordedAt: '2026-08-12T10:00:00.000Z',
                resetsAt: '2026-08-24T00:00:00.000Z', usedPercent: 48, usedPercentDelta: -2.5,
                windowDurationMinutes: 10080, windowId: 'window-b',
            },
        ])
    })

    it('repairs historical deltas caused by one-minute reset timestamp drift', () => {
        const baseline = '2026-08-12T09:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T17:00:00.000Z,,,,,,20,'
        const drifted = '2026-08-12T10:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T16:59:00.000Z,,,,,,27.88,27.88'

        const accountRows = parseUsageMetrics(`${legacyMetricsHeader}\r\n${baseline}\r\n${drifted}\r\n`).accountRows

        expect(accountRows.at(-1)?.resetsAt).toBe('2026-08-17T16:59:00.000Z')
        expect(accountRows.at(-1)?.usedPercentDelta).toBeCloseTo(7.88)
    })

    it('rejects malformed token totals because chart data would be incorrect', () => {
        const tokenRow = '2026-08-12T10:00:00.000Z,token_usage,codex,,,,,3,2,4,1,99,,'

        expect(() => parseUsageMetrics(`${legacyMetricsHeader}\n${tokenRow}`))
            .toThrow('Inconsistent usage metrics total_tokens')
    })
})
