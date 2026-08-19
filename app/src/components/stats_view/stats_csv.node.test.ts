import { describe, expect, it } from 'vitest';
import type { StatsChartRow } from '../../services/stats/project_stats_service';
import { serializeStatsCsv } from './stats_csv';

function row(overrides: Partial<StatsChartRow> = {}): StatsChartRow {
    return {
        accessibleLabel: 'accessible',
        available: true,
        chartRole: 'primary',
        displayLabel: 'F_1: Review, "carefully"',
        grouping: 'card',
        identity: 'card-1',
        metric: 'tokens',
        sampleCount: null,
        seriesIdentity: null,
        seriesLabel: null,
        stackIdentity: null,
        statusCounts: null,
        tooltip: 'tooltip',
        unit: 'tokens',
        utcBucketEnd: null,
        utcBucketStart: null,
        value: 42,
        ...overrides,
    };
}

describe('serializeStatsCsv', () => {
    it('exports exact filtered totals rows as RFC 4180', () => {
        expect(serializeStatsCsv('totals', [row()])).toBe([
            'dataset,chart_role,available,grouping,utc_bucket_start,utc_bucket_end,identity,series_identity,series_label,stack_identity,display_label,metric,unit,value,sample_count,completed_count,failed_count,cancelled_count',
            'totals,primary,true,card,,,card-1,,,,"F_1: Review, ""carefully""",tokens,tokens,42,,,,',
            '',
        ].join('\r\n'));
    });

    it('exports one grouped row per bucket and series with sample and status counts', () => {
        const csv = serializeStatsCsv('agentPerformance', [row({
            chartRole: 'primary',
            displayLabel: '18 Aug',
            grouping: 'model',
            identity: 'codex\u0000gpt-5',
            metric: 'duration',
            sampleCount: 4,
            seriesIdentity: 'codex\u0000gpt-5',
            seriesLabel: 'codex - gpt-5',
            statusCounts: { cancelled: 1, completed: 2, failed: 1 },
            unit: 'milliseconds',
            utcBucketEnd: '2026-08-19T00:00:00.000Z',
            utcBucketStart: '2026-08-18T00:00:00.000Z',
            value: 1250.5,
        })]);

        expect(csv).toContain('2026-08-18T00:00:00.000Z,2026-08-19T00:00:00.000Z');
        expect(csv).toContain('duration,milliseconds,1250.5,4,2,1,1');
    });

    it('exports stacked action identity separately', () => {
        const csv = serializeStatsCsv('activityOverTime', [row({
            identity: 'review',
            seriesIdentity: 'review',
            seriesLabel: 'Review',
            stackIdentity: 'review',
            utcBucketEnd: '2026-08-19T00:00:00.000Z',
            utcBucketStart: '2026-08-18T00:00:00.000Z',
        })]);

        expect(csv).toContain('review,review,Review,review');
    });
});
