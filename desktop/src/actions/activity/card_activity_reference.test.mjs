import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { appendCardActivityReference, appendReferenceToContent } = require('./card_activity_reference');

describe('card activity reference', () => {
    it('appends to an existing agents list without changing other content or CRLF line endings', () => {
        const content = '---\r\nauthor: me\r\ninternalId: card-1\r\nagents:\r\n  - design/activity/old.json\r\npolicy:\r\n  allowNetwork: true\r\n---\r\n\r\n# Body\r\n';

        expect(appendReferenceToContent(content, 'design/F-1.md', 'card-1', 'design/activity/card__card-1.json')).toBe(
            '---\r\nauthor: me\r\ninternalId: card-1\r\nagents:\r\n  - design/activity/old.json\r\n  - design/activity/card__card-1.json\r\npolicy:\r\n  allowNetwork: true\r\n---\r\n\r\n# Body\r\n',
        );
    });

    it('adds a missing agents field without reordering existing fields', () => {
        const content = '---\nid: F-1\ninternalId: card-1\ntitle: Card\n---\n\n# Body\n';

        expect(appendReferenceToContent(content, 'design/F-1.md', 'card-1', 'design/activity/card__card-1.json')).toBe(
            '---\nid: F-1\ninternalId: card-1\ntitle: Card\nagents:\n  - design/activity/card__card-1.json\n---\n\n# Body\n',
        );
    });

    it('returns identical content when reference already exists', () => {
        const content = '---\ninternalId: card-1\nagents:\n  - design/activity/card__card-1.json\n---\nbody';

        expect(appendReferenceToContent(content, 'design/F-1.md', 'card-1', 'design/activity/card__card-1.json')).toBe(content);
    });

    it('rejects a card whose stored identity differs from activity origin', () => {
        const content = '---\ninternalId: card-2\n---\nbody';

        expect(() => appendReferenceToContent(content, 'design/F-1.md', 'card-1', 'design/activity/card__card-1.json'))
            .toThrow('Card identity mismatch at design/F-1.md: expected card-1, found card-2');
    });

    it('reports a missing card and performs no write', async () => {
        const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
        const writeFile = vi.fn();

        await expect(appendCardActivityReference(
            { rootPath: 'C:/repo' },
            'design/missing.md',
            'card-1',
            'design/activity/card__card-1.json',
            { assertGitRoot: vi.fn(async () => undefined), readFile: vi.fn(async () => { throw missing; }), writeFile },
        )).rejects.toThrow('Card file not found: design/missing.md');
        expect(writeFile).not.toHaveBeenCalled();
    });

    it('does not replace the card when temporary-file persistence fails', async () => {
        const rename = vi.fn();
        const rm = vi.fn(async () => undefined);
        const failure = new Error('disk full');

        await expect(appendCardActivityReference(
            { rootPath: 'C:/repo' },
            'design/F-1.md',
            'card-1',
            'design/activity/card__card-1.json',
            {
                assertGitRoot: vi.fn(async () => undefined),
                readFile: vi.fn(async () => '---\ninternalId: card-1\n---\nbody'),
                rename,
                rm,
                writeFile: vi.fn(async () => { throw failure; }),
            },
        )).rejects.toBe(failure);
        expect(rename).not.toHaveBeenCalled();
        expect(rm).toHaveBeenCalledOnce();
    });
});
