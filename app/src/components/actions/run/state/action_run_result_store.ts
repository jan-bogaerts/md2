import type { ActionRunResult } from '../../../../data/action_run_types'
import type { PopupRunStatus } from '../popup/action_popup_defaults'

interface ActionRunResultSnapshot {
    result: ActionRunResult | null
    runId: string | null
    status: PopupRunStatus
}

type Listener = () => void

const INITIAL_SNAPSHOT: ActionRunResultSnapshot = { result: null, runId: null, status: 'idle' }

/** Owns transient start failures and injected-run results outside popup roots. */
export class ActionRunResultStore {
    private readonly listeners = new Set<Listener>()
    private snapshot = INITIAL_SNAPSHOT

    readonly getSnapshot = () => this.snapshot

    readonly subscribe = (listener: Listener) => {
        this.listeners.add(listener)

        return () => this.listeners.delete(listener)
    }

    setRunning() {
        this.publish({ result: null, runId: null, status: 'running' })
    }

    setRunId(runId: string) {
        this.publish({ ...this.snapshot, runId })
    }

    setResult(result: ActionRunResult) {
        this.publish({ result, runId: null, status: result.status })
    }

    private publish(snapshot: ActionRunResultSnapshot) {
        this.snapshot = snapshot
        for (const listener of this.listeners) listener()
    }
}
