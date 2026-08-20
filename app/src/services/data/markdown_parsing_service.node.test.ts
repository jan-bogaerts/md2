import { describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { markdownParsingService } from './markdown_parsing_service'
import type { MarkdownFile } from '../../data/data_types'

const ROOT_FILE: MarkdownFile = {
    content: '---\nauthor: AB\nid: F-1\ntitle: Root\nstatus: active\nowner: JB\naffects:\n  - app/src/app.tsx\n---\n\n# Root\n\nBody text',
    path: 'design/F-1-root.md',
    sha: 'sha-1',
}

function markdownPaths(folder: string): string[] {
    const paths: string[] = []

    for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const path = resolve(folder, entry.name)
        if (entry.isDirectory()) paths.push(...markdownPaths(path))
        else if (entry.name.endsWith('.md')) paths.push(path)
    }

    return paths
}

describe('markdownParsingService.parse', () => {
    it('parses scalar, list and nested map header fields', () => {
        const content = '---\nauthor: JB\nid: F-9\nafter: F-8\naffects:\n  - a.ts\n  - b.ts\npolicy:\n  checkLinting: true\n  requireTests: true\n---\n\n# Body'
        const parsed = markdownParsingService.parse(content)

        expect(parsed.header.author).toBe('JB')
        expect(parsed.header.id).toBe('F-9')
        expect(parsed.header.after).toBe('F-8')
        expect(parsed.header.affects).toEqual(['a.ts', 'b.ts'])
        expect(parsed.header.policy).toEqual({ checkLinting: 'true', requireTests: 'true' })
        expect(parsed.body).toBe('\n# Body')
        expect(parsed.rawHeader).toContain('author: JB')
    })

    it('treats unclosed frontmatter as body without dropping text', () => {
        const content = '---\nid: F-1\nnot closed\n\n# Still body'
        const parsed = markdownParsingService.parse(content)

        expect(parsed.header).toEqual({})
        expect(parsed.body).toBe(content)
        expect(parsed.rawHeader).toBe('')
    })

    it('parses files without frontmatter as pure body', () => {
        const parsed = markdownParsingService.parse('# Just a note')

        expect(parsed.header).toEqual({})
        expect(parsed.body).toBe('# Just a note')
    })
})

describe('markdownParsingService.parseCard', () => {
    it('parses frontmatter and marks root files as active', () => {
        const card = markdownParsingService.parseCard(ROOT_FILE, 'design')

        expect(card.isActive).toBe(true)
        expect(card.header).toMatchObject({
            affects: ['app/src/app.tsx'],
            author: 'AB',
            id: 'F-1',
            owner: 'JB',
            status: 'active',
            title: 'Root',
        })
    })

    it('imports files without naming convention as new features', () => {
        const card = markdownParsingService.parseCard({ content: '# Imported', path: 'design/free note.md' }, 'design')

        expect(markdownParsingService.followsCardNamingConvention(card.path)).toBe(false)
        expect(card.header.id).toBe('F_0')
        expect(card.header.status).toBe('new')
        expect(card.header.title).toBe('Imported')
    })

    it('parses the after tag and policy map into the card header', () => {
        const content = '---\nid: F-2\ntitle: Second\nstatus: active\nafter: uuid-1\naffects:\npolicy:\n  checkLinting: true\n  requireTests: false\n---\n\n# Second'
        const card = markdownParsingService.parseCard({ content, path: 'design/F-2-second.md' }, 'design')

        expect(card.header.after).toBe('uuid-1')
        expect(card.header.policy).toEqual({ checkLinting: true, requireTests: false })
    })

    it('parses policy values case-insensitively and treats invalid values as false', () => {
        const content = '---\nid: F-2\ntitle: Second\npolicy:\n  checkLinting: True\n  requireTests: maybe\n---\n\n# Second'
        const card = markdownParsingService.parseCard({ content, path: 'design/F-2-second.md' }, 'design')

        expect(card.header.policy).toEqual({ checkLinting: true, requireTests: false })
    })

    it('parses agent log references into the card header', () => {
        const content = '---\nid: F-2\ntitle: Second\nstatus: active\nagents:\n  - .md2-agent-logs/one.json\n  - .md2-agent-logs/two.json\n---\n\n# Second'
        const card = markdownParsingService.parseCard({ content, path: 'design/F-2-second.md' }, 'design')

        expect(card.header.agentLogReferences).toEqual(['.md2-agent-logs/one.json', '.md2-agent-logs/two.json'])
    })

    it('parses ordered card references, removes exact duplicates, and defaults missing references', () => {
        const content = '---\nid: F-2\ntitle: Second\nreferences:\n  - design/spec.pdf\n  - C:\\notes\\input.txt\n  - design/spec.pdf\n---\n\n# Second'
        const card = markdownParsingService.parseCard({ content, path: 'design/F-2-second.md' }, 'design')
        const cardWithoutReferences = markdownParsingService.parseCard(ROOT_FILE, 'design')

        expect(card.header.references).toEqual(['design/spec.pdf', 'C:\\notes\\input.txt'])
        expect(cardWithoutReferences.header.references).toEqual([])
    })

    it('serializes changed references without disturbing unknown fields', () => {
        const content = '---\nid: F-2\ntitle: Second\ncustomField: keep me\n---\n\n# Second'
        const card = markdownParsingService.parseCard({ content, path: 'design/F-2-second.md' }, 'design')

        card.header.references = ['design/one.bin', 'D:\\source\\two.zip']
        const serialized = markdownParsingService.serializeCard(card)

        expect(serialized.content).toContain('references:\n  - design/one.bin\n  - D:\\source\\two.zip')
        expect(serialized.content).toContain('customField: keep me')
    })

    it('keeps raw header fields private while preserving unknown keys', () => {
        const content = '---\nid: F-2\ntitle: Second\ncustomField: keep me\nextras:\n  - one\n---\n\n# Second'
        const card = markdownParsingService.parseCard({ content, path: 'design/F-2-second.md' }, 'design')

        expect(card).not.toHaveProperty('headerFields')
        expect(markdownParsingService.serializeCard(card).content).toBe(content)
    })

    it('parses and preserves Sentry identity through edits and reloads', () => {
        const content = '---\nid: B-2\ninternalId: card-2\ntitle: Sentry bug\ncustomField: keep me\nsentryIssueId: 12345\nsentryOrganization: acme\nsentryBaseUrl: https://sentry.example.com\n---\n\n# Sentry bug'
        const card = markdownParsingService.parseCard({ content, path: 'design/B-2-sentry-bug.md' }, 'design')

        expect(card.header).toMatchObject({
            sentryBaseUrl: 'https://sentry.example.com',
            sentryIssueId: '12345',
            sentryOrganization: 'acme',
        })

        card.content = '# Edited Sentry bug'
        const serialized = markdownParsingService.serializeCard(card)
        const reloaded = markdownParsingService.parseCard(serialized, 'design')

        expect(serialized.content).toContain('customField: keep me')
        expect(reloaded.header).toMatchObject({
            sentryBaseUrl: 'https://sentry.example.com',
            sentryIssueId: '12345',
            sentryOrganization: 'acme',
        })
        expect(reloaded.content).toBe('# Edited Sentry bug')
    })

    it('defaults after to null and policy to an empty map when absent', () => {
        const card = markdownParsingService.parseCard(ROOT_FILE, 'design')

        expect(card.header.after).toBeNull()
        expect(card.header.agentLogReferences).toEqual([])
        expect(card.header.policy).toEqual({})
    })
})

describe('markdownParsingService card serialization', () => {
    it('round-trips every repository design Markdown file byte-identically', () => {
        const cardsFolder = resolve(process.cwd(), '..', 'design');
        const paths = markdownPaths(cardsFolder);

        expect(paths.length).toBeGreaterThan(0);
        for (const path of paths) {
            const content = readFileSync(path, 'utf8');
            const card = markdownParsingService.parseCard({ content, path }, cardsFolder);

            expect(markdownParsingService.serializeCard(card).content).toBe(content);
        }
    });

    it('preserves unknown fields, comments, order, and body while serializing one changed field', () => {
        const content = '---\ncustom: keep\n# retain comment\nid: F-1\nunknownMap:\n  child: value\nstatus: design\n---\n\n# Card\n\nBody';
        const card = markdownParsingService.parseCard({ content, path: 'design/F-1-card.md' }, 'design');
        card.header.status = 'ready';

        expect(markdownParsingService.serializeCard(card).content).toBe(
            '---\ncustom: keep\n# retain comment\nid: F-1\nunknownMap:\n  child: value\nstatus: ready\n---\n\n# Card\n\nBody',
        );
    });
});

describe('markdownParsingService.splitCards', () => {
    it('splits active root cards before background cards', () => {
        const files: MarkdownFile[] = [
            ROOT_FILE,
            { content: '# Old', path: 'design/history/F-3-old.md' },
            { content: '# Imported', path: 'design/free note.md' },
        ]
        const cards = markdownParsingService.splitCards(files, 'design')

        expect(cards.activeCards.map((card) => card.path)).toEqual(['design/F-1-root.md', 'design/free note.md'])
        expect(cards.backgroundCards.map((card) => card.path)).toEqual(['design/history/F-3-old.md'])
    })

    it('parses each markdown file once and skips non-markdown files', () => {
        const files: MarkdownFile[] = [
            ROOT_FILE,
            { content: '# Old', path: 'design/history/F-3-old.md' },
            { content: '# Imported', path: 'design/free note.md' },
            { content: '{}', path: 'design/data.json' },
        ]
        const parseCard = vi.spyOn(markdownParsingService, 'parseCard')

        markdownParsingService.splitCards(files, 'design')

        expect(parseCard).toHaveBeenCalledTimes(3)
        expect(parseCard.mock.calls.map(([file]) => file.path)).toEqual([
            'design/F-1-root.md',
            'design/history/F-3-old.md',
            'design/free note.md',
        ])
        parseCard.mockRestore()
    })
})

describe('markdownParsingService.replaceBody', () => {
    it('swaps the body while preserving the existing header', () => {
        const next = markdownParsingService.replaceBody(ROOT_FILE.content, '\n# Root\n\nEdited body')

        expect(next.startsWith('---\nauthor: AB\nid: F-1\ntitle: Root')).toBe(true)
        expect(next).toContain('affects:\n  - app/src/app.tsx')
        expect(next).toContain('Edited body')
        expect(next).not.toContain('Body text')
    })

    it('returns the body unchanged for headerless files', () => {
        expect(markdownParsingService.replaceBody('# Note', '# Edited')).toBe('# Edited')
    })
})

describe('markdownParsingService.rewriteHeader', () => {
    it('rewrites a field while preserving unrelated fields, internalId and body', () => {
        const content = '---\nid: F-1\ninternalId: abc-123\ntitle: Root\nstatus: active\naffects:\n  - a.ts\n---\n\n# Root'
        const next = markdownParsingService.rewriteHeader(content, { status: 'ready' })

        expect(next).toContain('status: ready')
        expect(next).not.toContain('status: active')
        expect(next).toContain('internalId: abc-123')
        expect(next).toContain('affects:\n  - a.ts')
        expect(next.endsWith('\n\n# Root')).toBe(true)
    })

    it('preserves unknown fields and their order when rewriting', () => {
        const content = '---\ncustomField: keep me\nid: F-1\nmystery: value\nstatus: active\n---\n\n# Root'
        const next = markdownParsingService.rewriteHeader(content, { status: 'ready' })

        expect(next).toBe('---\ncustomField: keep me\nid: F-1\nmystery: value\nstatus: ready\n---\n\n# Root')
    })

    it('appends fields that do not yet exist', () => {
        const content = '---\nid: F-1\ntitle: Root\n---\n\n# Root'
        const next = markdownParsingService.rewriteHeader(content, { owner: 'JB' })

        expect(next).toContain('owner: JB')
        expect(next).toContain('id: F-1')
    })
})

describe('markdownParsingService.setPolicyFlag', () => {
    it('toggles an existing policy flag while preserving other fields and body', () => {
        const content = '---\nid: F-1\ntitle: Root\nstatus: active\npolicy:\n  checkLinting: true\n  requireTests: true\n---\n\n# Root'
        const next = markdownParsingService.setPolicyFlag(content, 'checkLinting', false)

        expect(next).toContain('  checkLinting: false')
        expect(next).toContain('  requireTests: true')
        expect(next).toContain('id: F-1')
        expect(next.endsWith('\n\n# Root')).toBe(true)
    })

    it('adds a policy flag under an existing policy block', () => {
        const content = '---\nid: F-1\ntitle: Root\npolicy:\n  checkLinting: true\n---\n\n# Root'
        const next = markdownParsingService.setPolicyFlag(content, 'requireTests', true)

        expect(next).toContain('  checkLinting: true')
        expect(next).toContain('  requireTests: true')
    })

    it('creates a policy block when none exists', () => {
        const content = '---\nid: F-1\ntitle: Root\n---\n\n# Root'
        const next = markdownParsingService.setPolicyFlag(content, 'checkLinting', true)

        expect(next).toContain('policy:\n  checkLinting: true')
        const reparsed = markdownParsingService.parseCard({ content: next, path: 'design/F-1-root.md' }, 'design')
        expect(reparsed.header.policy).toEqual({ checkLinting: true })
    })
})

describe('markdownParsingService.setAgentLogReferences', () => {
    it('rewrites agent log references while preserving other header fields and body', () => {
        const content = '---\nid: F-1\ntitle: Root\nagents:\n  - old.json\npolicy:\n  checkLinting: true\n---\n\n# Root'
        const next = markdownParsingService.setAgentLogReferences(content, ['one.json', 'two.json'])

        expect(next).toContain('agents:\n  - one.json\n  - two.json')
        expect(next).not.toContain('old.json')
        expect(next).toContain('policy:\n  checkLinting: true')
        expect(next.endsWith('\n\n# Root')).toBe(true)
    })
})

describe('markdownParsingService.setReferences', () => {
    it('rewrites unique references and removes optional empty field', () => {
        const content = '---\nid: F-1\ntitle: Root\nreferences:\n  - old.pdf\n---\n\n# Root'
        const next = markdownParsingService.setReferences(content, ['design/new.pdf', 'design/new.pdf'])

        expect(next).toContain('references:\n  - design/new.pdf')
        expect(next).not.toContain('old.pdf')
        expect(markdownParsingService.setReferences(next, [])).not.toContain('references:')
    })
})

describe('markdownParsingService.setAffects', () => {
    it('rewrites affects while preserving unrelated header fields and body', () => {
        const content = '---\nid: F-1\ntitle: Root\naffects:\n  - old.ts\npolicy:\n  checkLinting: true\n---\n\n# Root'
        const next = markdownParsingService.setAffects(content, ['app/src/app.tsx', 'desktop/main.js'])

        expect(next).toContain('affects:\n  - app/src/app.tsx\n  - desktop/main.js')
        expect(next).not.toContain('old.ts')
        expect(next).toContain('policy:\n  checkLinting: true')
        expect(next.endsWith('\n\n# Root')).toBe(true)
    })

    it('creates an empty affects list when no entries are selected', () => {
        const content = '---\nid: F-1\ntitle: Root\naffects:\n  - old.ts\n---\n\n# Root'
        const next = markdownParsingService.setAffects(content, [])

        expect(next).toContain('affects:\n---')
        expect(next).not.toContain('old.ts')
    })
})

describe('markdownParsingService worktree frontmatter', () => {
    it('parses persisted card branch identity', () => {
        const content = '---\nid: F-1\nbranch: f-1-card\nworktree: 2\n---\n# Card\n'
        const card = markdownParsingService.parseCard({ content, path: 'design/F-1-card.md' }, 'design')

        expect(card.header.branch).toBe('f-1-card')
        expect(markdownParsingService.setBranch(content, null)).not.toContain('branch:')
    })

    it('parses and rewrites a positive one-based worktree index', () => {
        const content = '---\nid: F-1\nworktree: 2\n---\n# Card\n'
        const card = markdownParsingService.parseCard({ content, path: 'design/F-1-card.md' }, 'design')

        expect(card.header).toMatchObject({ worktree: 2, worktreeError: null, worktreeValue: '2' })
        expect(markdownParsingService.setWorktree(content, 3)).toContain('worktree: 3')
    })

    it.each(['0', '-1', '1.5', 'two'])('keeps invalid worktree value %s visible as an error', (value) => {
        const content = `---\nid: F-1\nworktree: ${value}\n---\n# Card\n`
        const card = markdownParsingService.parseCard({ content, path: 'design/F-1-card.md' }, 'design')

        expect(card.header).toMatchObject({ worktree: null, worktreeValue: value })
        expect(card.header.worktreeError).toContain(value)
    })

    it('removes worktree frontmatter when assigning Primary', () => {
        const content = '---\nid: F-1\nworktree: 2\nstatus: design\n---\n# Card\n'
        const next = markdownParsingService.setWorktree(content, null)

        expect(next).not.toContain('worktree:')
        expect(next).toContain('status: design')
    })
})

describe('markdownParsingService.setCardTitle', () => {
    it('keeps the header title and first body heading synchronized', () => {
        const content = '---\nid: F-1\ntitle: Root\n---\n\n# Root\n\n## Context\n\nBody'
        const next = markdownParsingService.setCardTitle(content, 'Renamed Root')

        expect(next).toContain('title: Renamed Root')
        expect(next).toContain('\n# Renamed Root\n\n## Context')
    })

    it('leaves a body without a title heading unchanged', () => {
        const content = '---\nid: F-1\ntitle: Root\n---\n\nBody without a heading'
        const next = markdownParsingService.setCardTitle(content, 'Renamed Root')

        expect(next).toContain('title: Renamed Root')
        expect(next.endsWith('\n\nBody without a heading')).toBe(true)
    })
})

describe('markdownParsingService line-ending preservation', () => {
    const CRLF_CONTENT = '---\r\nid: F-1\r\ntitle: Root\r\nstatus: active\r\npolicy:\r\n  checkLinting: true\r\n---\r\n\r\n# Root\r\n\r\nBody text'

    it('parses CRLF headers identically to LF headers', () => {
        const parsed = markdownParsingService.parse(CRLF_CONTENT)

        expect(parsed.header.id).toBe('F-1')
        expect(parsed.header.title).toBe('Root')
        expect(parsed.header.policy).toEqual({ checkLinting: 'true' })
        expect(parsed.body).toBe('\r\n# Root\r\n\r\nBody text')
    })

    it('replaces the body of a CRLF file without converting it to LF', () => {
        const next = markdownParsingService.replaceBody(CRLF_CONTENT, '\r\n# Root\r\n\r\nEdited body')

        expect(next).toBe('---\r\nid: F-1\r\ntitle: Root\r\nstatus: active\r\npolicy:\r\n  checkLinting: true\r\n---\r\n\r\n# Root\r\n\r\nEdited body')
        expect(next).not.toMatch(/[^\r]\n/)
    })

    it('rewrites a header field of a CRLF file while keeping CRLF endings', () => {
        const next = markdownParsingService.rewriteHeader(CRLF_CONTENT, { status: 'ready' })

        expect(next).toContain('status: ready\r\n')
        expect(next).toContain('# Root\r\n\r\nBody text')
        expect(next).not.toMatch(/[^\r]\n/)
    })

    it('toggles a policy flag of a CRLF file while keeping CRLF endings', () => {
        const next = markdownParsingService.setPolicyFlag(CRLF_CONTENT, 'checkLinting', false)

        expect(next).toContain('  checkLinting: false\r\n')
        expect(next).toContain('# Root\r\n\r\nBody text')
        expect(next).not.toMatch(/[^\r]\n/)

        const reparsed = markdownParsingService.parse(next)
        expect(reparsed.header.policy).toEqual({ checkLinting: 'false' })
    })

    it('keeps LF files free of carriage returns', () => {
        const next = markdownParsingService.rewriteHeader(ROOT_FILE.content, { status: 'ready' })

        expect(next).toContain('status: ready')
        expect(next).not.toContain('\r')
    })

    it('picks CRLF deterministically for mixed files', () => {
        const mixed = '---\nid: F-1\r\ntitle: Root\n---\n\n# Root'
        const next = markdownParsingService.rewriteHeader(mixed, { status: 'ready' })

        expect(next).toContain('---\r\nid: F-1\r\ntitle: Root\r\nstatus: ready\r\n---\r\n')
        expect(next.endsWith('\n# Root')).toBe(true)
    })
})

describe('markdownParsingService.buildCardMarkdown', () => {
    it('generates markdown with the full supported header and body template', () => {
        const content = markdownParsingService.buildCardMarkdown(
            {
                affects: [],
                author: null,
                id: 'F-4',
                internalId: 'fixed-id',
                owner: null,
                policy: {},
                status: 'new',
                title: 'New Card',
            },
            '# Goal\n\n# Tasks',
        )

        expect(content).toContain('author:')
        expect(content).toContain('id: F-4')
        expect(content).toContain('internalId: fixed-id')
        expect(content).toContain('title: New Card')
        expect(content).toContain('status: new')
        expect(content).toContain('owner:')
        expect(content).toContain('affects:\nagents:\npolicy:')
        expect(content.endsWith('\n\n# Goal\n\n# Tasks')).toBe(true)
    })

    it('serializes policy booleans as canonical strings', () => {
        const content = markdownParsingService.buildCardMarkdown(
            {
                id: 'F-4',
                internalId: 'fixed-id',
                policy: { checkLinting: true, requireTests: false },
                title: 'New Card',
            },
            '# Goal',
        )

        expect(content).toContain('  checkLinting: true')
        expect(content).toContain('  requireTests: false')
    })

    it('fails fast when required fields are missing', () => {
        expect(() => markdownParsingService.buildCardMarkdown({ id: '', internalId: 'uuid', title: 'x' }, 'Body')).toThrow()
        expect(() => markdownParsingService.buildCardMarkdown({ id: 'F-1', internalId: '', title: 'x' }, 'Body')).toThrow()
        expect(() => markdownParsingService.buildCardMarkdown({ id: 'F-1', internalId: 'uuid', title: '' }, 'Body')).toThrow()
    })
})

describe('markdownParsingService.generateInternalId', () => {
    it('generates a distinct non-empty id on each call', () => {
        const first = markdownParsingService.generateInternalId()
        const second = markdownParsingService.generateInternalId()

        expect(first).not.toBe(second)
        expect(first.length).toBeGreaterThan(0)
    })
})
