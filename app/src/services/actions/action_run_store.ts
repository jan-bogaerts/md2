import type { ActionRun } from './action_run_registry'

type StoreListener = () => void

/** Stable state owner for one action run. */
export class ActionRunStore {
    private readonly listeners = new Set<StoreListener>()
    private readonly onReleased: (store: ActionRunStore) => void
    private snapshot: ActionRun

    constructor(snapshot: ActionRun, onReleased: (store: ActionRunStore) => void) {
        this.onReleased = onReleased
        this.snapshot = snapshot
    }

    readonly getSnapshot = () => this.snapshot

    readonly subscribe = (listener: StoreListener) => {
        this.listeners.add(listener)

        return () => {
            this.listeners.delete(listener)
            this.onReleased(this)
        }
    }

    hasConsumers() {
        return this.listeners.size > 0
    }

    update(snapshot: ActionRun) {
        this.snapshot = snapshot
        for (const listener of this.listeners) listener()
    }
}
