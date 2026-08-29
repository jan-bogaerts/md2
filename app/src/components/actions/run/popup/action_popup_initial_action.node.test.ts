import { describe, expect, it } from 'vitest'
import type { ActionDefinition } from '../../../../data/action_types'
import type { ActiveActionRun } from '../../../../services/actions/action_run_registry'
import type { CardAgentState } from '../../../../services/agents/card_agent_state'
import { resolveInitialActionId, type PersistedActionStates } from './action_popup_initial_action'

function action(id: string): Pick<ActionDefinition, 'id'> {
    return { id }
}

function run(rootActionId: string, status: ActiveActionRun['status']): ActiveActionRun {
    return { context: { kind: 'project' }, rootActionId, runId: `${rootActionId}-${status}`, status }
}

function states(overrides: PersistedActionStates = {}): Record<string, CardAgentState> {
    return overrides
}

const actions = [action('first'), action('second'), action('third')]

describe('resolveInitialActionId', () => {
    it('honors explicit choice over higher automatic priority', () => {
        expect(resolveInitialActionId(actions, 'third', [run('second', 'running')], states())).toBe('third')
    })

    it.each(['queued', 'running'] as const)('selects first %s action in selector order', (status) => {
        const activeRuns = [run('third', status), run('second', status)]

        expect(resolveInitialActionId(actions, undefined, activeRuns, states())).toBe('second')
    })

    it('selects persisted running action without matching live run', () => {
        const persistedStates = states({ first: 'idle', second: 'running', third: 'idle' })

        expect(resolveInitialActionId(actions, undefined, [], persistedStates)).toBe('second')
    })

    it('uses selector order across waiting and unseen candidates', () => {
        const activeRuns = [run('third', 'waitingForInput')]
        const persistedStates = states({ first: 'idle', second: 'unseen result', third: 'idle' })

        expect(resolveInitialActionId(actions, undefined, activeRuns, persistedStates)).toBe('second')
    })

    it('lets matching live waiting state override persisted running state', () => {
        const activeRuns = [run('second', 'waitingForInput')]
        const persistedStates = states({ first: 'unseen result', second: 'running', third: 'idle' })

        expect(resolveInitialActionId(actions, undefined, activeRuns, persistedStates)).toBe('first')
    })

    it('falls back to first action when no action needs attention', () => {
        expect(resolveInitialActionId(actions, undefined, [], states())).toBe('first')
        expect(resolveInitialActionId([], undefined, [], states())).toBeNull()
    })
})
