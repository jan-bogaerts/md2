import type { ThinkingLevel } from '../../data/agent_profiles'

interface ActionRunInputSnapshot {
    actionLabel: string
    agentOverride: string | null
    convertMessage: string | null
    modelOverride: string | null
    thinkingLevelOverride: ThinkingLevel | null
}

type Listener = () => void

const INITIAL_SNAPSHOT: ActionRunInputSnapshot = {
    actionLabel: '',
    agentOverride: null,
    convertMessage: null,
    modelOverride: null,
    thinkingLevelOverride: null,
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

    setAgent(agentOverride: string, modelOverride: string) {
        this.publish({ ...this.snapshot, agentOverride, modelOverride, thinkingLevelOverride: 'none' })
    }

    setModel(modelOverride: string) {
        this.publish({ ...this.snapshot, modelOverride, thinkingLevelOverride: 'none' })
    }

    setThinkingLevel(thinkingLevelOverride: ThinkingLevel) {
        this.publish({ ...this.snapshot, thinkingLevelOverride })
    }

    setConvertMessage(convertMessage: string | null) {
        this.publish({ ...this.snapshot, convertMessage })
    }

    private publish(snapshot: ActionRunInputSnapshot) {
        this.snapshot = snapshot
        for (const listener of this.listeners) listener()
    }
}
