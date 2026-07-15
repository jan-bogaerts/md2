import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createAgentProviderProtocolParser } = require('./agent_provider_protocol')

function parser(agent) {
    const events = []
    const malformed = vi.fn()
    const instance = createAgentProviderProtocolParser(agent, (event) => events.push(event), malformed)

    return { events, instance, malformed }
}

describe('agent provider protocol', () => {
    it('extracts Codex thread ids and completed assistant messages', () => {
        const { events, instance } = parser('codex')

        instance.push('{"type":"thread.started","thread_id":"thread-1"}\n')
        instance.push('{"type":"turn.started"}\n{"type":"item.completed","item":{"type":"agent_message","text":"done"}}\n')
        instance.finish()

        expect(events[0].conversationId).toBe('thread-1')
        expect(events[2].assistantText).toBe('done')
    })

    it('extracts Claude session ids and assistant text', () => {
        const { events, instance } = parser('claude')

        instance.push('{"type":"system","subtype":"init","session_id":"session-1"}\n')
        instance.push('{"type":"assistant","message":{"content":[{"type":"text","text":"hello"},{"type":"tool_use","name":"Read"}]}}\n')
        instance.finish()

        expect(events[0]).toMatchObject({ conversationId: 'session-1', type: 'system.init' })
        expect(events[1].assistantText).toBe('hello')
    })

    it('recognizes structured missing-session failures only before turn activity', () => {
        const first = parser('codex')
        first.instance.push('{"type":"error","code":"thread_not_found","message":"thread does not exist"}\n')
        first.instance.finish()

        const second = parser('codex')
        second.instance.push('{"type":"turn.started"}\n{"type":"error","code":"thread_not_found","message":"thread does not exist"}\n')
        second.instance.finish()

        expect(first.events[0].missingSession).toBe(true)
        expect(second.events[1].missingSession).toBe(false)
    })

    it('does not replay ambiguous free-text failures', () => {
        const { events, instance } = parser('claude')

        instance.push('{"type":"result","is_error":true,"message":"conversation invalid because permission was denied"}\n')
        instance.finish()

        expect(events[0].missingSession).toBe(false)
    })

    it('reports malformed JSONL instead of treating it as assistant text', () => {
        const { events, instance, malformed } = parser('claude')

        instance.push('not-json\n')
        instance.finish()

        expect(events).toEqual([])
        expect(malformed).toHaveBeenCalledWith('not-json')
    })
})
