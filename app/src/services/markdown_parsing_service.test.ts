import { describe, expect, it } from 'vitest'
import { markdownParsingService } from './markdown_parsing_service'
import type { MarkdownFile } from '../data/data_types'

const ROOT_FILE: MarkdownFile = {
    content: '---\nauthor: AB\nid: F-1\ntitle: Root\nstatus: active\nowner: JB\naffects:\n  - app/src/app.tsx\n---\n\n# Root\n\nBody text',
    path: 'design/F-1-root.md',
    sha: 'sha-1',
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
        expect(card.header.id).toBe('F-0')
        expect(card.header.status).toBe('new')
        expect(card.header.title).toBe('Imported')
    })

    it('parses the after tag and policy map into the card header', () => {
        const content = '---\nid: F-2\ntitle: Second\nstatus: active\nafter: uuid-1\naffects:\npolicy:\n  checkLinting: true\n  requireTests: false\n---\n\n# Second'
        const card = markdownParsingService.parseCard({ content, path: 'design/F-2-second.md' }, 'design')

        expect(card.header.after).toBe('uuid-1')
        expect(card.header.policy).toEqual({ checkLinting: 'true', requireTests: 'false' })
    })

    it('parses agent log references into the card header', () => {
        const content = '---\nid: F-2\ntitle: Second\nstatus: active\nagents:\n  - .md2-agent-logs/one.json\n  - .md2-agent-logs/two.json\n---\n\n# Second'
        const card = markdownParsingService.parseCard({ content, path: 'design/F-2-second.md' }, 'design')

        expect(card.header.agentLogReferences).toEqual(['.md2-agent-logs/one.json', '.md2-agent-logs/two.json'])
    })

    it('defaults after to null and policy to an empty map when absent', () => {
        const card = markdownParsingService.parseCard(ROOT_FILE, 'design')

        expect(card.header.after).toBeNull()
        expect(card.header.agentLogReferences).toEqual([])
        expect(card.header.policy).toEqual({})
    })
})

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
        expect(reparsed.header.policy).toEqual({ checkLinting: 'true' })
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
