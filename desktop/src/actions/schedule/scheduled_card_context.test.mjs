import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { actionWorktreeContext } from '../../../../shared/action_worktree_context.mjs';

const require = createRequire(import.meta.url);
const { resolveScheduledCardContext } = require('./scheduled_card_context');

const cardTypes = [{ idPrefix: 'F', type: 'feature' }];
const worktrees = [
    { branch: 'other', error: null, path: 'C:/other', valid: true },
    { branch: 'feature', error: null, path: 'C:/feature', valid: true },
];

function cardFile(path, title = 'Renamed card', worktreeError = '') {
    return {
        content: `---\nid: F_356\ninternalId: stable-card\nstatus: ready\ntitle: ${title}\nworktree: 2\nbranch: feature\nworktreeError: ${worktreeError}\n---\n\n# Card`,
        path,
    };
}

describe('resolveScheduledCardContext', () => {
    it('uses current path and fields after card rename', () => {
        const context = resolveScheduledCardContext([cardFile('cards/renamed.md')], cardTypes, 'stable-card', worktrees);

        expect(context).toEqual({
            cardInternalId: 'stable-card',
            file: 'cards/renamed.md',
            kind: 'card',
            state: 'ready',
            title: 'Renamed card',
            type: 'feature',
            worktree: '2',
            worktreeBranch: 'feature',
        });
    });

    it('includes current worktree errors when present', () => {
        const context = resolveScheduledCardContext([cardFile('cards/renamed.md', 'Renamed card', 'Needs repair')], cardTypes, 'stable-card', worktrees);

        expect(context.worktreeError).toBe('Needs repair');
    });

    it('fails clearly for missing and duplicate card identities', () => {
        expect(() => resolveScheduledCardContext([], cardTypes, 'missing')).toThrow('Scheduled card not found: missing');
        expect(() => resolveScheduledCardContext([
            cardFile('cards/first.md'),
            cardFile('cards/second.md'),
        ], cardTypes, 'stable-card')).toThrow('Duplicate scheduled card identity: stable-card');
    });

    it('uses the current filter number after an unrelated checkout is removed without rewriting the card', () => {
        const file = cardFile('cards/renamed.md');
        const originalContent = file.content;
        const records = [worktrees[1], worktrees[0]];
        const context = resolveScheduledCardContext([file], cardTypes, 'stable-card', records);

        expect(context).toMatchObject({ worktree: '1', worktreeBranch: 'feature' });
        expect(context.worktree).not.toBe('2');
        expect(file.content).toBe(originalContent);
    });

    it.each([
        ['unavailable', []],
        ['invalid', [{ ...worktrees[1], error: 'missing folder', valid: false }]],
        ['duplicate', [worktrees[1], worktrees[1]]],
    ])('preserves an %s assignment for execution validation instead of selecting another checkout', (_label, records) => {
        const context = resolveScheduledCardContext([cardFile('cards/renamed.md')], cardTypes, 'stable-card', records);

        expect(context.worktree).toBe('2');
        expect(context.worktreeBranch).toBe('feature');
    });
});

describe('actionWorktreeContext', () => {
    it('keeps unassigned cards on the primary checkout even when they have a branch', () => {
        expect(actionWorktreeContext(worktrees, undefined, 'feature', undefined)).toEqual({});
    });

    it('preserves a recorded assignment error without assigning another checkout', () => {
        expect(actionWorktreeContext(worktrees, '2', 'feature', 'Needs repair')).toEqual({worktree: '2', worktreeBranch: 'feature', worktreeError: 'Needs repair'});
    });

    it('keeps the missing assignment branch available to execution validation', () => {
        expect(actionWorktreeContext(worktrees, '2', undefined, undefined)).toEqual({ worktree: '2' });
    });
});

describe('invalid scheduled card assignments', () => {
    it.each(['', '\n  - 2'])('retains invalid assignment %s as an error', (value) => {
        const file = { content: `---\nid: F_1\ninternalId: card-1\nstatus: todo\ntitle: Card\nworktree: ${value}\n---\n`, path: 'card.md' };
        expect(resolveScheduledCardContext([file], cardTypes, 'card-1', []).worktreeError).toContain('Invalid worktree assignment');
    });
});
