import { describe, expect, it } from 'vitest';
import { bucketContext } from './stats_time_buckets';
import { formatBucketRange, formatCount, formatDurationHms, formatTimestamp, formatWindow, statsTooltip } from './stats_tooltip';

describe('stats tooltip formatting', () => {
    it('formats labelled multiline content and a local bucket range without raw ISO text', () => {
        const context = bucketContext('2026-08-12T00:00:00.000Z', 'day');
        const range = formatBucketRange(context);
        const tooltip = statsTooltip([
            { label: null, value: range },
            { label: 'Project tokens', value: formatCount(1_234.567) },
        ]);

        expect(tooltip).toContain(`\nProject tokens: ${formatCount(1_234.567)}`);
        expect(range).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone);
        expect(range).not.toContain('2026-08-12T00:00:00.000Z');
    });

    it('formats durations as zero-padded HH:MM:SS that may pass 99 hours', () => {
        expect(formatDurationHms(0)).toBe('00:00:00')
        expect(formatDurationHms(3_723_000)).toBe('01:02:03')
        expect(formatDurationHms(59_999)).toBe('00:00:59')
        expect(formatDurationHms(360_000_000)).toBe('100:00:00')
        expect(formatDurationHms(-5)).toBe('00:00:00')
    });

    it('formats timestamps and window durations for readers', () => {
        expect(formatTimestamp('2026-08-12T10:00:00.000Z')).not.toContain('2026-08-12T10:00:00.000Z');
        expect(formatWindow(10_080)).toBe('7 days');
        expect(formatWindow(300)).toBe('5 hours');
        expect(formatWindow(30)).toBe('30 minutes');
    });
});
