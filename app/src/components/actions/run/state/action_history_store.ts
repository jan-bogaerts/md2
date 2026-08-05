import type { ActionContext } from '../../../data/action_context'
import type { ActionDefinition } from '../../../data/action_types'
import type { ActionRunHistoryEntry } from '../../../data/electron_action_bridge'
import { defaultLoadHistory } from './action_popup_defaults'

interface ActionHistorySnapshot {
    entries: ActionRunHistoryEntry[]
    error: string | null
}

type Listener = () => void

const INITIAL_SNAPSHOT: ActionHistorySnapshot = { entries: [], error: null }

/** Owns run-history loading for history-rendering leaves. */
export class ActionHistoryStore {
    private readonly action: ActionDefinition
    private readonly context: ActionContext
    private readonly listeners = new Set<Listener>()
    private request = 0
    private snapshot = INITIAL_SNAPSHOT

    constructor(action: ActionDefinition, context: ActionContext) {
        this.action = action
        this.context = context
    }

    readonly getSnapshot = () => this.snapshot

    readonly subscribe = (listener: Listener) => {
        this.listeners.add(listener)

        return () => this.listeners.delete(listener)
    }

    async load() {
        const request = this.request + 1
        this.request = request
        this.publish({ ...this.snapshot, error: null })
        try {
            const entries = await defaultLoadHistory(this.action, this.context)
            if (request === this.request) this.publish({ entries, error: null })
        } catch (error) {
            if (request !== this.request) return

            const message = error instanceof Error ? error.message : 'Could not load run history'
            this.publish({ ...this.snapshot, error: message })
        }
    }

    private publish(snapshot: ActionHistorySnapshot) {
        this.snapshot = snapshot
        for (const listener of this.listeners) listener()
    }
}
