import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionRunEvent } from '../../../../data/action_run_types'
import type { AgentConversation } from '../../../../data/data_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../../data/electron_action_bridge'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { ActionRunBindingStore } from './action_run_binding_store'

const context: ActionContext = { cardInternalId: 'card-1', file: 'design/card.md', kind: 'card' }
const conversation: AgentConversation = {
    actionId: 'review', cardInternalId: 'card-1', cardPath: 'design/card.md', completedAt: null, entries: [],
    hasExplicitTitle: true, id: 'conversation-1', path: 'activity.json', providerSessions: [], startedAt: 'now',
    status: 'running', title: 'Review', viewed: true,
}
const eventBase = { actionId: 'review', context, phase: 'main' as const, rootActionId: 'review' }

function connectRegistry() {
    let listener: ((event: ActionRunEvent) => void) | null = null
    const bridge = {
        onActionRun: vi.fn((nextListener) => {
            listener = nextListener
            return vi.fn()
        }),
    } as unknown as ElectronActionBridge
    setActionBridgeOverride(bridge)
    actionRunRegistry.start()

    return (event: ActionRunEvent) => {
        if (!listener) throw new Error('Missing run listener')
        listener(event)
    }
}

function startConversation(emit: (event: ActionRunEvent) => void, runId: string, startedConversation = conversation) {
    emit({ ...eventBase, runId, status: 'running', type: 'run' })
    emit({ ...eventBase, runId, status: 'running', type: 'update', update: { continued: true, conversation: startedConversation, kind: 'agentStarted' } })
}

describe('ActionRunBindingStore', () => {
    afterEach(() => {
        actionRunRegistry.stop()
        setActionBridgeOverride(null)
    })

    it('publishes run selection changes and represents New conversation with null', () => {
        const store = new ActionRunBindingStore('run-1')
        const listener = vi.fn()
        const unsubscribe = store.subscribe(listener)

        store.setRunId('run-1')
        store.setRunId('run-2')
        store.setRunId(null)

        expect(listener).toHaveBeenCalledTimes(2)
        expect(store.getSnapshot()).toBeNull()
        unsubscribe()
    })

    it('follows the successor run that continues its conversation after the bound run ends', () => {
        const emit = connectRegistry()
        startConversation(emit, 'run-1')
        const store = new ActionRunBindingStore('run-1')
        store.followConversationSuccessor('review', context)

        emit({ ...eventBase, runId: 'run-1', status: 'completed', type: 'run' })
        emit({ ...eventBase, runId: 'run-2', status: 'running', type: 'run' })
        expect(store.getSnapshot()).toBe('run-1')

        emit({ ...eventBase, runId: 'run-2', status: 'running', type: 'update', update: { continued: true, conversation, kind: 'agentStarted' } })
        expect(store.getSnapshot()).toBe('run-2')
        store.dispose()
    })

    it('stays on its run while that run is active or when another conversation starts', () => {
        const emit = connectRegistry()
        startConversation(emit, 'run-1')
        const store = new ActionRunBindingStore('run-1')
        store.followConversationSuccessor('review', context)

        startConversation(emit, 'run-2', { ...conversation, id: 'conversation-2' })
        expect(store.getSnapshot()).toBe('run-1')

        emit({ ...eventBase, runId: 'run-1', status: 'completed', type: 'run' })
        startConversation(emit, 'run-3', { ...conversation, id: 'conversation-3' })
        expect(store.getSnapshot()).toBe('run-1')
        store.dispose()
    })
})
