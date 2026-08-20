import { describe, expect, it } from 'vitest'
import {
    AGENT_RESULT_MAX_LENGTH,
    appendBoundedAgentResult,
    boundedAgentResult,
    parseAgentConversation,
    parseAgentConversationValue,
} from '../../../../shared/agent_conversations.mjs'
import type { StorageService } from '../../data/data_types'
import { listAgentConversationReferences, parseAgentConversationLog } from './agent_conversation_service'

describe('parseAgentConversationLog', () => {
    it.each([AGENT_RESULT_MAX_LENGTH - 1, AGENT_RESULT_MAX_LENGTH])(
        'preserves a command result containing %i characters byte-for-byte',
        (length) => {
            const content = 'x'.repeat(length)

            expect(boundedAgentResult(content)).toBe(content)
        },
    )

    it('retains head and tail with an omitted-character marker above the result limit', () => {
        const content = `${'head'.repeat(1_500)}${'middle'.repeat(1_000)}${'tail'.repeat(1_500)}`
        const bounded = boundedAgentResult(content)

        expect(bounded).toHaveLength(AGENT_RESULT_MAX_LENGTH)
        expect(bounded).toMatch(/^head/u)
        expect(bounded).toMatch(/tail$/u)
        expect(bounded).toMatch(/\n\[\d+ characters omitted\]\n/u)
    })

    it('does not split a Unicode surrogate pair at either retained boundary', () => {
        const content = `${'a'.repeat(4_079)}😀${'b'.repeat(4_100)}😀${'c'.repeat(4_079)}`
        const bounded = boundedAgentResult(content)
        const codeUnits = [...bounded].flatMap((character) => (
            character.length === 2 ? [] : [character.charCodeAt(0)]
        ))

        expect(codeUnits.some((codeUnit) => codeUnit >= 0xD800 && codeUnit <= 0xDFFF)).toBe(false)
        expect(bounded.length).toBeLessThanOrEqual(AGENT_RESULT_MAX_LENGTH)
    })

    it('produces the same bounded result from streamed chunks without retaining the middle', () => {
        const chunks = ['head'.repeat(1_500), 'middle'.repeat(2_000), 'tail'.repeat(1_500)]
        let accumulated = appendBoundedAgentResult(null, '')
        for (const chunk of chunks) accumulated = appendBoundedAgentResult(accumulated.state, chunk)

        expect(accumulated.value).toBe(boundedAgentResult(chunks.join('')))
        expect(accumulated.state.head).toHaveLength(AGENT_RESULT_MAX_LENGTH)
        expect(accumulated.state.tail).toHaveLength(AGENT_RESULT_MAX_LENGTH)
    })

    it('produces equivalent results from string and value parsers', () => {
        const source = {
            completedAt: null,
            entries: [{ content: 'hello', id: 'message-1', kind: 'message', role: 'assistant', timestamp: '2026-01-01T00:00:00.000Z' }],
            id: 'agent-1',
            startedAt: '2026-01-01T00:00:00.000Z',
            status: 'completed',
        }

        expect(parseAgentConversationValue(source, 'design/logs/one.json'))
            .toEqual(parseAgentConversation(JSON.stringify(source), 'design/logs/one.json'))
    })

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
        expect(conversation.viewed).toBe(true)
        expect(conversation.entries[0]).toMatchObject({ content: 'hello', kind: 'message' })
        expect(conversation.providerSessions[0].conversationId).toBe('session-1')
    })

    it.each([
        [undefined, true],
        [true, true],
        [false, false],
    ])('normalizes persisted viewed value %j', (viewed, expected) => {
        const source = {
            completedAt: null,
            entries: [],
            id: 'agent-1',
            startedAt: '2026-01-01T00:00:00.000Z',
            status: 'completed',
            ...(viewed === undefined ? {} : { viewed }),
        }

        expect(parseAgentConversationLog(JSON.stringify(source), 'design/logs/one.json').viewed).toBe(expected)
    })

    it.each([null, 1, 'true', {}])('rejects invalid persisted viewed value %j', (viewed) => {
        expect(() => parseAgentConversationLog(JSON.stringify({
            completedAt: null,
            entries: [],
            id: 'agent-1',
            startedAt: '2026-01-01T00:00:00.000Z',
            status: 'completed',
            viewed,
        }), 'design/logs/one.json')).toThrow('Malformed agent conversation: invalid viewed')
    })

    it('preserves valid timer data and leaves legacy duration unavailable', () => {
        const source = {
            completedAt: null,
            entries: [],
            id: 'agent-1',
            startedAt: '2026-01-01T00:00:00.000Z',
            status: 'waitingForInput',
        }
        const timed = parseAgentConversationLog(JSON.stringify({
            ...source,
            timer: { elapsedMs: 10_000, runningStartedAt: null },
        }), 'design/logs/timed.json')
        const legacy = parseAgentConversationLog(JSON.stringify(source), 'design/logs/legacy.json')

        expect(timed.timer).toEqual({ elapsedMs: 10_000, runningStartedAt: null })
        expect(legacy).not.toHaveProperty('timer')
    })

    it.each([
        [null, 'invalid timer'],
        [{ elapsedMs: -1, runningStartedAt: null }, 'invalid timer.elapsedMs'],
        [{ elapsedMs: Number.POSITIVE_INFINITY, runningStartedAt: null }, 'invalid timer.elapsedMs'],
        [{ elapsedMs: 0, runningStartedAt: 'not-a-timestamp' }, 'invalid timer.runningStartedAt'],
        [{ elapsedMs: 0 }, 'invalid timer.runningStartedAt'],
    ])('rejects invalid timer data %#', (timer, message) => {
        expect(() => parseAgentConversationLog(JSON.stringify({
            completedAt: null,
            entries: [],
            id: 'agent-1',
            startedAt: '2026-01-01T00:00:00.000Z',
            status: 'completed',
            timer,
        }), 'design/logs/invalid-timer.json')).toThrow(message)
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
            totalTokens: 999,
        })
    })

    it('preserves valid context-window usage and omits malformed optional snapshots', () => {
        const source = {
            completedAt: null,
            entries: [],
            id: 'agent-1',
            startedAt: '2026-01-01T00:00:00.000Z',
            status: 'completed',
        }
        const valid = parseAgentConversationLog(JSON.stringify({
            ...source,
            contextWindowUsage: { capacityTokens: 258_400, usedTokens: 42_000 },
        }), 'design/logs/one.json')

        expect(valid.contextWindowUsage).toEqual({ capacityTokens: 258_400, usedTokens: 42_000 })

        for (const contextWindowUsage of [
            { capacityTokens: 0, usedTokens: 42_000 },
            { capacityTokens: -1, usedTokens: 42_000 },
            { capacityTokens: '258400', usedTokens: 42_000 },
            { capacityTokens: 258_400, usedTokens: -1 },
        ]) {
            const conversation = parseAgentConversationLog(
                JSON.stringify({ ...source, contextWindowUsage }),
                'design/logs/one.json',
            )
            expect(conversation).not.toHaveProperty('contextWindowUsage')
        }
    })

    it('preserves structured sequenced conversation activity', () => {
        const conversation = parseAgentConversationLog(JSON.stringify({
            completedAt: null,
            entries: [{
                command: 'npm test',
                content: 'running',
                deletions: 2,
                details: ['detail'],
                durationMs: 25,
                exitCode: 1,
                id: 'activity-1',
                insertions: 4,
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
            deletions: 2,
            details: ['detail'],
            durationMs: 25,
            exitCode: 1,
            insertions: 4,
            providerItemId: 'command-1',
            sequence: 2,
            status: 'failed',
            summary: ['summary'],
            workingDirectory: 'C:\\repo',
        })
        expect(conversation.entries[0]).not.toHaveProperty('output')
    })

    it('canonicalizes oversized command and tool results without changing tool input', () => {
        const oversizedResult = 'result'.repeat(2_000)
        const conversation = parseAgentConversationLog(JSON.stringify({
            completedAt: null,
            entries: [{
                command: oversizedResult,
                content: oversizedResult,
                id: 'command-1',
                kind: 'event',
                output: oversizedResult,
                timestamp: '2026-01-01T00:00:00.000Z',
                type: 'commandExecution',
            }, {
                content: oversizedResult,
                id: 'tool-1',
                kind: 'event',
                output: oversizedResult,
                timestamp: '2026-01-01T00:00:01.000Z',
                type: 'mcpToolCall',
            }],
            id: 'agent-1',
            startedAt: '2026-01-01T00:00:00.000Z',
            status: 'completed',
        }), 'design/logs/results.json')
        const [command, tool] = conversation.entries
        if (command.kind !== 'event' || tool.kind !== 'event') throw new Error('Expected canonical result events')

        expect(command).toMatchObject({ command: oversizedResult, kind: 'event' })
        expect(command.content).toHaveLength(AGENT_RESULT_MAX_LENGTH)
        expect(command).not.toHaveProperty('output')
        expect(tool).toMatchObject({ content: oversizedResult, kind: 'event' })
        expect(tool.output).toHaveLength(AGENT_RESULT_MAX_LENGTH)
    })

    it('preserves completed file-change counts and readable content after reload', () => {
        const timestamp = '2026-01-01T00:00:00.000Z'
        const conversation = parseAgentConversationLog(JSON.stringify({
            completedAt: timestamp,
            entries: [{
                content: 'add: generated/new-file.txt\nupdate: app/existing.txt',
                deletions: 0,
                id: 'file-counts',
                insertions: 141,
                kind: 'event',
                label: 'File changes',
                providerItemId: 'file-counts',
                sequence: 1,
                status: 'completed',
                timestamp,
                type: 'fileChange',
            }],
            id: 'agent-1',
            startedAt: timestamp,
            status: 'completed',
        }), 'design/logs/file-counts.json')

        expect(conversation.entries).toEqual([expect.objectContaining({
            content: 'add: generated/new-file.txt\nupdate: app/existing.txt',
            deletions: 0,
            insertions: 141,
            status: 'completed',
            type: 'fileChange',
        })])
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

    it('removes legacy runner lifecycle and stderr entries while preserving provider events', () => {
        const timestamp = '2026-01-01T00:00:00.000Z'
        const conversation = parseAgentConversationLog(JSON.stringify({
            completedAt: timestamp,
            entries: [
                { content: 'codex app-server --stdio', id: 'started-1', kind: 'event', sequence: 1, timestamp, type: 'started' },
                {
                    content: 'modified: design/F-1.md', id: 'file-1', kind: 'event', label: 'File changes',
                    providerItemId: 'file-1', sequence: 2, status: 'completed', timestamp, type: 'fileChange',
                },
                { content: 'internal runtime output', id: 'error-1', kind: 'event', sequence: 3, timestamp, type: 'error' },
                { content: '', id: 'turn-1', kind: 'event', sequence: 4, timestamp, type: 'turnCompleted' },
                { content: '0', id: 'closed-1', kind: 'event', sequence: 5, timestamp, type: 'closed' },
            ],
            id: 'agent-1',
            startedAt: timestamp,
            status: 'completed',
        }), 'design/logs/legacy-runner-events.json')

        expect(conversation.entries).toEqual([expect.objectContaining({
            content: 'modified: design/F-1.md',
            id: 'file-1',
            label: 'File changes',
            status: 'completed',
            type: 'fileChange',
        })])
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
