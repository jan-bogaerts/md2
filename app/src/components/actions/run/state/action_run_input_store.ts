import type { ActionForEachConfig } from '../../../../data/action_run_types'

interface ActionRunInputSnapshot {
    actionLabel: string
    convertMessage: string | null
    forEachByAction: Readonly<Record<string, ActionForEachConfig>>
}

type Listener = () => void

const INITIAL_SNAPSHOT: ActionRunInputSnapshot = {
    actionLabel: '',
    convertMessage: null,
    forEachByAction: {},
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

    setForEach(actionId: string, forEach: ActionForEachConfig | null) {
        const forEachByAction = { ...this.snapshot.forEachByAction }
        if (forEach) forEachByAction[actionId] = forEach
        else delete forEachByAction[actionId]
        this.publish({ ...this.snapshot, forEachByAction })
    }

    private publish(snapshot: ActionRunInputSnapshot) {
        this.snapshot = snapshot
        for (const listener of this.listeners) listener()
    }
}
