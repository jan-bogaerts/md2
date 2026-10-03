import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { resolveWorktreeAssignment } = require('../../../shared/worktree_assignment.mjs');
const first = { branch: 'feature/first', error: null, path: '/first', valid: true };
const selected = { branch: 'feature/selected', error: null, path: '/selected', valid: true };
const last = { branch: 'feature/last', error: null, path: '/last', valid: true };

describe('worktree branch assignment', () => {
    it('preserves the checkout after an earlier registration is removed', () => {
        expect(resolveWorktreeAssignment([first, selected, last], selected.branch)).toEqual({ error: null, index: 2, record: selected });
        expect(resolveWorktreeAssignment([selected, last], selected.branch)).toEqual({ error: null, index: 1, record: selected });
    });

    it('preserves the checkout after registrations are added or reordered', () => {
        expect(resolveWorktreeAssignment([last, first, selected], selected.branch)).toEqual({ error: null, index: 3, record: selected });
    });

    it('does not substitute the checkout occupying the old position when the assigned branch disappears', () => {
        const result = resolveWorktreeAssignment([first, last], selected.branch);
        expect(result.record).toBeNull();
        expect(result.index).toBeNull();
        expect(result.error).toMatch(/unavailable/u);
    });

    it('requires a stored branch instead of guessing from a numeric assignment', () => {
        expect(resolveWorktreeAssignment([first], undefined).error).toMatch(/no stored branch/u);
        expect(resolveWorktreeAssignment([first], '').error).toMatch(/no stored branch/u);
    });

    it('rejects duplicate branch registrations, including a stale duplicate', () => {
        const duplicate = { ...selected, error: 'prunable', path: '/missing', valid: false };
        expect(resolveWorktreeAssignment([selected, duplicate], selected.branch).error).toMatch(/multiple checkouts/u);
    });

    it('reports the invalid assigned checkout without losing healthy alternatives', () => {
        const missing = { ...selected, error: 'gitdir file points to non-existent location', valid: false };
        const result = resolveWorktreeAssignment([first, missing, last], selected.branch);
        expect(result.record).toBeNull();
        expect(result.error).toContain(selected.path);
        expect(result.error).toContain(missing.error);
    });

    it('does not normalize or case-fold branch names', () => {
        expect(resolveWorktreeAssignment([selected], 'Feature/selected').error).toMatch(/unavailable/u);
    });

    it('preserves the record and unfinished work without changing model data', () => {
        const dirty = { ...selected, status: { dirty: true } };
        const records = Object.freeze([Object.freeze(dirty)]);
        expect(resolveWorktreeAssignment(records, selected.branch).record).toBe(dirty);
        expect(dirty.status.dirty).toBe(true);
    });
});
