import { describe, expect, it } from 'vitest'
import type { MarkdownFile, Card } from './data_types'
import { buildReleaseMoves, splitProjectActivity } from './release_archiving'
import { parseActivityFileForMigration } from '../../../shared/card_activity.mjs'

function card(path: string, agentLogReferences: string[] = [], references: string[] = []): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: '',
        header: {
            affects: [],
            after: null,
            agentLogReferences,
            changedFiles: [],
            author: null,
            id: path,
            internalId: 'card-1',
            owner: null,
            policy: {},
            references,
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

    it('moves arbitrary copied references and rewrites only their frontmatter paths', () => {
        const content = [
            '---',
            'references:',
            '  - design/files/manual.pdf',
            '  - C:\\notes\\local.txt',
            '  - /home/user/local.txt',
            '---',
            '# Card',
        ].join('\n')
        const source = card('design/F-1-card.md', [], [
            'design/files/manual.pdf',
            'C:\\notes\\local.txt',
            '/home/user/local.txt',
        ])
        const files: MarkdownFile[] = [
            { content, path: source.path },
            { content: 'AAECAw==', encoding: 'base64', path: 'design/files/manual.pdf' },
        ]

        const moves = buildReleaseMoves(files, [source], 'design', 'design/releases', 'v1')

        expect(moves).toEqual([
            {
                content: content.replace('design/files/manual.pdf', 'design/releases/v1/manual.pdf'),
                fromPath: source.path,
                sha: undefined,
                toPath: 'design/releases/v1/F-1-card.md',
            },
            {
                content: 'AAECAw==',
                encoding: 'base64',
                fromPath: 'design/files/manual.pdf',
                sha: undefined,
                toPath: 'design/releases/v1/manual.pdf',
            },
        ])
    })

    it('keeps copied references in place when a non-moved card still references the asset', () => {
        const archivedContent = [
            '---',
            'references:',
            '  - design/shared/data.bin',
            '---',
            '# Archived',
        ].join('\n')
        const remainingContent = [
            '---',
            'references:',
            '  - design/shared/data.bin',
            '---',
            '# Remaining',
        ].join('\n')
        const source = card('design/F-1-card.md', [], ['design/shared/data.bin'])
        const files: MarkdownFile[] = [
            { content: archivedContent, path: source.path },
            { content: remainingContent, path: 'design/F-2-card.md' },
            { content: 'AAECAw==', encoding: 'base64', path: 'design/shared/data.bin' },
        ]

        const moves = buildReleaseMoves(files, [source], 'design', 'design/releases', 'v1')

        expect(moves).toEqual([{
            content: archivedContent,
            fromPath: source.path,
            sha: undefined,
            toPath: 'design/releases/v1/F-1-card.md',
        }])
    })

    it('does not treat a non-image Markdown image link as an archive asset', () => {
        const files: MarkdownFile[] = [
            { content: '# Card\n\n![document](manual.pdf)', path: 'design/F-1-card.md' },
            { content: 'AAECAw==', encoding: 'base64', path: 'design/manual.pdf' },
        ]

        const moves = buildReleaseMoves(files, [card('design/F-1-card.md')], 'design', 'design/releases', 'v1')

        expect(moves.map(({ fromPath }) => fromPath)).toEqual(['design/F-1-card.md'])
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

    it('moves one referenced activity log and rewrites its file reference', () => {
        const activityContent = createActivityContent(['conversation-1', 'conversation-2'])
        const source = card('design/F-1-card.md', [activityPath])
        const files: MarkdownFile[] = [{
            content: [
                '---',
                'id: F-1',
                'internalId: card-1',
                'agents:',
                `  - ${activityPath}`,
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
        expect(moves[0].content).toContain('  - design/releases/v1/card__card-1.json')
        expect(moves[0].content).not.toContain('#conversation=')
        expect(moves[1]).toEqual({
            content: activityContent,
            fromPath: activityPath,
            sha: 'activity-sha',
            toPath: 'design/releases/v1/card__card-1.json',
        })
    })

    it('moves a manually referenced activity path without enforcing stored ownership', () => {
        const activityContent = createActivityContent(['conversation-1'])
        const manualPath = 'design/activity/project.json'
        const source = card('design/F-1-card.md', [manualPath])
        const files: MarkdownFile[] = [{ content: '# Card', path: source.path }]

        const moves = buildReleaseMoves(
            files,
            [source],
            'design',
            'design/releases',
            'v1',
            [source.path, manualPath],
            [{ content: activityContent, path: manualPath }],
        )

        expect(moves[1].fromPath).toBe(manualPath)
    })

    it('rejects a missing referenced activity log', () => {
        const source = card('design/F-1-card.md', [activityPath])

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
        const source = card('design/F-1-card.md', [activityPath])
        const cardContent = [
            '---',
            'id: F-1',
            'internalId: card-1',
            'agents:',
            `  - ${activityPath}`,
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

        expect(moves[0].content).toContain('design/releases/v1/card__card-1.json')
        expect(moves[0].content).not.toContain('#conversation=')
    })
})

describe('splitProjectActivity', () => {
    const projectConversation = (id: string, actionId: string, status: string) => ({
        actionId,
        cardInternalId: null,
        completedAt: status === 'running' ? null : '2026-08-05T12:01:00.000Z',
        entries: [],
        id,
        providerSessions: [],
        startedAt: '2026-08-05T12:00:00.000Z',
        status,
        title: actionId,
    })
    const agentRecord = (runId: string, rootActionId: string, rootConversationId: string, conversationIds: string[]) => ({
        commits: [],
        completedAt: '2026-08-05T12:01:00.000Z',
        conversationIds,
        details: { agent: 'claude', model: 'opus', type: 'agent' },
        origin: { kind: 'project' },
        rootActionId,
        rootActionLabel: rootActionId,
        rootConversationId,
        runId,
        startedAt: '2026-08-05T12:00:00.000Z',
        status: 'completed',
    })
    const systemRecord = {
        commits: [{
            branch: 'main',
            commit: 'a'.repeat(40),
            committedAt: '2026-08-05T12:02:00.000Z',
            deletions: 0,
            filePaths: ['design/project.md'],
            filesChanged: 1,
            insertions: 1,
        }],
        completedAt: '2026-08-05T12:02:00.000Z',
        label: 'Project synchronized',
        origin: { kind: 'project' },
        type: 'system',
    }
    const parseProjectActivity = (conversations: unknown[], records: unknown[]) => parseActivityFileForMigration(JSON.stringify({
        actionSettings: {},
        conversations,
        origin: { kind: 'project' },
        records,
        version: 4,
    }), { kind: 'project' })

    it('archives terminal conversations and keeps the ones that can still produce activity', () => {
        const activity = parseProjectActivity([
            projectConversation('conversation-done', 'review', 'completed'),
            projectConversation('conversation-stopped', 'plan', 'cancelled'),
            projectConversation('conversation-live', 'build', 'running'),
            projectConversation('conversation-waiting', 'ask', 'waitingForInput'),
            projectConversation('conversation-failed', 'lint', 'failed'),
        ], [])

        const { archived, hasArchivableActivity, kept } = splitProjectActivity(activity)

        expect(hasArchivableActivity).toBe(true)
        expect(archived.conversations.map(({ id }) => id)).toEqual(['conversation-done', 'conversation-stopped'])
        expect(kept.conversations.map(({ id }) => id)).toEqual(['conversation-live', 'conversation-waiting', 'conversation-failed'])
    })

    it('keeps a record whose conversations are split across both sides', () => {
        const activity = parseProjectActivity([
            projectConversation('conversation-done', 'review', 'completed'),
            projectConversation('conversation-live', 'build', 'running'),
        ], [
            agentRecord('run-archived', 'review', 'conversation-done', ['conversation-done']),
            agentRecord('run-straddling', 'build', 'conversation-live', ['conversation-live', 'conversation-done']),
            systemRecord,
        ])

        const { archived, kept } = splitProjectActivity(activity)

        expect(archived.records.map((record) => (record.type === 'system' ? 'system' : record.runId)))
            .toEqual(['run-archived', 'system'])
        expect(kept.records.map((record) => (record.type === 'system' ? 'system' : record.runId))).toEqual(['run-straddling'])
    })

    it('reports nothing archivable when every conversation stays behind and no record can travel', () => {
        const activity = parseProjectActivity(
            [projectConversation('conversation-live', 'build', 'running')],
            [agentRecord('run-live', 'build', 'conversation-live', ['conversation-live'])],
        )

        const { archived, hasArchivableActivity } = splitProjectActivity(activity)

        expect(hasArchivableActivity).toBe(false)
        expect(archived.conversations).toEqual([])
        expect(archived.records).toEqual([])
    })
})
