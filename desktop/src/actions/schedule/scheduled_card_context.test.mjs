import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { resolveScheduledCardContext } = require('./scheduled_card_context');

const cardTypes = [{ idPrefix: 'F', type: 'feature' }];

function cardFile(path, title = 'Renamed card', worktreeError = '') {
    return {
        content: `---\nid: F_356\ninternalId: stable-card\nstatus: ready\ntitle: ${title}\nworktree: 2\nworktreeError: ${worktreeError}\n---\n\n# Card`,
        path,
    };
}

describe('resolveScheduledCardContext', () => {
    it('uses current path and fields after card rename', () => {
        const context = resolveScheduledCardContext([cardFile('cards/renamed.md')], cardTypes, 'stable-card');

        expect(context).toEqual({
            cardInternalId: 'stable-card',
            file: 'cards/renamed.md',
            kind: 'card',
            state: 'ready',
            title: 'Renamed card',
            type: 'feature',
            worktree: '2',
        });
    });

    it('includes current worktree errors when present', () => {
        const context = resolveScheduledCardContext([cardFile('cards/renamed.md', 'Renamed card', 'Needs repair')], cardTypes, 'stable-card');

        expect(context.worktreeError).toBe('Needs repair');
    });

    it('fails clearly for missing and duplicate card identities', () => {
        expect(() => resolveScheduledCardContext([], cardTypes, 'missing')).toThrow('Scheduled card not found: missing');
        expect(() => resolveScheduledCardContext([
            cardFile('cards/first.md'),
            cardFile('cards/second.md'),
        ], cardTypes, 'stable-card')).toThrow('Duplicate scheduled card identity: stable-card');
    });
});
