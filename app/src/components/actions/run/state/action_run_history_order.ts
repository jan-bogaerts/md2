import type { ActionRunHistoryEntry } from '../../../../data/electron_action_bridge';

interface IndexedHistoryEntry {
    entry: ActionRunHistoryEntry;
    sourceIndex: number;
}

function compareHistoryEntries(first: IndexedHistoryEntry, second: IndexedHistoryEntry) {
    const completedAtDifference = Date.parse(second.entry.completedAt) - Date.parse(first.entry.completedAt);
    if (completedAtDifference !== 0) return completedAtDifference;

    return second.sourceIndex - first.sourceIndex;
}

/** Orders entries newest first without mutating the source; later source entries win equal timestamps. */
export function newestFirstHistoryEntries(entries: ActionRunHistoryEntry[]) {
    return entries
        .map((entry, sourceIndex) => ({ entry, sourceIndex }))
        .sort(compareHistoryEntries);
}
