import { describe, expect, it } from 'vitest'
import { parseAgentConversationLog } from './agent_conversation_service'

describe('parseAgentConversationLog', () => {
    it('normalizes a persisted agent log', () => {
        const conversation = parseAgentConversationLog(
            JSON.stringify({
                cardPath: 'design/F-1.md',
                completedAt: null,
                continuedFrom: '.md2-agent-logs/source.json',
                id: 'agent-1',
                messages: [{ content: 'hello', id: 'm1', role: 'agent', timestamp: '2026-01-01T00:00:00.000Z' }],
                nativeSessionId: 'session-1',
                startedAt: '2026-01-01T00:00:00.000Z',
                status: 'running',
                title: 'Agent run',
            }),
            '.md2-agent-logs/one.json',
        )

        expect(conversation.path).toBe('.md2-agent-logs/one.json')
        expect(conversation.continuedFrom).toBe('.md2-agent-logs/source.json')
        expect(conversation.events).toEqual([])
        expect(conversation.messages[0].content).toBe('hello')
        expect(conversation.nativeSessionId).toBe('session-1')
    })

    it('fails malformed logs with missing required data', () => {
        expect(() => parseAgentConversationLog(
            JSON.stringify({ cardPath: 'design/F-1.md', id: 'agent-1', messages: [], status: 'completed' }),
            '.md2-agent-logs/bad.json',
        )).toThrow('missing startedAt')
    })

})
