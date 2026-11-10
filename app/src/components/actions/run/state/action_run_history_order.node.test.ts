import { describe, expect, it } from 'vitest';
import type { ActionRunHistoryEntry } from '../../../../data/electron_action_bridge';
import { newestFirstHistoryEntries } from './action_run_history_order';

function commandEntry(command: string, completedAt: string): ActionRunHistoryEntry {
    return { command, completedAt, output: `${command} output`, startedAt: '2026-07-05T09:00:00.000Z', status: 'completed', type: 'command' };
}

describe('newestFirstHistoryEntries', () => {
    it('orders entries by descending completion time', () => {
        const oldest = commandEntry('oldest', '2026-07-05T10:00:00.000Z');
        const newest = commandEntry('newest', '2026-07-05T12:00:00.000Z');
        const middle = commandEntry('middle', '2026-07-05T11:00:00.000Z');

        const ordered = newestFirstHistoryEntries([oldest, newest, middle]);

        expect(ordered).toEqual([
            { entry: newest, sourceIndex: 1 },
            { entry: middle, sourceIndex: 2 },
            { entry: oldest, sourceIndex: 0 },
        ]);
    });

    it('places later source entries first when completion times are equal', () => {
        const completedAt = '2026-07-05T12:00:00.000Z';
        const firstTied = commandEntry('first tied', completedAt);
        const laterTied = commandEntry('later tied', completedAt);

        const ordered = newestFirstHistoryEntries([firstTied, laterTied]);

        expect(ordered).toEqual([
            { entry: laterTied, sourceIndex: 1 },
            { entry: firstTied, sourceIndex: 0 },
        ]);
    });

    it('leaves the source array order unchanged', () => {
        const oldest = commandEntry('oldest', '2026-07-05T10:00:00.000Z');
        const newest = commandEntry('newest', '2026-07-05T12:00:00.000Z');
        const entries = [oldest, newest];

        newestFirstHistoryEntries(entries);

        expect(entries).toEqual([oldest, newest]);
    });
});
