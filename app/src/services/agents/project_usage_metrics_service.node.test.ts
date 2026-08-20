import { describe, expect, it } from 'vitest'
import { parseUsageMetrics } from './project_usage_metrics_service'

const metricsHeader = [
    'recorded_at', 'record_type', 'provider', 'limit_id', 'window_id', 'window_duration_minutes',
    'resets_at', 'input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_tokens',
    'total_tokens', 'used_percent', 'used_percent_delta',
].join(',')

describe('project usage metrics parsing', () => {
    it('keeps valid token rows and warns when malformed account usage is skipped', () => {
        const malformedAccountRow = '2026-08-12T09:00:00.000Z,account_usage,codex,weekly,window,0,broken,,,,,,50,'
        const tokenRow = '2026-08-12T10:00:00.000Z,token_usage,codex,,,,,3,2,4,1,10,,'

        expect(parseUsageMetrics(`${metricsHeader}\r\n${malformedAccountRow}\r\n${tokenRow}\r\n`)).toEqual({
            accountRows: [],
            tokenRows: [{ provider: 'codex', recordedAt: '2026-08-12T10:00:00.000Z', totalTokens: 10 }],
            warnings: ['Malformed account_usage row 2 was skipped.'],
        })
    })

    it('retains separated account observations and negative corrections', () => {
        const first = '2026-08-12T09:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T00:00:00.000Z,,,,,,50,'
        const correction = '2026-08-12T10:00:00.000Z,account_usage,codex,weekly,window-b,10080,2026-08-24T00:00:00.000Z,,,,,,48,-2.5'

        expect(parseUsageMetrics(`${metricsHeader}\r\n${first}\r\n${correction}\r\n`).accountRows).toEqual([
            {
                limitId: 'weekly', provider: 'codex', recordedAt: '2026-08-12T09:00:00.000Z',
                resetsAt: '2026-08-17T00:00:00.000Z', usedPercent: 50, usedPercentDelta: null,
                windowDurationMinutes: 10080, windowId: 'window-a',
            },
            {
                limitId: 'weekly', provider: 'codex', recordedAt: '2026-08-12T10:00:00.000Z',
                resetsAt: '2026-08-24T00:00:00.000Z', usedPercent: 48, usedPercentDelta: -2.5,
                windowDurationMinutes: 10080, windowId: 'window-b',
            },
        ])
    })

    it('rejects malformed token totals because chart data would be incorrect', () => {
        const tokenRow = '2026-08-12T10:00:00.000Z,token_usage,codex,,,,,3,2,4,1,99,,'

        expect(() => parseUsageMetrics(`${metricsHeader}\n${tokenRow}`))
            .toThrow('Inconsistent usage metrics total_tokens')
    })
})
