import { describe, expect, it } from 'vitest'
import type { AgentConversationEntry, AgentConversationEventEntry } from '../../../data/data_types'
import {
    ActionConversationRenderProjection,
    type ConversationRenderInput,
} from './action_conversation_render_projection'

function message(id: string, role: 'assistant' | 'user', content = id) {
    return { agent: 'codex', content, id, kind: 'message' as const, role, timestamp: 'now' }
}

function event(
    id: string,
    type: string,
    overrides: Partial<AgentConversationEventEntry> = {},
): AgentConversationEventEntry {
    return {
        content: id,
        id,
        kind: 'event',
        providerItemId: id,
        status: 'completed',
        timestamp: 'now',
        type,
        ...overrides,
    }
}

function conversation(entries: AgentConversationEntry[], change: ConversationRenderInput['change']): ConversationRenderInput {
    return {
        cardInternalId: 'card-1',
        change,
        entries,
        path: 'conversation.json',
        providerSessions: [],
    }
}

describe('ActionConversationRenderProjection', () => {
    it('keeps long immutable history and completed group references stable during active text updates', () => {
        const firstUser = message('user-1', 'user')
        const historicalMessage = message('assistant-1', 'assistant')
        const firstTool = event('tool-1', 'webSearch')
        const secondTool = event('tool-2', 'mcpToolCall')
        const agentCall = event('agent-1', 'tool.Agent')
        const child = event('agent-child', 'agentMessage', { label: 'Explore', parentItemId: 'agent-1' })
        const currentUser = message('user-2', 'user')
        const activeMessage = message('assistant-2', 'assistant', 'draft')
        const entries = [
            firstUser,
            historicalMessage,
            firstTool,
            secondTool,
            agentCall,
            child,
            currentUser,
            activeMessage,
        ]
        const projection = new ActionConversationRenderProjection()
        const initial = projection.update(conversation(entries, { kind: 'replace' }), true)
        const historyGroups = initial.historyGroups
        const completedToolGroup = historyGroups.find(({ kind }) => kind === 'completedToolCalls')
        const subAgentGroup = historyGroups.find(({ kind }) => kind === 'subAgent')
        const reservationGroups = initial.reservationGroups
        const updatedMessage = { ...activeMessage, content: 'draft update' }
        const updated = projection.update(
            conversation([...entries.slice(0, 7), updatedMessage], { entryIndex: 7, kind: 'entry' }),
            true,
        )

        expect(updated.historyGroups).toBe(historyGroups)
        expect(updated.historyGroups).toContain(completedToolGroup)
        expect(updated.historyGroups).toContain(subAgentGroup)
        expect(updated.reservationGroups).toBe(reservationGroups)
        expect(updated.tailGroups.at(-1)).not.toBe(initial.tailGroups.at(-1))
    })

    it('seals the previous turn once, preserves expansion, and rejects later sealed updates', () => {
        const firstUser = message('user-1', 'user')
        const firstTool = event('tool-1', 'webSearch')
        const secondTool = event('tool-2', 'mcpToolCall')
        const assistant = message('assistant-1', 'assistant')
        const initialEntries = [firstUser, firstTool, secondTool, assistant]
        const projection = new ActionConversationRenderProjection()
        const initial = projection.update(conversation(initialEntries, { kind: 'replace' }), true)
        const completedGroup = initial.tailGroups.find(({ kind }) => kind === 'completedToolCalls')
        if (!completedGroup) throw new Error('Missing completed tool group')
        projection.toggleExpansion(completedGroup.key)
        const nextUser = message('user-2', 'user')
        const sealed = projection.update(
            conversation([...initialEntries, nextUser], { entryIndex: 4, kind: 'entry' }),
            true,
        )

        expect(sealed.historyGroups).toContain(completedGroup)
        expect(sealed.sealedGroupKeys).toContain(completedGroup.key)
        expect(projection.groupIsExpanded(completedGroup.key)).toBe(true)
        expect(sealed.tailGroups).toEqual([expect.objectContaining({ entry: nextUser })])
        expect(() => projection.update(
            conversation([
                firstUser,
                { ...firstTool, content: 'late update' },
                secondTool,
                assistant,
                nextUser,
            ], { entryIndex: 1, kind: 'entry' }),
            true,
        )).toThrow('Conversation update targets sealed entry index 1')
    })

    it('builds a persisted conversation entirely as immutable history', () => {
        const entries = [message('user-1', 'user'), message('assistant-1', 'assistant')]
        const projection = new ActionConversationRenderProjection()
        const snapshot = projection.update(conversation(entries, { kind: 'replace' }), false)

        expect(snapshot.historyGroups).toHaveLength(2)
        expect(snapshot.tailGroups).toHaveLength(0)
    })

    it('changes reservation session when the same conversation path is replaced', () => {
        const entries = [message('user-1', 'user'), message('assistant-1', 'assistant')]
        const projection = new ActionConversationRenderProjection()
        const initial = projection.update(conversation(entries, { kind: 'replace' }), true)
        const updatedMessage = { ...entries[1], content: 'updated' }
        const updated = projection.update(
            conversation([entries[0], updatedMessage], { entryIndex: 1, kind: 'entry' }),
            true,
        )
        const replaced = projection.update(
            conversation([entries[0], updatedMessage], { kind: 'replace' }),
            true,
        )

        expect(updated.reservationSession).toBe(initial.reservationSession)
        expect(replaced.reservationSession).not.toBe(initial.reservationSession)
    })

    it('checks only the changed entry when provider visibility is still disabled', () => {
        const firstUser = { ...message('user-1', 'user'), agent: 'claude' }
        const activeMessage = { ...message('assistant-1', 'assistant'), agent: 'claude' }
        const entries = [firstUser, activeMessage]
        const projection = new ActionConversationRenderProjection()
        projection.update(conversation(entries, { kind: 'replace' }), true)
        const updatedEntries = [firstUser, { ...activeMessage, content: 'updated' }]
        updatedEntries.some = () => { throw new Error('complete conversation was scanned') }

        expect(() => projection.update(
            conversation(updatedEntries, { entryIndex: 1, kind: 'entry' }),
            true,
        )).not.toThrow()
    })
})
