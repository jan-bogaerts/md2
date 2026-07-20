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
                messages: [{ agent: 'codex', content: 'hello', id: 'm1', role: 'assistant', timestamp: '2026-01-01T00:00:00.000Z' }],
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
        expect(conversation.events).toEqual([])
        expect(conversation.hasExplicitTitle).toBe(true)
        expect(conversation.messages[0].content).toBe('hello')
        expect(conversation.providerSessions[0].conversationId).toBe('session-1')
    })

    it('preserves whether a title was explicit while retaining the id fallback', () => {
        const conversation = parseAgentConversationLog(JSON.stringify({
            cardPath: null,
            completedAt: null,
            id: 'agent-1',
            messages: [],
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
            messages: [],
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

    it('fails malformed logs with missing required data', () => {
        expect(() => parseAgentConversationLog(
            JSON.stringify({ cardPath: 'design/F-1.md', id: 'agent-1', messages: [], status: 'completed' }),
            '.md2-agent-logs/bad.json',
        )).toThrow('missing startedAt')
    })

    it.each([
        ['design', 'design/activity/project.json'],
        ['', 'activity/project.json'],
        ['projects/demo', 'projects/demo/activity/project.json'],
    ])('discovers project conversations from activity for projectFolder %j', async (projectFolder, projectActivityPath) => {
        const storage = {
            listRepositoryFiles: async () => [
                'README.md',
                projectActivityPath,
                `${projectFolder ? `${projectFolder}/` : ''}activity/card__card-1.json`,
            ],
            loadFile: async () => ({
                content: JSON.stringify({
                    conversations: [{ completedAt: 'done', events: [], id: 'conversation-1', messages: [], providerSessions: [], startedAt: 'start', status: 'completed', title: 'Project run' }],
                    origin: { kind: 'project' }, records: [], version: 1,
                }),
                path: projectActivityPath,
            }),
        } as unknown as StorageService

        await expect(listAgentConversationReferences(storage, { branch: 'main', id: 'project' }, projectFolder))
            .resolves.toEqual([`${projectActivityPath}#conversation=conversation-1`])
    })

})
