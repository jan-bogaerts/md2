import { describe, expect, it } from 'vitest'
import type { MarkdownFile, ProjectCard } from './data_types'
import { buildReleaseMoves } from './release_archiving'

function card(path: string): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: '',
        header: {
            affects: [],
            after: null,
            agentLogReferences: [],
            author: null,
            id: path,
            internalId: null,
            owner: null,
            policy: {},
            status: 'active',
            title: path,
        },
        headerFields: {},
        isActive: true,
        path,
    }
}

describe('buildReleaseMoves', () => {
    it('moves card assets referenced by archived cards', () => {
        const files: MarkdownFile[] = [
            { content: '# Card\n\n![note](note.png)', path: 'design/F-1-card.md', sha: 'card-sha' },
            { content: 'aW1hZ2U=', encoding: 'base64', path: 'design/note.png', sha: 'asset-sha' },
        ]

        const moves = buildReleaseMoves(files, [card('design/F-1-card.md')], 'design', 'design/releases', 'v1')

        expect(moves).toEqual([
            { content: '# Card\n\n![note](note.png)', fromPath: 'design/F-1-card.md', sha: 'card-sha', toPath: 'design/releases/v1/F-1-card.md' },
            { content: 'aW1hZ2U=', encoding: 'base64', fromPath: 'design/note.png', sha: 'asset-sha', toPath: 'design/releases/v1/note.png' },
        ])
    })

    it('moves only the card when no assets are referenced', () => {
        const files: MarkdownFile[] = [
            { content: '# Card', path: 'design/F-1-card.md' },
            { content: 'aW1hZ2U=', encoding: 'base64', path: 'design/note.png' },
        ]

        const moves = buildReleaseMoves(files, [card('design/F-1-card.md')], 'design', 'design/releases', 'v1')

        expect(moves).toEqual([
            { content: '# Card', fromPath: 'design/F-1-card.md', sha: undefined, toPath: 'design/releases/v1/F-1-card.md' },
        ])
    })

    it('keeps shared assets when a non-archived card still references them', () => {
        const files: MarkdownFile[] = [
            { content: '# Archived\n\n![note](note.png)', path: 'design/F-1-card.md' },
            { content: '# Remaining\n\n![note](note.png)', path: 'design/F-2-card.md' },
            { content: 'aW1hZ2U=', encoding: 'base64', path: 'design/note.png' },
        ]

        const moves = buildReleaseMoves(files, [card('design/F-1-card.md')], 'design', 'design/releases', 'v1')

        expect(moves).toEqual([
            { content: '# Archived\n\n![note](note.png)', fromPath: 'design/F-1-card.md', sha: undefined, toPath: 'design/releases/v1/F-1-card.md' },
        ])
    })

    it('rejects release folders that already contain an asset target', () => {
        const files: MarkdownFile[] = [
            { content: '# Card\n\n![note](note.png)', path: 'design/F-1-card.md' },
            { content: 'aW1hZ2U=', encoding: 'base64', path: 'design/note.png' },
        ]

        expect(() => buildReleaseMoves(
            files,
            [card('design/F-1-card.md')],
            'design',
            'design/releases',
            'v1',
            ['design/releases/v1/note.png'],
        )).toThrow('Release already exists: v1')
    })

    it('rejects a releases folder outside the project folder', () => {
        expect(() => buildReleaseMoves([], [], 'design', 'outside', 'v1')).toThrow('must stay inside the project folder')
    })
})
