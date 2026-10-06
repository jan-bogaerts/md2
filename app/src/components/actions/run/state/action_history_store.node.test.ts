import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionDefinition } from '../../../../data/action_types';
import type { ActionRunHistoryEntry } from '../../../../data/electron_action_bridge';
import * as defaults from '../popup/action_popup_defaults';
import { ActionHistoryStore } from './action_history_store';

const action = { id: 'build', label: 'Build', type: 'command' } as ActionDefinition;

describe('ActionHistoryStore.configure', () => {
    afterEach(() => vi.restoreAllMocks());

    it('uses updated assignment for later history loading without clearing existing entries', async () => {
        const context = { kind: 'project' as const, worktree: '1', worktreeBranch: 'first' };
        const entries: ActionRunHistoryEntry[] = [{
            command: 'build', completedAt: '2026-01-01T00:01:00Z', output: 'Existing output',
            startedAt: '2026-01-01T00:00:00Z', status: 'completed', type: 'command',
        }];
        const load = vi.spyOn(defaults, 'defaultLoadHistory').mockResolvedValue(entries);
        const store = new ActionHistoryStore(action, context);
        await store.load();
        const updatedContext = { ...context, worktree: '2', worktreeBranch: 'second' };

        store.configure(action, updatedContext, null);
        expect(store.getSnapshot().entries).toBe(entries);
        await store.load();

        expect(load).toHaveBeenLastCalledWith(action, updatedContext);
    });

    it('applies newly loaded historical entries to the existing store', () => {
        const context = { kind: 'file' as const, cardInternalId: 'card-1' };
        const store = new ActionHistoryStore(action, context);
        const entries: ActionRunHistoryEntry[] = [{
            command: 'build', completedAt: '2026-01-01T00:01:00Z', output: 'Historical output',
            startedAt: '2026-01-01T00:00:00Z', status: 'completed', type: 'command',
        }];

        store.configure(action, context, entries);

        expect(store.getSnapshot().entries).toBe(entries);
    });
});
