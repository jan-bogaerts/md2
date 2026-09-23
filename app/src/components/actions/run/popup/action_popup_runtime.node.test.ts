import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionRunEvent } from '../../../../data/action_run_types'
import type { ActionDefinition } from '../../../../data/action_types'
import type { AgentConversation } from '../../../../data/data_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../../data/electron_action_bridge'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { dataService } from '../../../../services/data/data_service'
import { createActionPopupBindings } from './action_popup_runtime'

const action = { id: 'build', label: 'Build', type: 'agent' } as ActionDefinition
const context: ActionContext = {
    cardInternalId: 'card-1',
    file: 'design/F-1.md',
    kind: 'card',
    title: 'Feature one',
}

function startRegistry() {
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
        if (!listener) throw new Error('Missing action run listener')
        listener(event)
    }
}

function conversation(path: string): AgentConversation {
    return {
        actionId: action.id,
        cardInternalId: 'card-1',
        cardPath: 'design/F-1.md',
        completedAt: '2026-01-01T00:01:00.000Z',
        entries: [],
        hasExplicitTitle: true,
        id: path,
        path,
        providerSessions: [],
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'completed',
        title: 'Build',
        viewed: false,
    }
}

function mockConversations(conversations: AgentConversation[]) {
    vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue(conversations)
    vi.spyOn(dataService, 'loadAgentConversation').mockImplementation(async (path) => {
        const loadedConversation = conversations.find((current) => current.path === path)
        if (!loadedConversation) throw new Error(`Missing conversation ${path}`)

        return loadedConversation
    })
}

function runEvent(runId: string): ActionRunEvent {
    return { actionId: action.id, context, phase: 'main', rootActionId: action.id, runId, status: 'running', type: 'run' }
}

afterEach(() => {
    actionRunRegistry.stop()
    setActionBridgeOverride(null)
    vi.restoreAllMocks()
})

describe('createActionPopupBindings', () => {
    it('binds the requested run when a newer run shares the action and card', () => {
        const emit = startRegistry()
        emit(runEvent('run-1'))
        emit(runEvent('run-2'))

        const bindings = createActionPopupBindings(action, context, 'run-1')

        expect(actionRunRegistry.getActionRunStore(action.id, context)?.getSnapshot().runId).toBe('run-2')
        expect(bindings.bindingStore.getSnapshot()).toBe('run-1')
        bindings.bindingStore.dispose()
    })

    it('keeps latest-run selection for ordinary popup opening', () => {
        const emit = startRegistry()
        emit(runEvent('run-1'))
        emit(runEvent('run-2'))

        const bindings = createActionPopupBindings(action, context)

        expect(bindings.bindingStore.getSnapshot()).toBe('run-2')
        bindings.bindingStore.dispose()
    })

    it('keeps a persisted conversation detached from a current run', () => {
        const emit = startRegistry()
        emit(runEvent('run-1'))

        const bindings = createActionPopupBindings(action, context, undefined, 'activity.json#conversation=history')

        expect(bindings.bindingStore.getSnapshot()).toBeNull()
        emit(runEvent('run-2'))
        expect(bindings.bindingStore.getSnapshot()).toBeNull()
        bindings.bindingStore.dispose()
    })

    it('selects the unseen conversation configured after ordinary popup opening', async () => {
        const unseenConversation = conversation('activity.json#conversation=unseen')
        mockConversations([unseenConversation])
        const bindings = createActionPopupBindings(action, context)

        bindings.conversationStore.configureInitialSelection(unseenConversation.path)
        await bindings.conversationStore.load()

        expect(bindings.conversationStore.getSnapshot().selectedConversation).toBe(unseenConversation)
        bindings.bindingStore.dispose()
    })

    it('keeps the requested conversation over a later configured unseen conversation', async () => {
        const requestedConversation = conversation('activity.json#conversation=requested')
        const unseenConversation = conversation('activity.json#conversation=unseen')
        mockConversations([unseenConversation, requestedConversation])
        const bindings = createActionPopupBindings(action, context, undefined, requestedConversation.path)

        bindings.conversationStore.configureInitialSelection(unseenConversation.path)
        await bindings.conversationStore.load()

        expect(bindings.conversationStore.getSnapshot().selectedConversation).toBe(requestedConversation)
        bindings.bindingStore.dispose()
    })
})
