import type { ActiveActionRun } from '../../services/actions/action_run_registry'
import type { CardAgentState } from '../../services/agents/card_agent_state'

export type AgentFabState = CardAgentState | 'queued'

/** Resolves live and persisted agent state with shared FAB priority. */
export function resolveAgentFabState(
    activeRuns: Pick<ActiveActionRun, 'status'>[],
    persistedState: CardAgentState,
): AgentFabState {
    if (activeRuns.some(({ status }) => status === 'waitingForInput') || persistedState === 'waiting for input') {
        return 'waiting for input'
    }
    if (activeRuns.some(({ status }) => status === 'running') || persistedState === 'running') return 'running'
    if (activeRuns.some(({ status }) => status === 'queued')) return 'queued'
    if (persistedState === 'unseen result') return 'unseen result'

    return 'idle'
}
