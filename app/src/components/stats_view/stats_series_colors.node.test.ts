import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StatsChartRow } from '../../services/stats/project_stats_types';
import { assignSeriesColors, seriesColorKey, type StatsSeriesPalettes } from './stats_series_colors';

const PALETTES: StatsSeriesPalettes = {
    groups: {
        claude: ['#c1', '#c2'],
        codex: ['#x1', '#x2'],
    },
    neutral: ['#n1', '#n2', '#c1'],
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

function seriesRow(identity: string, provider: string | null) {
    return row({ identity, provider, seriesIdentity: identity, seriesLabel: identity });
}

function assignedColor(colors: Map<string, string>, targetRow: StatsChartRow) {
    return colors.get(seriesColorKey(targetRow, Object.keys(PALETTES.groups)));
}

describe('assignSeriesColors', () => {
    afterEach(() => vi.restoreAllMocks());

    it('draws each agent family from its own palette', () => {
        const claudeSonnet = seriesRow('claude-sonnet', 'claude');
        const claudeOpus = seriesRow('claude-opus', 'claude');
        const codexHigh = seriesRow('codex-high', 'codex');
        const colors = assignSeriesColors([claudeSonnet, claudeOpus, codexHigh], PALETTES);

        expect(assignedColor(colors, claudeOpus)).toBe('#c1');
        expect(assignedColor(colors, claudeSonnet)).toBe('#c2');
        expect(assignedColor(colors, codexHigh)).toBe('#x1');
    });

    it('matches the family case-insensitively and falls back to the agent when no provider is set', () => {
        const claudeRow = seriesRow('first', 'Claude');
        const codexRow = row({ agent: 'CODEX', identity: 'second', seriesIdentity: 'second' });
        const colors = assignSeriesColors([claudeRow, codexRow], PALETTES);

        expect(assignedColor(colors, claudeRow)).toBe('#c1');
        expect(assignedColor(colors, codexRow)).toBe('#x1');
    });

    it('assigns the same colors whatever order the rows arrive in', () => {
        const rows = [seriesRow('b', 'claude'), seriesRow('a', 'claude'), seriesRow('c', 'codex'), seriesRow('d', null)];

        expect([...assignSeriesColors(rows, PALETTES)]).toEqual([...assignSeriesColors([...rows].reverse(), PALETTES)]);
    });

    it('gives ungrouped series neutral colors that never collide with a family color', () => {
        const neutralOne = seriesRow('neutral-one', null);
        const neutralTwo = seriesRow('neutral-two', null);
        const neutralThree = seriesRow('neutral-three', null);
        const claudeOne = seriesRow('claude-one', 'claude');
        const colors = assignSeriesColors([neutralOne, neutralTwo, neutralThree, claudeOne], PALETTES);

        expect(assignedColor(colors, claudeOne)).toBe('#c1');
        expect(assignedColor(colors, neutralOne)).toBe('#n1');
        expect(assignedColor(colors, neutralThree)).toBe('#n2');
        // '#c1' is in the neutral list too, and is skipped because the claude family already took it.
        expect(assignedColor(colors, neutralTwo)).not.toBe('#c1');
        expect(new Set(colors.values()).size).toBe(4);
    });

    it('generates unique overflow colors once a family list runs out', () => {
        const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0.01).mockReturnValueOnce(0.02);
        const colors = assignSeriesColors([
            seriesRow('claude-1', 'claude'),
            seriesRow('claude-2', 'claude'),
            seriesRow('claude-3', 'claude'),
        ], PALETTES);

        expect(new Set(colors.values()).size).toBe(3);
        expect(random).toHaveBeenCalledTimes(1);
    });

    it('retries when a generated overflow color collides with an assigned color', () => {
        const palettes: StatsSeriesPalettes = { groups: { claude: ['#000001'] }, neutral: [] };
        const random = vi.spyOn(Math, 'random')
            .mockReturnValueOnce(1 / 0x1000000)
            .mockReturnValueOnce(0.5);
        const claudeOne = seriesRow('claude-1', 'claude');
        const claudeTwo = seriesRow('claude-2', 'claude');
        const colors = assignSeriesColors([claudeOne, claudeTwo], palettes);

        expect(colors.get(seriesColorKey(claudeOne, ['claude']))).toBe('#000001');
        expect(colors.get(seriesColorKey(claudeTwo, ['claude']))).not.toBe('#000001');
        expect(random).toHaveBeenCalledTimes(2);
    });

    it('keeps a shared series identity inside each row agent family', () => {
        const claudeRow = seriesRow('review', 'claude');
        const codexRow = seriesRow('review', 'codex');
        const colors = assignSeriesColors([claudeRow, codexRow], PALETTES);

        expect(assignedColor(colors, claudeRow)).toBe('#c1');
        expect(assignedColor(colors, codexRow)).toBe('#x1');
    });
});
