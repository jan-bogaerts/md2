import { describe, expect, it } from 'vitest'
import type { MarkdownFile, Card } from './data_types'
import { buildReleaseMoves } from './release_archiving'

function card(path: string, agentLogReferences: string[] = []): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: '',
        header: {
            affects: [],
            after: null,
            agentLogReferences,
            author: null,
            id: path,
            internalId: 'card-1',
            owner: null,
            policy: {},
            status: 'active',
            title: path,
        },
        hasFrontmatter:true,
        isActive: true,
        path,
    }
}

describe('buildReleaseMoves', () => {
    const activityPath = 'design/activity/card__card-1.json'
    const createActivityContent = (conversationIds: string[] = [], cardInternalId = 'card-1') => JSON.stringify({
        actionSettings: {},
        conversations: conversationIds.map((id) => ({
            cardInternalId,
            completedAt: '2026-08-05T12:01:00.000Z',
            entries: [],
            id,
            providerSessions: [],
            startedAt: '2026-08-05T12:00:00.000Z',
            status: 'completed',
        })),
        origin: { cardInternalId, kind: 'card' },
        records: [],
        version: 4,
    })

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

    it('moves one activity log and rewrites every conversation reference in order', () => {
        const activityContent = createActivityContent(['conversation-1', 'conversation-2'])
        const source = card('design/F-1-card.md', [
            `${activityPath}#conversation=conversation-1`,
            `${activityPath}#conversation=conversation-2`,
        ])
        const files: MarkdownFile[] = [{
            content: [
                '---',
                'id: F-1',
                'internalId: card-1',
                'agents:',
                `  - ${activityPath}#conversation=conversation-1`,
                `  - ${activityPath}#conversation=conversation-2`,
                '---',
                '# Card',
            ].join('\n'),
            path: source.path,
        }]

        const moves = buildReleaseMoves(
            files,
            [source],
            'design',
            'design/releases',
            'v1',
            [source.path, activityPath],
            [{ content: activityContent, path: activityPath, sha: 'activity-sha' }],
        )

        expect(moves).toHaveLength(2)
        expect(moves[0].content).toContain('  - design/releases/v1/card__card-1.json#conversation=conversation-1')
        expect(moves[0].content).toContain('  - design/releases/v1/card__card-1.json#conversation=conversation-2')
        expect(moves[1]).toEqual({
            content: activityContent,
            fromPath: activityPath,
            sha: 'activity-sha',
            toPath: 'design/releases/v1/card__card-1.json',
        })
    })

    it('rejects a referenced activity path outside the canonical card log', () => {
        const activityContent = createActivityContent(['conversation-1'])
        const source = card('design/F-1-card.md', ['design/activity/project.json#conversation=conversation-1'])
        const files: MarkdownFile[] = [{ content: '# Card', path: source.path }]

        expect(() => buildReleaseMoves(
            files,
            [source],
            'design',
            'design/releases',
            'v1',
            [source.path, activityPath],
            [{ content: activityContent, path: activityPath }],
        )).toThrow('Unexpected activity path')
    })

    it('rejects a missing referenced activity log', () => {
        const source = card('design/F-1-card.md', [`${activityPath}#conversation=conversation-1`])

        expect(() => buildReleaseMoves(
            [{ content: '# Card', path: source.path }],
            [source],
            'design',
            'design/releases',
            'v1',
            [source.path],
        )).toThrow(`Missing referenced activity log: ${activityPath}`)
    })

    it('moves activity content without parsing or validating it', () => {
        const source = card('design/F-1-card.md')
        const activityContent = '{"origin":{"cardInternalId":"card-2"},"version":3}'

        const moves = buildReleaseMoves(
            [{ content: '# Card', path: source.path }],
            [source],
            'design',
            'design/releases',
            'v1',
            [source.path, activityPath],
            [{ content: activityContent, path: activityPath }],
        )

        expect(moves[1]).toEqual({
            content: activityContent,
            fromPath: activityPath,
            sha: undefined,
            toPath: 'design/releases/v1/card__card-1.json',
        })
    })

    it('moves an existing activity log when the card has no conversation references', () => {
        const source = card('design/F-1-card.md')
        const activityContent = createActivityContent()

        const moves = buildReleaseMoves(
            [{ content: '# Card', path: source.path }],
            [source],
            'design',
            'design/releases',
            'v1',
            [source.path, activityPath, 'design/activity/project.json', 'design/activity/card__other.json'],
            [{ content: activityContent, path: activityPath }],
        )

        expect(moves.map(({ fromPath }) => fromPath)).toEqual([source.path, activityPath])
    })

    it('rewrites references without validating conversations in the activity log', () => {
        const source = card('design/F-1-card.md', [`${activityPath}#conversation=conversation-1`])
        const cardContent = [
            '---',
            'id: F-1',
            'internalId: card-1',
            'agents:',
            `  - ${activityPath}#conversation=conversation-1`,
            '---',
            '# Card',
        ].join('\n')

        const moves = buildReleaseMoves(
            [{ content: cardContent, path: source.path }],
            [source],
            'design',
            'design/releases',
            'v1',
            [source.path, activityPath],
            [{ content: createActivityContent(), path: activityPath }],
        )

        expect(moves[0].content).toContain('design/releases/v1/card__card-1.json#conversation=conversation-1')
    })
})
