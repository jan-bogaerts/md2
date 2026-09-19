import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { CardStateTracker } = require('./card_state_tracker');
const { readCardIdentity } = require('../../../../shared/markdown_header_fields.mjs');

function cardContent(internalId, status) {
    return `---\nid: F_1\ninternalId: ${internalId}\nstatus: ${status}\ntitle: Card\n---\n\n# Card\n`;
}

function createTracker(filesByPath) {
    const files = new Map(Object.entries(filesByPath));
    const tracker = new CardStateTracker({ readCardFile: async (path) => files.get(path) ?? null });

    return { files, tracker };
}

describe('card state tracker', () => {
    it('reports a transition once the remembered status changes', async () => {
        const { files, tracker } = createTracker({ 'design/F_1.md': cardContent('card-1', 'in progress') });
        tracker.seed([{ content: files.get('design/F_1.md'), path: 'design/F_1.md' }]);

        files.set('design/F_1.md', cardContent('card-1', 'ready'));

        expect(await tracker.observeChange({ changeKind: 'changed', path: 'design/F_1.md' }))
            .toEqual({ cardInternalId: 'card-1', state: 'ready' });
    });

    it('reports nothing for repeated identical writes', async () => {
        const { files, tracker } = createTracker({ 'design/F_1.md': cardContent('card-1', 'in progress') });
        tracker.seed([{ content: files.get('design/F_1.md'), path: 'design/F_1.md' }]);
        files.set('design/F_1.md', cardContent('card-1', 'ready'));

        const transitions = [];
        for (let attempt = 0; attempt < 3; attempt += 1) {
            transitions.push(await tracker.observeChange({ changeKind: 'changed', path: 'design/F_1.md' }));
        }

        expect(transitions).toEqual([{ cardInternalId: 'card-1', state: 'ready' }, null, null]);
    });

    it('reports nothing the first time a card is seen', async () => {
        const { tracker } = createTracker({ 'design/F_1.md': cardContent('card-1', 'ready') });

        expect(await tracker.observeChange({ changeKind: 'changed', path: 'design/F_1.md' })).toBeNull();
    });

    it('reports nothing when a card is renamed, whichever order the watcher reports it in', async () => {
        for (const removalFirst of [true, false]) {
            const { files, tracker } = createTracker({ 'design/F_1.md': cardContent('card-1', 'ready') });
            tracker.seed([{ content: files.get('design/F_1.md'), path: 'design/F_1.md' }]);
            files.delete('design/F_1.md');
            files.set('design/F_1_renamed.md', cardContent('card-1', 'ready'));

            const removal = { changeKind: 'removed', path: 'design/F_1.md' };
            const creation = { changeKind: 'changed', path: 'design/F_1_renamed.md' };
            const events = removalFirst ? [removal, creation] : [creation, removal];
            const transitions = [];
            for (const event of events) transitions.push(await tracker.observeChange(event));

            expect(transitions).toEqual([null, null]);
        }
    });

    it('keeps detecting transitions on the new path after a rename', async () => {
        const { files, tracker } = createTracker({ 'design/F_1.md': cardContent('card-1', 'in progress') });
        tracker.seed([{ content: files.get('design/F_1.md'), path: 'design/F_1.md' }]);
        files.delete('design/F_1.md');
        files.set('design/moved/F_1.md', cardContent('card-1', 'in progress'));
        await tracker.observeChange({ changeKind: 'changed', path: 'design/moved/F_1.md' });
        await tracker.observeChange({ changeKind: 'removed', path: 'design/F_1.md' });

        files.set('design/moved/F_1.md', cardContent('card-1', 'ready'));

        expect(await tracker.observeChange({ changeKind: 'changed', path: 'design/moved/F_1.md' }))
            .toEqual({ cardInternalId: 'card-1', state: 'ready' });
    });

    it('forgets a deleted card, so re-creating it reports no transition', async () => {
        const { files, tracker } = createTracker({ 'design/F_1.md': cardContent('card-1', 'in progress') });
        tracker.seed([{ content: files.get('design/F_1.md'), path: 'design/F_1.md' }]);
        files.delete('design/F_1.md');
        await tracker.observeChange({ changeKind: 'removed', path: 'design/F_1.md' });

        files.set('design/F_1.md', cardContent('card-1', 'ready'));

        expect(await tracker.observeChange({ changeKind: 'changed', path: 'design/F_1.md' })).toBeNull();
    });

    it('ignores markdown without a card identity and files it cannot read', async () => {
        const { files, tracker } = createTracker({ 'design/notes.md': '# Plain notes\n' });

        expect(await tracker.observeChange({ changeKind: 'changed', path: 'design/notes.md' })).toBeNull();
        expect(await tracker.observeChange({ changeKind: 'changed', path: 'design/missing.md' })).toBeNull();
        expect(await tracker.observeChange({ changeKind: 'changed', path: 'design/.md2-schedules.json' })).toBeNull();
        files.set('design/notes.md', cardContent('card-1', 'ready'));
        expect(await tracker.observeChange({ changeKind: 'changed', path: 'design/notes.md' })).toBeNull();
    });

    it('reports nothing when a status is cleared', async () => {
        const { files, tracker } = createTracker({ 'design/F_1.md': cardContent('card-1', 'ready') });
        tracker.seed([{ content: files.get('design/F_1.md'), path: 'design/F_1.md' }]);
        files.set('design/F_1.md', '---\ninternalId: card-1\nstatus:\ntitle: Card\n---\n\n# Card\n');

        expect(await tracker.observeChange({ changeKind: 'changed', path: 'design/F_1.md' })).toBeNull();
    });

    it('reports one transition when overlapping events read the same written status', async () => {
        const { files, tracker } = createTracker({ 'design/F_1.md': cardContent('card-1', 'new') });
        tracker.seed([{ content: files.get('design/F_1.md'), path: 'design/F_1.md' }]);
        files.set('design/F_1.md', cardContent('card-1', 'ready'));

        // Both events are started before either read finishes, which is what two native watcher
        // events for one atomic rewrite look like.
        const transitions = await Promise.all([
            tracker.observeChange({ changeKind: 'changed', path: 'design/F_1.md' }),
            tracker.observeChange({ changeKind: 'changed', path: 'design/F_1.md' }),
        ]);

        expect(transitions).toEqual([{ cardInternalId: 'card-1', state: 'ready' }, null]);
    });
});

describe('shared card identity reading', () => {
    it('reads identity and status across line endings', () => {
        expect(readCardIdentity('---\r\ninternalId: card-1\r\nstatus: ready\r\n---\r\n\r\n# Card\r\n'))
            .toEqual({ internalId: 'card-1', status: 'ready' });
    });

    it('returns null without frontmatter, without a closing delimiter, or without an identity', () => {
        expect(readCardIdentity('# Card\n')).toBeNull();
        expect(readCardIdentity('---\ninternalId: card-1\nstatus: ready\n')).toBeNull();
        expect(readCardIdentity('---\nid: F_1\nstatus: ready\n---\n')).toBeNull();
    });

    it('reports a missing status as an empty status', () => {
        expect(readCardIdentity('---\ninternalId: card-1\ntitle: Card\n---\n')).toEqual({ internalId: 'card-1', status: '' });
    });
});
