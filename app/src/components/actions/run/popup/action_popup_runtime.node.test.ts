import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionRunEvent } from '../../../../data/action_run_types'
import type { ActionDefinition } from '../../../../data/action_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../../data/electron_action_bridge'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
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

function runEvent(runId: string): ActionRunEvent {
    return { actionId: action.id, context, phase: 'main', rootActionId: action.id, runId, status: 'running', type: 'run' }
}

afterEach(() => {
    actionRunRegistry.stop()
    setActionBridgeOverride(null)
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
})
