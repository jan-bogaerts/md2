import { describe, expect, it } from 'vitest'
import type { StorageService } from '../../data/data_types'
import { listAgentConversationReferences, parseAgentConversationLog } from './agent_conversation_service'

describe('parseAgentConversationLog', () => {
    it('normalizes a persisted agent log', () => {
        const conversation = parseAgentConversationLog(
            JSON.stringify({
                cardPath: 'design/F-1.md',
                completedAt: null,
                id: 'agent-1',
                entries: [{ agent: 'codex', content: 'hello', id: 'm1', kind: 'message', role: 'assistant', timestamp: '2026-01-01T00:00:00.000Z' }],
                providerSessions: [{
                    agent: 'codex', conversationId: 'session-1', createdAt: '2026-01-01T00:00:00.000Z',
                    lastUsedAt: '2026-01-01T00:00:01.000Z', synchronizedThroughMessageId: 'm1',
                }],
                startedAt: '2026-01-01T00:00:00.000Z',
                status: 'running',
                title: 'Agent run',
            }),
            '.md2-agent-logs/one.json',
        )

        expect(conversation.path).toBe('.md2-agent-logs/one.json')
        expect(conversation.hasExplicitTitle).toBe(true)
        expect(conversation.entries[0]).toMatchObject({ content: 'hello', kind: 'message' })
        expect(conversation.providerSessions[0].conversationId).toBe('session-1')
    })

    it('preserves whether a title was explicit while retaining the id fallback', () => {
        const conversation = parseAgentConversationLog(JSON.stringify({
            cardPath: null,
            completedAt: null,
            id: 'agent-1',
            entries: [],
            startedAt: '2026-01-01T00:00:00.000Z',
            status: 'completed',
        }), '.md2-agent-logs/one.json')

        expect(conversation.hasExplicitTitle).toBe(false)
        expect(conversation.title).toBe('agent-1')
    })

    it('normalizes persisted usage and tolerates malformed fields', () => {
        const conversation = parseAgentConversationLog(JSON.stringify({
            cardPath: null,
            completedAt: null,
            id: 'agent-1',
            entries: [],
            startedAt: '2026-01-01T00:00:00.000Z',
            status: 'completed',
            usage: {
                cachedInputTokens: 4,
                costUsd: 0.02,
                inputTokens: 10,
                outputTokens: 'bad',
                reasoningTokens: 1,
                totalTokens: 999,
            },
        }), 'design/logs/one.json')

        expect(conversation.usage).toEqual({
            cachedInputTokens: 4,
            costUsd: 0.02,
            inputTokens: 10,
            outputTokens: 0,
            reasoningTokens: 1,
            totalTokens: 15,
        })
    })

    it('preserves structured sequenced conversation activity', () => {
        const conversation = parseAgentConversationLog(JSON.stringify({
            completedAt: null,
            entries: [{
                command: 'npm test',
                content: 'running',
                details: ['detail'],
                durationMs: 25,
                exitCode: 1,
                id: 'activity-1',
                kind: 'event',
                label: 'Command',
                output: 'failed',
                providerItemId: 'command-1',
                sequence: 2,
                status: 'failed',
                summary: ['summary'],
                timestamp: '2026-01-01T00:00:01.000Z',
                type: 'commandExecution',
                workingDirectory: 'C:\\repo',
            }, {
                content: 'hello',
                id: 'm1',
                kind: 'message',
                role: 'assistant',
                sequence: 1,
                timestamp: '2026-01-01T00:00:00.000Z',
            }],
            id: 'agent-1',
            startedAt: '2026-01-01T00:00:00.000Z',
            status: 'completed',
        }), 'design/logs/one.json')

        expect(conversation.entries[1]).toMatchObject({ kind: 'message', sequence: 1 })
        expect(conversation.entries[0]).toMatchObject({
            command: 'npm test',
            details: ['detail'],
            durationMs: 25,
            exitCode: 1,
            output: 'failed',
            providerItemId: 'command-1',
            sequence: 2,
            status: 'failed',
            summary: ['summary'],
            workingDirectory: 'C:\\repo',
        })
    })

    it('groups persisted consecutive diagnostics while preserving boundaries and first identity', () => {
        const timestamp = '2026-01-01T00:00:00.000Z'
        const conversation = parseAgentConversationLog(JSON.stringify({
            completedAt: timestamp,
            entries: [
                {
                    content: 'item/started: futureTool (future-1)', id: 'diagnostic-1', kind: 'event',
                    label: 'Codex protocol diagnostic', providerItemId: 'diagnostic:future-1:1', sequence: 1,
                    status: 'completed', timestamp, type: 'diagnostic',
                },
                {
                    content: 'item/completed: futureTool (future-1)', id: 'diagnostic-2', kind: 'event',
                    payload: { secret: 'not persisted' }, providerItemId: 'diagnostic:future-1:2', sequence: 2,
                    timestamp, type: 'diagnostic',
                },
                {
                    content: 'Search', id: 'search-1', kind: 'event', providerItemId: 'search-1', sequence: 3,
                    timestamp, type: 'webSearch',
                },
                {
                    content: 'already grouped line one\nalready grouped line two', id: 'diagnostic-3', kind: 'event',
                    providerItemId: 'diagnostic:future-2:3', sequence: 4, timestamp, type: 'diagnostic',
                },
                { content: 'Answer', id: 'message-1', kind: 'message', role: 'assistant', sequence: 5, timestamp },
                {
                    content: 'item/started: futureTool (future-3)', id: 'diagnostic-4', kind: 'event',
                    providerItemId: 'diagnostic:future-3:4', sequence: 6, timestamp, type: 'diagnostic',
                },
            ],
            id: 'agent-1',
            startedAt: timestamp,
            status: 'completed',
        }), 'design/logs/diagnostics.json')

        expect(conversation.entries).toHaveLength(5)
        expect(conversation.entries[0]).toMatchObject({
            content: 'item/started: futureTool (future-1)\nitem/completed: futureTool (future-1)',
            id: 'diagnostic-1',
            providerItemId: 'diagnostic:future-1:1',
            sequence: 1,
        })
        expect(conversation.entries.map(({ id }) => id)).toEqual([
            'diagnostic-1', 'search-1', 'diagnostic-3', 'message-1', 'diagnostic-4',
        ])
        expect(conversation.entries[2]).toMatchObject({ content: 'already grouped line one\nalready grouped line two' })
        expect(JSON.stringify(conversation.entries)).not.toContain('not persisted')
    })

    it('fails malformed logs with missing required data', () => {
        expect(() => parseAgentConversationLog(
            JSON.stringify({ cardPath: 'design/F-1.md', entries: [], id: 'agent-1', status: 'completed' }),
            '.md2-agent-logs/bad.json',
        )).toThrow('missing startedAt')
    })

    it('requires entries and rejects legacy conversation collections', () => {
        expect(() => parseAgentConversationLog(JSON.stringify({
            events: [],
            id: 'agent-1',
            messages: [],
            startedAt: '2026-01-01T00:00:00.000Z',
            status: 'completed',
        }), 'design/logs/legacy.json')).toThrow('Malformed agent conversation: missing entries')
    })

    it.each([
        { content: 'hello', id: 'm1', kind: 'unknown', timestamp: '2026-01-01T00:00:00.000Z' },
        { content: 'hello', id: '', kind: 'message', role: 'assistant', timestamp: '2026-01-01T00:00:00.000Z' },
        { content: 'running', id: 'e1', kind: 'event', timestamp: '2026-01-01T00:00:00.000Z', type: '' },
    ])('rejects malformed entry %#', (entry) => {
        expect(() => parseAgentConversationLog(JSON.stringify({
            entries: [entry],
            id: 'agent-1',
            startedAt: '2026-01-01T00:00:00.000Z',
            status: 'completed',
        }), 'design/logs/bad-entry.json')).toThrow('Malformed agent conversation: invalid entries[0]')
    })

    it.each([
        ['design', 'design/activity/project.json'],
        ['', 'activity/project.json'],
        ['projects/demo', 'projects/demo/activity/project.json'],
    ])('discovers project conversations from activity for projectFolder %j', async (projectFolder, projectActivityPath) => {
        const storage = {listAgentConversationReferences: async () => [`${projectActivityPath}#conversation=conversation-1`]} as unknown as StorageService

        await expect(listAgentConversationReferences(storage, { branch: 'main', id: 'project' }, projectFolder))
            .resolves.toEqual([`${projectActivityPath}#conversation=conversation-1`])
    })

})
