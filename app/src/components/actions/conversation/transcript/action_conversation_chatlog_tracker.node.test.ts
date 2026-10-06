import { describe, expect, it, vi } from 'vitest'
import type { AgentConversation, AgentConversationEntry, AgentConversationEventEntry } from '../../../../data/data_types'
import type { ActionRun, ActionRunRegistry } from '../../../../services/actions/action_run_registry'
import type { ActionRunBindingStore } from '../../run/state/action_run_binding_store'
import { ActionConversationChatlogTracker } from './action_conversation_chatlog_tracker'
import type { ActionConversationStore } from '../state/action_conversation_store'
import type { PendingActionSubmission } from '../../../../services/actions/action_run_registry';

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
    readonly actionId = 'review';
    readonly context = { cardInternalId: 'card-1', kind: 'card' as const };
    readonly getSnapshot = () => ({ conversations: [], loading: false, selectedConversation: this.selectedConversation });

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
    private submissions: PendingActionSubmission[] = []
    private submissionConversationId: string | null = null
    private submissionRunId: string | null = null
    private readonly submissionEvents = new EventTarget()

    readonly getSubmissions = () => this.submissions
    readonly getVisibleSubmissions = (_actionId: string, _context: unknown, conversationId: string | null, runId: string | null) => (
        conversationId ? conversationId === this.submissionConversationId : runId === this.submissionRunId
    ) ? this.submissions : []
    readonly subscribeSubmissions = (_actionId: string, _context: unknown, listener: () => void) => {
        this.submissionEvents.addEventListener('changed', listener)

        return () => this.submissionEvents.removeEventListener('changed', listener)
    }


    setSubmissions(submissions: PendingActionSubmission[], conversationId: string | null, runId: string | null) {
        this.submissions = submissions
        this.submissionConversationId = conversationId
        this.submissionRunId = runId
        this.submissionEvents.dispatchEvent(new Event('changed'))
    }

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
    it('keeps one current-turn message object through queue and sent acknowledgements', () => {
        const value = conversation('conversation-1', []);
        const { registry, tracker } = setup(run('run-1', value));
        tracker.load();
        const submission: PendingActionSubmission = { content: 'Send this', id: 'submission-1', prompt: null, state: 'transmitting' };
        registry.setSubmissions([submission], value.id, 'run-1');
        const initialGroup = tracker.getEvolvingGroups()[0];
        const prompt = tracker.getPrompt(submission.id);
        expect(initialGroup.kind).toBe('entry');
        expect(prompt?.getSnapshot().state).toBe('transmitting');
        const queuedPrompt = { content: submission.content, dispatchState: 'queued' as const, id: submission.id, revision: 0 };
        registry.setRun({ ...run('run-1', value), queuedPrompts: [queuedPrompt] });
        registry.setSubmissions([{ ...submission, prompt: queuedPrompt, state: 'queued' }], value.id, 'run-1');
        expect(tracker.getEvolvingGroups()).toEqual([initialGroup]);
        expect(prompt?.getSnapshot().state).toBe('queued');
        const dispatchingPrompt = { ...queuedPrompt, dispatchState: 'dispatching' as const };
        registry.setRun({ ...run('run-1', value), queuedPrompts: [dispatchingPrompt] });
        expect(tracker.getEvolvingGroups()[0]).toBe(initialGroup);
        expect(prompt?.getSnapshot().state).toBe('sending');
        const sendingNotification = vi.fn();
        const unsubscribeSending = prompt?.subscribe(sendingNotification);
        registry.setRun({ ...run('run-1', value), conversationChange: null, queuedPrompts: [dispatchingPrompt] });
        expect(sendingNotification).not.toHaveBeenCalled();
        unsubscribeSending?.();
        const sentMessage = message(submission.id, 'user', submission.content);
        registry.setRun(run('run-1', { ...value, entries: [sentMessage] }));
        registry.setSubmissions([], value.id, 'run-1');
        expect(tracker.getEvolvingGroups()[0]).toBe(initialGroup);
        expect(prompt?.entry).not.toBe(sentMessage);
        expect(prompt?.entry).toEqual(sentMessage);
        expect(prompt?.getSnapshot().state).toBe('sent');
        const notification = vi.fn();
        prompt?.subscribe(notification);
        registry.setRun({ ...run('run-1', { ...value, entries: [sentMessage] }), conversationChange: null });
        expect(notification).not.toHaveBeenCalled();
        tracker.unload();
    });

    it('publishes displayed conversation status without replacing unchanged groups', () => {
        const entries = [message('user-1', 'user')]
        const running = conversation('conversation-1', entries)
        const waiting = { ...running, status: 'waitingForInput' as const }
        const historical = conversation('conversation-2', entries, 'completed')
        const { registry, tracker } = setup(run('run-1', running))
        tracker.load()
        const groups = tracker.getEvolvingGroups()
        const statuses: Array<AgentConversation['status'] | null> = []
        tracker.subscribeConversationStatus(() => statuses.push(tracker.getConversationStatus()))

        registry.setRun({ ...run('run-1', waiting, 'waitingForInput'), conversationChange: null })
        expect(tracker.getEvolvingGroups()).toBe(groups)
        expect(tracker.getConversationStatus()).toBe('waitingForInput')

        conversationStore.select(historical)
        expect(tracker.getConversationStatus()).toBe('completed')
        expect(statuses).toEqual(['waitingForInput', 'completed'])
    })

    it('shows an unbound new submission and hides live pending rows for history', () => {
        const live = conversation('conversation-1', [])
        const historical = conversation('conversation-2', [], 'completed')
        const { bindingStore, conversationStore, registry, tracker } = setup(run('run-1', live))
        bindingStore.setRunId(null)
        tracker.load()
        registry.setSubmissions([
            { content: 'Start now', id: 'submission-1', prompt: null, state: 'transmitting' },
        ], null, null)
        expect(tracker.getEvolvingGroups().map(({ key }) => key)).toEqual(['submission-1']);

        bindingStore.setRunId('run-1')
        registry.setSubmissions([
            { content: 'Continue', id: 'submission-2', prompt: null, state: 'transmitting' },
        ], live.id, 'run-1')
        expect(tracker.getEvolvingGroups().map(({ key }) => key)).toEqual(['submission-2']);
        conversationStore.select(historical)
        expect(tracker.getEvolvingGroups()).toEqual([]);
    })
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

    it('renders no row for the recorded agent question', () => {
        const user = message('user-1', 'user')
        const questionEntry = event('question-1', 'agentQuestion', {
            content: '',
            questions: [{ header: 'Scope', id: 'choice', question: 'How wide?' }],
            status: undefined,
        })
        const value = conversation('conversation-1', [user, questionEntry], 'waitingForInput')
        const { tracker } = setup(run('run-1', value, 'waitingForInput'))
        tracker.load()

        const renderedEntries = [...tracker.getStableGroups(), ...tracker.getEvolvingGroups()]
            .flatMap((group) => (group.kind === 'entry' ? [group.entry] : group.kind === 'terminalToolCalls' ? group.entries : []))

        expect(renderedEntries.map(({ id }) => id)).toEqual(['user-1'])
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
        const { registry, tracker } = setup(run('run-1', live))
        conversationStore.select(persisted)
        tracker.load()

        expect(tracker.getEvolvingGroups().map(({ key }) => key)).toEqual(['live-user'])
        expect(registry.subscriptions.get('run-1')?.size).toBe(1)
    })

    it('resets expansion and render state when selection changes conversation identity', () => {
        const live = conversation('conversation-1', [message('user-1', 'user')])
        const historical = conversation('conversation-2', [message('history-user', 'user')], 'completed')
        const { registry, tracker } = setup(run('run-1', live))
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
