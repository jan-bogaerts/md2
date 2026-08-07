interface ActionRunInputSnapshot {
    actionLabel: string
    convertMessage: string | null
}

type Listener = () => void

const INITIAL_SNAPSHOT: ActionRunInputSnapshot = {
    actionLabel: '',
    convertMessage: null,
}

/** Owns editable run options without subscribing popup roots. */
export class ActionRunInputStore {
    private readonly listeners = new Set<Listener>()
    private snapshot = INITIAL_SNAPSHOT

    readonly getSnapshot = () => this.snapshot

    readonly subscribe = (listener: Listener) => {
        this.listeners.add(listener)

        return () => this.listeners.delete(listener)
    }

    setActionLabel(actionLabel: string) {
        this.publish({ ...this.snapshot, actionLabel, convertMessage: null })
    }

    setConvertMessage(convertMessage: string | null) {
        this.publish({ ...this.snapshot, convertMessage })
    }

    private publish(snapshot: ActionRunInputSnapshot) {
        this.snapshot = snapshot
        for (const listener of this.listeners) listener()
    }
}
