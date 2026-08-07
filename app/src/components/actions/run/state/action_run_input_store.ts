import type { ThinkingLevel } from '../../../../data/agent_profiles'

interface ActionRunInputSnapshot {
    accessLevelOverride: string | null
    actionLabel: string
    agentOverride: string | null
    approvalPolicyOverride: string | null
    convertMessage: string | null
    modelOverride: string | null
    settingsChangedWhileWaiting: boolean
    thinkingLevelOverride: ThinkingLevel | null
}

type Listener = () => void

const INITIAL_SNAPSHOT: ActionRunInputSnapshot = {
    accessLevelOverride: null,
    actionLabel: '',
    agentOverride: null,
    approvalPolicyOverride: null,
    convertMessage: null,
    modelOverride: null,
    settingsChangedWhileWaiting: false,
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

    setAgent(agentOverride: string, modelOverride: string, accessLevelOverride: string | null, approvalPolicyOverride: string | null) {
        this.publish({
            ...this.snapshot,
            accessLevelOverride,
            agentOverride,
            approvalPolicyOverride,
            modelOverride,
            thinkingLevelOverride: 'none',
        })
    }

    setModel(modelOverride: string) {
        this.publish({ ...this.snapshot, modelOverride, thinkingLevelOverride: 'none' })
    }

    setThinkingLevel(thinkingLevelOverride: ThinkingLevel) {
        this.publish({ ...this.snapshot, thinkingLevelOverride })
    }

    setAccessLevel(accessLevelOverride: string) {
        this.publish({ ...this.snapshot, accessLevelOverride })
    }

    setApprovalPolicy(approvalPolicyOverride: string) {
        this.publish({ ...this.snapshot, approvalPolicyOverride })
    }

    setConvertMessage(convertMessage: string | null) {
        this.publish({ ...this.snapshot, convertMessage })
    }

    recordSettingsChangeWhileWaiting() {
        if (this.snapshot.settingsChangedWhileWaiting) return

        this.publish({ ...this.snapshot, settingsChangedWhileWaiting: true })
    }

    markSettingsApplied() {
        if (!this.snapshot.settingsChangedWhileWaiting) return

        this.publish({ ...this.snapshot, settingsChangedWhileWaiting: false })
    }

    private publish(snapshot: ActionRunInputSnapshot) {
        this.snapshot = snapshot
        for (const listener of this.listeners) listener()
    }
}
