import { describe, expect, it } from 'vitest';
import { resolveJsonProjectLink } from './json_link_path';

const repositoryPaths = ['design/data/config.json', 'root.json', 'design/note.md'];

describe('resolveJsonProjectLink', () => {
    it('resolves relative and project-root JSON links to existing repository paths', () => {
        expect(resolveJsonProjectLink('design/cards/card.md', '../data/config.json', repositoryPaths))
            .toBe('design/data/config.json');
        expect(resolveJsonProjectLink('design/cards/card.md', '/root.json', repositoryPaths)).toBe('root.json');
    });

    it.each([
        'https://example.com/data.json',
        'http://example.com/data.json',
        '#section',
        'note.md',
        '../../../outside.json',
        '../data/config.json#section',
    ])('leaves unsupported link unchanged: %s', (href) => {
        expect(resolveJsonProjectLink('design/cards/card.md', href, repositoryPaths)).toBeNull();
    });

    it('resolves a missing project-local JSON path so loading can report the error', () => {
        expect(resolveJsonProjectLink('design/cards/card.md', '../data/missing.json', repositoryPaths))
            .toBe('design/data/missing.json');
    });
});
