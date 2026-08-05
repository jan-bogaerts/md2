interface ActionScheduleSnapshot {
    message: string | null
    open: boolean
    timestamp: string
}

type Listener = () => void

const INITIAL_SNAPSHOT: ActionScheduleSnapshot = { message: null, open: false, timestamp: '' }

/** Owns schedule form state at schedule-section boundary. */
export class ActionScheduleStore {
    private readonly listeners = new Set<Listener>()
    private snapshot = INITIAL_SNAPSHOT

    readonly getSnapshot = () => this.snapshot

    readonly subscribe = (listener: Listener) => {
        this.listeners.add(listener)

        return () => this.listeners.delete(listener)
    }

    toggle() {
        this.publish({ ...this.snapshot, message: null, open: !this.snapshot.open })
    }

    setTimestamp(timestamp: string) {
        this.publish({ ...this.snapshot, message: null, timestamp })
    }

    setMessage(message: string | null) {
        this.publish({ ...this.snapshot, message })
    }

    private publish(snapshot: ActionScheduleSnapshot) {
        this.snapshot = snapshot
        for (const listener of this.listeners) listener()
    }
}
