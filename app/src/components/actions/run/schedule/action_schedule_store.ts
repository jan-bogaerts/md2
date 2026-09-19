export type ActionScheduleTriggerType = 'account-reset' | 'at' | 'card-state'

interface ActionScheduleSnapshotBase {
    message: string | null
    open: boolean
    triggerType: ActionScheduleTriggerType
}

export interface AtActionScheduleSnapshot extends ActionScheduleSnapshotBase {
    timestamp: string
    triggerType: 'at'
}

export interface AccountResetActionScheduleSnapshot extends ActionScheduleSnapshotBase {
    agent: string
    limitId: string
    triggerType: 'account-reset'
    windowId: string
}

export interface CardStateActionScheduleSnapshot extends ActionScheduleSnapshotBase {
    cardInternalId: string
    targetState: string
    triggerType: 'card-state'
}

export type ActionScheduleSnapshot =
    | AccountResetActionScheduleSnapshot
    | AtActionScheduleSnapshot
    | CardStateActionScheduleSnapshot

interface AccountResetDraft {
    agent: string
    limitId: string
    windowId: string
}

interface CardStateDraft {
    cardInternalId: string
    targetState: string
}

const INITIAL_SNAPSHOT: AtActionScheduleSnapshot = {
    message: null,
    open: false,
    timestamp: '',
    triggerType: 'at',
}

/** Owns trigger-specific schedule form state at schedule-section boundary. */
export class ActionScheduleStore extends EventTarget {
    private readonly accountResetDraft: AccountResetDraft = { agent: '', limitId: '', windowId: '' }
    private readonly cardStateDraft: CardStateDraft = { cardInternalId: '', targetState: '' }
    private snapshot: ActionScheduleSnapshot = INITIAL_SNAPSHOT
    private timestamp = ''

    readonly getSnapshot = () => this.snapshot

    readonly subscribe = (listener: () => void) => {
        this.addEventListener('changed', listener)

        return () => this.removeEventListener('changed', listener)
    }

    toggle() {
        this.publish({ ...this.snapshot, message: null, open: !this.snapshot.open })
    }

    setTriggerType(triggerType: ActionScheduleTriggerType) {
        if (triggerType === this.snapshot.triggerType) return

        const common = { message: null, open: this.snapshot.open }
        if (triggerType === 'at') {
            this.publish({ ...common, timestamp: this.timestamp, triggerType })
            return
        }
        if (triggerType === 'account-reset') {
            this.publish({ ...common, ...this.accountResetDraft, triggerType })
            return
        }

        this.publish({ ...common, ...this.cardStateDraft, triggerType })
    }

    setTimestamp(timestamp: string) {
        this.timestamp = timestamp
        if (this.snapshot.triggerType === 'at') this.publish({ ...this.snapshot, message: null, timestamp })
    }

    setAgent(agent: string) {
        this.accountResetDraft.agent = agent
        this.accountResetDraft.limitId = ''
        this.accountResetDraft.windowId = ''
        if (this.snapshot.triggerType === 'account-reset') {
            this.publish({ ...this.snapshot, ...this.accountResetDraft, message: null })
        }
    }

    setAccountTracker(limitId: string, windowId: string) {
        this.accountResetDraft.limitId = limitId
        this.accountResetDraft.windowId = windowId
        if (this.snapshot.triggerType === 'account-reset') {
            this.publish({ ...this.snapshot, ...this.accountResetDraft, message: null })
        }
    }

    setCardInternalId(cardInternalId: string) {
        this.cardStateDraft.cardInternalId = cardInternalId
        if (this.snapshot.triggerType === 'card-state') {
            this.publish({ ...this.snapshot, cardInternalId, message: null })
        }
    }

    setTargetState(targetState: string) {
        this.cardStateDraft.targetState = targetState
        if (this.snapshot.triggerType === 'card-state') {
            this.publish({ ...this.snapshot, message: null, targetState })
        }
    }

    setMessage(message: string | null) {
        this.publish({ ...this.snapshot, message })
    }

    private publish(snapshot: ActionScheduleSnapshot) {
        this.snapshot = snapshot
        this.dispatchEvent(new Event('changed'))
    }
}
