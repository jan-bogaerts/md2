import type { StatsChartRow } from './project_stats_types';

/** One remembered series label: its palette family, its slot inside that family, and its global registration order. */
export interface StatsSeriesSlot {
    /** Normalized palette family key, or the empty string when the row names no family. */
    group: string;
    slot: number;
    order: number;
}

export type StatsSeriesSlots = ReadonlyMap<string, StatsSeriesSlot>;

interface NewSeriesLabel {
    group: string;
    label: string;
}

/** Color identity of a row: its series label, so the same label shares one color in every chart. */
export function seriesColorKey(row: StatsChartRow) {
    return row.seriesLabel ?? row.seriesIdentity ?? row.identity;
}

function rowGroup(row: StatsChartRow) {
    return (row.colorGroup ?? row.provider ?? row.agent ?? '').trim().toLowerCase();
}

function newSeriesLabels(slots: StatsSeriesSlots, rows: StatsChartRow[]) {
    const groupsByLabel = new Map<string, string>();
    for (const row of rows) {
        const label = seriesColorKey(row);
        if (slots.has(label) || groupsByLabel.has(label)) continue;
        groupsByLabel.set(label, rowGroup(row));
    }

    return [...groupsByLabel].map(([label, group]): NewSeriesLabel => ({ group, label }))
        .sort((left, right) => left.group.localeCompare(right.group) || left.label.localeCompare(right.label));
}

/**
 * Remembers every label in `rows` that `slots` does not know yet. Returns a new map when at least one
 * label was added, otherwise the same `slots` reference.
 */
export function registerSeriesLabels(slots: StatsSeriesSlots, rows: StatsChartRow[]): StatsSeriesSlots {
    const labels = newSeriesLabels(slots, rows);
    if (labels.length === 0) return slots;
    const registered = new Map(slots);
    const slotCounts = new Map<string, number>();
    for (const { group } of slots.values()) slotCounts.set(group, (slotCounts.get(group) ?? 0) + 1);

    for (const { group, label } of labels) {
        const slot = slotCounts.get(group) ?? 0;
        slotCounts.set(group, slot + 1);
        registered.set(label, { group, slot, order: registered.size });
    }

    return registered;
}
