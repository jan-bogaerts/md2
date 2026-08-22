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

export function formatDollars(value: number) {
    return new Intl.NumberFormat(undefined, { currency: 'USD', style: 'currency' }).format(value);
}

/**
 * Always HH:MM:SS, hours zero-padded to two digits and free to pass 99 for long totals.
 * `formatDuration` in conversation_duration.ts is deliberately not reused: it drops hours below one
 * hour, does not pad them, and sits on the chat timer's hot path.
 */
export function formatDurationHms(milliseconds: number) {
    const totalSeconds = Math.max(Math.floor(milliseconds / 1_000), 0);
    const hours = Math.floor(totalSeconds / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

export function formatCount(value: number) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}
