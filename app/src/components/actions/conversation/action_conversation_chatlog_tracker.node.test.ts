import { describe, expect, it, vi } from 'vitest'
import type { AgentConversation, AgentConversationEntry, AgentConversationEventEntry } from '../../../data/data_types'
import type { ActionRun, ActionRunRegistry } from '../../../services/actions/action_run_registry'
import type { ActionRunBindingStore } from '../run/state/action_run_binding_store'
import { ActionConversationChatlogTracker } from './action_conversation_chatlog_tracker'
import type { ActionConversationStore } from './action_conversation_store'

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

function conversation(id: string, entries: AgentConversationEntry[], status: AgentConversation['status'] = 'running') {
    return {
        actionId: 'review',
        cardInternalId: 'card-1',
        cardPath: 'design/card.md',
        completedAt: status === 'running' ? null : 'now',
        entries,
        hasExplicitTitle: false,
        id,
        path: `${id}.json`,
        providerSessions: [],
        startedAt: 'now',
        status,
        title: 'Review',
        viewed: true,
    } satisfies AgentConversation
}

function run(runId: string, value: AgentConversation, status: ActionRun['status'] = 'running') {
    return {
        conversation: value,
        conversationChange: { kind: 'replace' as const },
        queuedPrompts: [],
        runId,
        status,
    } as unknown as ActionRun
}

class FakeBindingStore extends EventTarget {
    private runId: string | null

    constructor(runId: string | null) {
        super()
        this.runId = runId
    }

    readonly getSnapshot = () => this.runId

    readonly subscribe = (listener: () => void) => {
        this.addEventListener('changed', listener)

        return () => this.removeEventListener('changed', listener)
    }

    setRunId(runId: string | null) {
        this.runId = runId
        this.dispatchEvent(new Event('changed'))
    }
}

class FakeConversationStore extends EventTarget {
    private selectedConversation: AgentConversation | null = null

    readonly getSnapshot = () => ({ conversations: [], loading: false, selectedConversation: this.selectedConversation })

    readonly subscribe = (listener: () => void) => {
        this.addEventListener('changed', listener)

        return () => this.removeEventListener('changed', listener)
    }

    select(selectedConversation: AgentConversation | null) {
        this.selectedConversation = selectedConversation
        this.dispatchEvent(new Event('changed'))
    }
}

class FakeRunRegistry {
    readonly subscriptions = new Map<string, Set<() => void>>()
    private readonly runs = new Map<string, ActionRun>()

    getRunStore(runId: string) {
        const snapshot = this.runs.get(runId)

        return snapshot ? { getSnapshot: () => snapshot } : null
    }

    subscribeRun(runId: string, listener: () => void) {
        const listeners = this.subscriptions.get(runId) ?? new Set()
        listeners.add(listener)
        this.subscriptions.set(runId, listeners)

        return () => listeners.delete(listener)
    }

    setRun(snapshot: ActionRun) {
        this.runs.set(snapshot.runId, snapshot)
        for (const listener of this.subscriptions.get(snapshot.runId) ?? []) listener()
    }
}

function setup(initialRun: ActionRun) {
    const bindingStore = new FakeBindingStore(initialRun.runId)
    const conversationStore = new FakeConversationStore()
    const registry = new FakeRunRegistry()
    registry.setRun(initialRun)
    const tracker = new ActionConversationChatlogTracker(
        bindingStore as unknown as ActionRunBindingStore,
        conversationStore as unknown as ActionConversationStore,
        registry as unknown as ActionRunRegistry,
    )

    return { bindingStore, conversationStore, registry, tracker }
}

describe('ActionConversationChatlogTracker', () => {
    it('registers every source listener on load and removes them on unload', () => {
        const value = conversation('conversation-1', [message('user-1', 'user')])
        const { bindingStore, conversationStore, registry, tracker } = setup(run('run-1', value))
        const addBinding = vi.spyOn(bindingStore, 'addEventListener')
        const addConversation = vi.spyOn(conversationStore, 'addEventListener')
        const removeBinding = vi.spyOn(bindingStore, 'removeEventListener')
        const removeConversation = vi.spyOn(conversationStore, 'removeEventListener')

        tracker.load()

        expect(addBinding).toHaveBeenCalledOnce()
        expect(addConversation).toHaveBeenCalledOnce()
        expect(registry.subscriptions.get('run-1')?.size).toBe(1)
        tracker.unload()
        expect(registry.subscriptions.get('run-1')?.size).toBe(0)
        expect(removeBinding).toHaveBeenCalledOnce()
        expect(removeConversation).toHaveBeenCalledOnce()
    })

    it('publishes only a new evolving list for an evolving entry update', () => {
        const user = message('user-1', 'user')
        const assistant = message('assistant-1', 'assistant', 'draft')
        const value = conversation('conversation-1', [user, assistant])
        const { registry, tracker } = setup(run('run-1', value))
        tracker.load()
        const stableGroups = tracker.getStableGroups()
        const evolvingGroups = tracker.getEvolvingGroups()
        const stableListener = vi.fn()
        const evolvingListener = vi.fn()
        tracker.subscribeStableGroups(stableListener)
        tracker.subscribeEvolvingGroups(evolvingListener)

        registry.setRun({
            ...run('run-1', { ...value, entries: [user, { ...assistant, content: 'updated' }] }),
            conversationChange: { entryIndex: 1, kind: 'entry' },
        })

        expect(tracker.getStableGroups()).toBe(stableGroups)
        expect(tracker.getEvolvingGroups()).not.toBe(evolvingGroups)
        expect(stableListener).not.toHaveBeenCalled()
        expect(evolvingListener).toHaveBeenCalledOnce()
    })

    it('does not rebuild stable grouping for an evolving entry update', () => {
        const firstUser = message('user-1', 'user')
        const stableAssistant = message('assistant-1', 'assistant')
        const currentUser = message('user-2', 'user')
        const evolvingAssistant = message('assistant-2', 'assistant', 'draft')
        const value = conversation('conversation-1', [firstUser, stableAssistant, currentUser, evolvingAssistant])
        const { registry, tracker } = setup(run('run-1', value))
        tracker.load()
        const protectedStableAssistant = new Proxy(stableAssistant, {
            get(target, property, receiver) {
                if (property === 'id') throw new Error('Stable grouping was rebuilt')

                return Reflect.get(target, property, receiver)
            },
        })

        registry.setRun({
            ...run('run-1', {
                ...value,
                entries: [firstUser, protectedStableAssistant, currentUser, { ...evolvingAssistant, content: 'updated' }],
            }),
            conversationChange: { entryIndex: 3, kind: 'entry' },
        })

        expect(tracker.getEvolvingGroups()[1]).toEqual(expect.objectContaining({entry: expect.objectContaining({ content: 'updated' })}))
    })

    it('keeps a stable terminal tool group reference during an evolving entry update', () => {
        const firstUser = message('user-1', 'user')
        const completedTool = event('tool-1', 'webSearch')
        const failedTool = event('tool-2', 'mcpToolCall', { status: 'failed' })
        const currentUser = message('user-2', 'user')
        const evolvingAssistant = message('assistant-1', 'assistant', 'draft')
        const value = conversation('conversation-1', [
            firstUser,
            completedTool,
            failedTool,
            currentUser,
            evolvingAssistant,
        ])
        const { registry, tracker } = setup(run('run-1', value))
        tracker.load()
        const stableGroups = tracker.getStableGroups()
        const terminalToolGroup = stableGroups.find(({ kind }) => kind === 'terminalToolCalls')
        if (!terminalToolGroup) throw new Error('Missing terminal tool group')

        registry.setRun({
            ...run('run-1', {
                ...value,
                entries: [firstUser, completedTool, failedTool, currentUser, { ...evolvingAssistant, content: 'updated' }],
            }),
            conversationChange: { entryIndex: 4, kind: 'entry' },
        })

        expect(tracker.getStableGroups()).toBe(stableGroups)
        expect(tracker.getStableGroups()).toContain(terminalToolGroup)
        expect(tracker.getEvolvingGroups().at(-1)).toEqual(expect.objectContaining({entry: expect.objectContaining({ content: 'updated' })}))
    })

    it('updates a stable entry and publishes only a new stable list', () => {
        const firstUser = message('user-1', 'user')
        const firstAssistant = message('assistant-1', 'assistant')
        const currentUser = message('user-2', 'user')
        const value = conversation('conversation-1', [firstUser, firstAssistant, currentUser])
        const { registry, tracker } = setup(run('run-1', value))
        tracker.load()
        const stableGroups = tracker.getStableGroups()
        const evolvingGroups = tracker.getEvolvingGroups()

        registry.setRun({
            ...run('run-1', { ...value, entries: [firstUser, { ...firstAssistant, content: 'late' }, currentUser] }),
            conversationChange: { entryIndex: 1, kind: 'entry' },
        })

        expect(tracker.getStableGroups()).not.toBe(stableGroups)
        expect(tracker.getEvolvingGroups()).toBe(evolvingGroups)
        expect(tracker.getStableGroups()[1]).toEqual(expect.objectContaining({entry: expect.objectContaining({ content: 'late' })}))
    })

    it('preserves a sub-agent group whose entries cross the stable boundary', () => {
        const firstUser = message('user-1', 'user')
        const agentCall = event('agent-1', 'tool.Agent', { status: 'running' })
        const currentUser = message('user-2', 'user')
        const child = event('child-1', 'agentMessage', { label: 'Explore', parentItemId: 'agent-1' })
        const value = conversation('conversation-1', [firstUser, agentCall, currentUser, child])
        const { registry, tracker } = setup(run('run-1', value))
        tracker.load()
        const stableGroups = tracker.getStableGroups()

        registry.setRun({
            ...run('run-1', { ...value, entries: [firstUser, agentCall, currentUser, { ...child, content: 'updated' }] }),
            conversationChange: { entryIndex: 3, kind: 'entry' },
        })

        expect(tracker.getStableGroups()).toBe(stableGroups)
        expect(tracker.getEvolvingGroups()[0]).toEqual(expect.objectContaining({
            groups: [expect.objectContaining({ entry: expect.objectContaining({ content: 'updated' }) })],
            kind: 'subAgent',
        }))
    })

    it('moves groups on lifecycle change and accepts later updates to moved groups', () => {
        const user = message('user-1', 'user')
        const assistant = message('assistant-1', 'assistant')
        const value = conversation('conversation-1', [user, assistant])
        const { registry, tracker } = setup(run('run-1', value))
        tracker.load()

        registry.setRun({ ...run('run-1', { ...value, status: 'completed' }, 'completed'), conversationChange: null })
        expect(tracker.getEvolvingGroups()).toHaveLength(0)
        expect(tracker.getStableGroups().map(({ key }) => key)).toEqual(['user-1', 'assistant-1'])

        registry.setRun({
            ...run('run-1', { ...value, entries: [user, { ...assistant, content: 'recovered' }], status: 'completed' }, 'completed'),
            conversationChange: { entryIndex: 1, kind: 'entry' },
        })
        expect(tracker.getStableGroups()[1]).toEqual(expect.objectContaining({entry: expect.objectContaining({ content: 'recovered' })}))
    })

    it('rebuilds both lists for a same-conversation replacement', () => {
        const firstUser = message('user-1', 'user')
        const secondUser = message('user-2', 'user')
        const initial = conversation('conversation-1', [firstUser, message('assistant-1', 'assistant'), secondUser])
        const { registry, tracker } = setup(run('run-1', initial))
        tracker.load()
        const stableGroups = tracker.getStableGroups()
        const evolvingGroups = tracker.getEvolvingGroups()
        const replacement = {
            ...initial,
            entries: [firstUser, message('assistant-1', 'assistant', 'recovered'), { ...secondUser, content: 'restored' }],
        }

        registry.setRun(run('run-1', replacement))

        expect(tracker.getStableGroups()).not.toBe(stableGroups)
        expect(tracker.getEvolvingGroups()).not.toBe(evolvingGroups)
    })

    it('rebuilds an untracked replacement and restores provider-event visibility', () => {
        const firstUser = { ...message('user-1', 'user'), agent: 'claude' }
        const initial = conversation('conversation-1', [firstUser])
        const { registry, tracker } = setup(run('run-1', initial))
        tracker.load()
        const providerEvent = event('tool-1', 'webSearch')

        registry.setRun({
            ...run('run-1', { ...initial, entries: [firstUser, providerEvent] }),
            conversationChange: null,
        })

        expect(tracker.getEvolvingGroups().map(({ key }) => key)).toEqual(['user-1', 'tool-1'])
    })

    it('keeps conversation state while binding a continuation run with same identity', () => {
        const firstUser = message('user-1', 'user')
        const currentUser = message('user-2', 'user')
        const value = conversation('conversation-1', [firstUser, message('assistant-1', 'assistant'), currentUser])
        const { bindingStore, registry, tracker } = setup(run('run-1', value))
        registry.setRun(run('run-2', value))
        tracker.load()
        const stableGroups = tracker.getStableGroups()
        tracker.toggleExpansion('assistant-1')

        bindingStore.setRunId('run-2')

        expect(tracker.getConversationIdentity()).toBe('conversation-1')
        expect(tracker.getStableGroups()).toBe(stableGroups)
        expect(tracker.groupIsExpanded('assistant-1')).toBe(true)
        expect(registry.subscriptions.get('run-1')?.size).toBe(0)
        expect(registry.subscriptions.get('run-2')?.size).toBe(1)
    })

    it('keeps the current conversation while a continuation run awaits its first snapshot', () => {
        const value = conversation('conversation-1', [message('user-1', 'user')])
        const { bindingStore, registry, tracker } = setup(run('run-1', value))
        tracker.load()
        const evolvingGroups = tracker.getEvolvingGroups()

        bindingStore.setRunId('run-2')

        expect(tracker.getConversationIdentity()).toBe('conversation-1')
        expect(tracker.getEvolvingGroups()).toBe(evolvingGroups)
        expect(registry.subscriptions.get('run-1')?.size).toBe(0)
        expect(registry.subscriptions.get('run-2')?.size).toBe(1)
    })

    it('uses a live snapshot with the same conversation identity after its path changes', () => {
        const persisted = conversation('conversation-1', [message('persisted-user', 'user')], 'completed')
        const live = {
            ...persisted,
            entries: [message('live-user', 'user')],
            path: 'moved-conversation.json',
            status: 'running' as const,
        }
        const { conversationStore, registry, tracker } = setup(run('run-1', live))
        conversationStore.select(persisted)
        tracker.load()

        expect(tracker.getEvolvingGroups().map(({ key }) => key)).toEqual(['live-user'])
        expect(registry.subscriptions.get('run-1')?.size).toBe(1)
    })

    it('resets expansion and render state when selection changes conversation identity', () => {
        const live = conversation('conversation-1', [message('user-1', 'user')])
        const historical = conversation('conversation-2', [message('history-user', 'user')], 'completed')
        const { conversationStore, registry, tracker } = setup(run('run-1', live))
        tracker.load()
        tracker.toggleExpansion('user-1')

        conversationStore.select(historical)

        expect(tracker.getConversationIdentity()).toBe('conversation-2')
        expect(tracker.groupIsExpanded('user-1')).toBe(false)
        expect(tracker.getStableGroups().map(({ key }) => key)).toEqual(['history-user'])
        expect(tracker.getEvolvingGroups()).toHaveLength(0)
        expect(registry.subscriptions.get('run-1')?.size).toBe(1)
    })

    it('preserves nested grouping, provider visibility, expansion, and reservations', () => {
        const user = message('user-1', 'user')
        const agentCall = event('agent-1', 'tool.Agent', { status: 'running' })
        const child = event('child-1', 'agentMessage', { label: 'Explore', parentItemId: 'agent-1' })
        const value = conversation('conversation-1', [user, agentCall, child])
        const { tracker } = setup(run('run-1', value))
        tracker.load()

        const subAgent = tracker.getEvolvingGroups().find(({ kind }) => kind === 'subAgent')
        expect(subAgent).toEqual(expect.objectContaining({ kind: 'subAgent', label: 'Explore' }))
        expect(tracker.getReservedBlockCount()).toBe(0)
        if (!subAgent) throw new Error('Missing sub-agent group')
        tracker.toggleExpansion(subAgent.key)
        expect(tracker.groupIsExpanded(subAgent.key)).toBe(true)
    })
})
