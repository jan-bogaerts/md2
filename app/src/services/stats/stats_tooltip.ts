import type { StatsBucketContext } from './stats_time_buckets';

export interface StatsTooltipLine {
    label: string | null;
    value: string;
}

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Formats labelled tooltip lines while allowing an unlabelled local bucket heading. */
export function statsTooltip(lines: StatsTooltipLine[]) {
    return lines.map(({ label, value }) => label ? `${label}: ${value}` : value).join('\n');
}

export function accessibleStatsTooltip(tooltip: string) {
    return tooltip.replaceAll('\n', '; ');
}

export function formatBucketRange(context: StatsBucketContext) {
    return `${context.localLabel} (${timeZone})`;
}

export function formatTimestamp(isoTimestamp: string) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(isoTimestamp));
}

export function formatWindow(minutes: number) {
    const hours = minutes / 60;
    const days = hours / 24;
    if (Number.isInteger(days)) return `${formatCount(days)} ${days === 1 ? 'day' : 'days'}`;
    if (Number.isInteger(hours)) return `${formatCount(hours)} ${hours === 1 ? 'hour' : 'hours'}`;

    return `${formatCount(minutes)} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

export function formatCount(value: number) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}
