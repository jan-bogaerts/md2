import { describe, expect, it } from 'vitest';
import { resolveJsonLink } from './json_link_path';

const repositoryPaths = ['design/data/config.json', 'root.json', 'design/note.md'];

describe('resolveJsonLink', () => {
    it('resolves relative and project-root JSON links to existing repository paths', () => {
        expect(resolveJsonLink('design/cards/card.md', '../data/config.json', 'C:/repo', repositoryPaths))
            .toEqual({ kind: 'project', path: 'design/data/config.json' });
        expect(resolveJsonLink('design/cards/card.md', '/root.json', 'C:/repo', repositoryPaths))
            .toEqual({ kind: 'project', path: 'root.json' });
    });

    it('resolves absolute links inside the repository back to project paths', () => {
        expect(resolveJsonLink(
            'design/cards/card.md',
            'file:///C:/repo/design/data/config.json',
            'C:\\repo',
            repositoryPaths,
        )).toEqual({ kind: 'project', path: 'design/data/config.json' });
    });

    it.each([
        ['file:///C:/shared/data.json', 'C:/shared/data.json'],
        ['C:\\shared\\data.json', 'C:/shared/data.json'],
        ['file://server/share/data.json', '//server/share/data.json'],
    ])('resolves an absolute local JSON link: %s', (href, path) => {
        expect(resolveJsonLink('design/cards/card.md', href, 'C:/repo', repositoryPaths))
            .toEqual({ kind: 'local', path });
    });

    it.each([
        'https://example.com/data.json',
        'http://example.com/data.json',
        '#section',
        'note.md',
        '../../../outside.json',
        '../data/config.json#section',
    ])('leaves unsupported link unchanged: %s', (href) => {
        expect(resolveJsonLink('design/cards/card.md', href, 'C:/repo', repositoryPaths)).toBeNull();
    });

    it('resolves a missing project-local JSON path so loading can report the error', () => {
        expect(resolveJsonLink('design/cards/card.md', '../data/missing.json', 'C:/repo', repositoryPaths))
            .toEqual({ kind: 'project', path: 'design/data/missing.json' });
    });
});
