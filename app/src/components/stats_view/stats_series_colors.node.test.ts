import { describe, expect, it } from 'vitest';
import type { StatsChartRow } from '../../services/stats/project_stats_types';
import { registerSeriesLabels, type StatsSeriesSlots } from '../../services/stats/stats_series_slots';
import { resolveSeriesColors, type StatsSeriesPalettes } from './stats_series_colors';

const PALETTES: StatsSeriesPalettes = {
    groups: {
        claude: ['#c1', '#c2'],
        codex: ['#x1', '#x2'],
    },
    neutral: ['#n1', '#c1', '#n2'],
};

function row(overrides: Partial<StatsChartRow> = {}): StatsChartRow {
    return {
        actionId: null,
        actionType: null,
        accessibleLabel: 'accessible',
        aggregation: null,
        agent: null,
        available: true,
        chartRole: 'primary',
        colorGroup: null,
        displayLabel: '18 Aug',
        grouping: 'day',
        identity: 'series',
        denominator: null,
        deviation: null,
        limitId: null,
        metric: 'tokens',
        numerator: null,
        provider: null,
        sampleCount: null,
        seriesIdentity: 'series',
        seriesLabel: 'Series',
        stackIdentity: null,
        stackLabel: null,
        statusCounts: null,
        tooltip: 'tooltip',
        unit: 'tokens',
        utcBucketEnd: null,
        utcBucketStart: null,
        value: 1,
        windowId: null,
        ...overrides,
    };
}

function seriesRow(label: string, provider: string | null) {
    return row({ identity: label, provider, seriesIdentity: label, seriesLabel: label });
}

function colorsFor(batches: StatsChartRow[][], palettes = PALETTES) {
    const emptySlots: StatsSeriesSlots = new Map();
    const slots = batches.reduce((current, rows) => registerSeriesLabels(current, rows), emptySlots);

    return resolveSeriesColors(slots, palettes);
}

describe('resolveSeriesColors', () => {
    it('draws each agent family from its own palette', () => {
        const colors = colorsFor([[seriesRow('claude-sonnet', 'claude'), seriesRow('claude-opus', 'claude'), seriesRow('codex-high', 'codex')]]);

        expect(colors.get('claude-opus')).toBe('#c1');
        expect(colors.get('claude-sonnet')).toBe('#c2');
        expect(colors.get('codex-high')).toBe('#x1');
    });

    it('matches the family case-insensitively, prefers colorGroup, and falls back to the agent', () => {
        const colors = colorsFor([[
            seriesRow('first', 'Claude'),
            row({ agent: 'CODEX', seriesLabel: 'second' }),
            row({ agent: 'claude', colorGroup: 'codex', seriesLabel: 'third' }),
        ]]);

        expect(colors.get('first')).toBe('#c1');
        expect(colors.get('second')).toBe('#x1');
        expect(colors.get('third')).toBe('#x2');
    });

    it('keeps earlier colors when later batches add or reorder labels', () => {
        const colors = colorsFor([
            [seriesRow('b', 'claude'), seriesRow('n-b', null)],
            [seriesRow('a', 'claude'), seriesRow('n-a', null), seriesRow('b', 'claude')],
        ]);

        expect(colors.get('b')).toBe('#c1');
        expect(colors.get('a')).toBe('#c2');
        expect(colors.get('n-b')).toBe('#n1');
        expect(colors.get('n-a')).toBe('#n2');
    });

    it('gives one label one color even when it appears under another family', () => {
        const colors = colorsFor([[seriesRow('review', 'claude'), seriesRow('review', 'codex')]]);

        expect([...colors]).toEqual([['review', '#c1']]);
    });

    it('never gives a neutral label a family palette color', () => {
        const colors = colorsFor([[seriesRow('neutral-one', null), seriesRow('neutral-two', null)], [seriesRow('claude-one', 'claude')]]);

        expect(colors.get('neutral-one')).toBe('#n1');
        expect(colors.get('neutral-two')).toBe('#n2');
        expect(colors.get('claude-one')).toBe('#c1');
    });

    it('gives labels past the palette end distinct colors that are the same on every resolve', () => {
        const batches = [[seriesRow('claude-1', 'claude'), seriesRow('claude-2', 'claude'), seriesRow('claude-3', 'claude'), seriesRow('claude-4', 'claude')]];
        const colors = colorsFor(batches);

        expect(new Set(colors.values()).size).toBe(4);
        expect(colors.get('claude-3')).toMatch(/^#[0-9a-f]{6}$/u);
        expect([...colorsFor(batches)]).toEqual([...colors]);
    });

    it('gives each duration component one hue and each agent one shade inside it', () => {
        const palettes: StatsSeriesPalettes = {
            groups: { 'duration:reasoning': ['#r1', '#r2'], 'duration:tool': ['#t1', '#t2'] },
            neutral: ['#n1'],
        };
        const segment = (agent: string, component: string) => row({ agent, colorGroup: `duration:${component}`, seriesLabel: `${agent} - ${component}` });
        const colors = colorsFor([[segment('codex', 'tool'), segment('claude', 'tool'), segment('codex', 'reasoning'), segment('claude', 'reasoning')]], palettes);

        expect(colors.get('claude - tool')).toBe('#t1');
        expect(colors.get('codex - tool')).toBe('#t2');
        expect(colors.get('claude - reasoning')).toBe('#r1');
        expect(colors.get('codex - reasoning')).toBe('#r2');
    });
});
