import type { SequenceScheduleRegistrationRequest } from '../../../../data/electron_action_bridge'
import type { ScheduleTrigger } from '../../../../data/action_schedule_types'
import type { ActionScheduleTriggerSources } from '../schedule/action_schedule_trigger'
import { createScheduleTrigger } from '../schedule/action_schedule_trigger'
import type { ActionScheduleSnapshot, ActionScheduleTriggerType } from '../schedule/action_schedule_store'

export type CardSequenceTriggerType = ActionScheduleTriggerType | 'now'
export type CardSequenceSubmitStatus = 'idle' | 'submitting'

export interface CardSequenceDraftSnapshot {
    actionId: string
    agent: string
    canSubmit: boolean
    cardInternalId: string
    cardInternalIds: readonly string[]
    limitId: string
    open: boolean
    readyState: string
    selectedCardInternalId: string | null
    submitStatus: CardSequenceSubmitStatus
    targetState: string
    timestamp: string
    triggerType: CardSequenceTriggerType
    validationMessage: string | null
    windowId: string
}

interface CardSequenceValidationSources {
    actionIds: readonly string[]
    cardsAvailable: boolean
    readyStates: readonly string[]
    triggerSources: ActionScheduleTriggerSources
}

const EMPTY_TRIGGER_SOURCES: ActionScheduleTriggerSources = { accountTrackers: [], cards: [], targetStates: [] }
const EMPTY_SOURCES: CardSequenceValidationSources = {
    actionIds: [],
    cardsAvailable: true,
    readyStates: [],
    triggerSources: EMPTY_TRIGGER_SOURCES,
}

function initialSnapshot(): CardSequenceDraftSnapshot {
    return {
        actionId: '',
        agent: '',
        canSubmit: false,
        cardInternalId: '',
        cardInternalIds: [],
        limitId: '',
        open: false,
        readyState: '',
        selectedCardInternalId: null,
        submitStatus: 'idle',
        targetState: '',
        timestamp: '',
        triggerType: 'now',
        validationMessage: 'Add at least one card',
        windowId: '',
    }
}

function scheduleSnapshot(snapshot: CardSequenceDraftSnapshot): ActionScheduleSnapshot {
    const common = { message: null, open: snapshot.open }
    if (snapshot.triggerType === 'at') {
        return { ...common, timestamp: snapshot.timestamp, triggerType: 'at' }
    }
    if (snapshot.triggerType === 'account-reset') {
        return {
            ...common,
            agent: snapshot.agent,
            limitId: snapshot.limitId,
            triggerType: 'account-reset',
            windowId: snapshot.windowId,
        }
    }
    if (snapshot.triggerType === 'card-state') {
        return {
            ...common,
            cardInternalId: snapshot.cardInternalId,
            targetState: snapshot.targetState,
            triggerType: 'card-state',
        }
    }

    throw new Error('Now trigger has no action schedule snapshot')
}

function selectedTrigger(snapshot: CardSequenceDraftSnapshot, sources: CardSequenceValidationSources): ScheduleTrigger {
    if (snapshot.triggerType === 'now') return { type: 'now' }

    return createScheduleTrigger(scheduleSnapshot(snapshot), sources.triggerSources)
}

function validationMessage(snapshot: CardSequenceDraftSnapshot, sources: CardSequenceValidationSources): string | null {
    if (snapshot.cardInternalIds.length === 0) return 'Add at least one card'
    if (!sources.cardsAvailable) return 'Every sequence card must remain active'
    if (!snapshot.actionId || !sources.actionIds.includes(snapshot.actionId)) return 'Select an action available for every card'
    if (!snapshot.readyState || !sources.readyStates.includes(snapshot.readyState)) return 'Select a configured ready state'
    if (snapshot.triggerType === 'card-state' && snapshot.cardInternalIds.includes(snapshot.cardInternalId)) {
        return 'Trigger card cannot be part of the sequence'
    }
    try {
        selectedTrigger(snapshot, sources)
    } catch (error) {
        return error instanceof Error ? error.message : 'Complete the selected trigger'
    }

    return null
}

/** Owns one ordered card-sequence dialog draft and its derived validity. */
export class CardSequenceDraftService extends EventTarget {
    private snapshot = initialSnapshot()
    private sources = EMPTY_SOURCES

    readonly getSnapshot = () => this.snapshot

    readonly subscribe = (listener: () => void) => {
        this.addEventListener('changed', listener)

        return () => this.removeEventListener('changed', listener)
    }

    open() {
        this.sources = EMPTY_SOURCES
        this.publish({ ...initialSnapshot(), open: true })
    }

    close() {
        this.sources = EMPTY_SOURCES
        this.publish(initialSnapshot())
    }

    updateSources(sources: CardSequenceValidationSources) {
        this.sources = sources
        const actionId = sources.actionIds.includes(this.snapshot.actionId) ? this.snapshot.actionId : ''
        const readyState = sources.readyStates.includes(this.snapshot.readyState) ? this.snapshot.readyState : ''
        const nextSnapshot = { ...this.snapshot, actionId, readyState }
        const message = validationMessage(nextSnapshot, this.sources)
        const canSubmit = message === null && nextSnapshot.submitStatus === 'idle'
        if (
            actionId === this.snapshot.actionId
            && readyState === this.snapshot.readyState
            && message === this.snapshot.validationMessage
            && canSubmit === this.snapshot.canSubmit
        ) return

        this.publish({ ...nextSnapshot, canSubmit, validationMessage: message })
    }

    addCard(cardInternalId: string, beforeCardInternalId: string | null = null) {
        if (!cardInternalId) throw new Error('Cannot add a sequence card without an internal ID')
        if (this.snapshot.cardInternalIds.includes(cardInternalId)) return

        const beforeIndex = beforeCardInternalId === null
            ? -1
            : this.snapshot.cardInternalIds.indexOf(beforeCardInternalId)
        const cardInternalIds = [...this.snapshot.cardInternalIds]
        if (beforeIndex < 0) cardInternalIds.push(cardInternalId)
        else cardInternalIds.splice(beforeIndex, 0, cardInternalId)
        this.publishValidated({ ...this.snapshot, cardInternalIds, selectedCardInternalId: cardInternalId })
    }

    reorderCard(cardInternalId: string, beforeCardInternalId: string | null) {
        if (cardInternalId === beforeCardInternalId) return
        const sourceIndex = this.snapshot.cardInternalIds.indexOf(cardInternalId)
        if (sourceIndex < 0) throw new Error(`Sequence card is unavailable: ${cardInternalId}`)

        const cardInternalIds = this.snapshot.cardInternalIds.filter((id) => id !== cardInternalId)
        const targetIndex = beforeCardInternalId === null ? -1 : cardInternalIds.indexOf(beforeCardInternalId)
        if (targetIndex < 0) cardInternalIds.push(cardInternalId)
        else cardInternalIds.splice(targetIndex, 0, cardInternalId)
        this.publishValidated({ ...this.snapshot, cardInternalIds })
    }

    removeCard(cardInternalId: string) {
        if (!this.snapshot.cardInternalIds.includes(cardInternalId)) return
        const cardInternalIds = this.snapshot.cardInternalIds.filter((id) => id !== cardInternalId)
        const selectedCardInternalId = this.snapshot.selectedCardInternalId === cardInternalId
            ? null
            : this.snapshot.selectedCardInternalId
        this.publishValidated({ ...this.snapshot, cardInternalIds, selectedCardInternalId })
    }

    selectCard(cardInternalId: string | null) {
        if (cardInternalId !== null && !this.snapshot.cardInternalIds.includes(cardInternalId)) return
        this.publish({ ...this.snapshot, selectedCardInternalId: cardInternalId })
    }

    setActionId(actionId: string) {
        this.publishValidated({ ...this.snapshot, actionId })
    }

    setReadyState(readyState: string) {
        this.publishValidated({ ...this.snapshot, readyState })
    }

    setTriggerType(triggerType: CardSequenceTriggerType) {
        this.publishValidated({ ...this.snapshot, triggerType })
    }

    setTimestamp(timestamp: string) {
        this.publishValidated({ ...this.snapshot, timestamp })
    }

    setAgent(agent: string) {
        this.publishValidated({ ...this.snapshot, agent, limitId: '', windowId: '' })
    }

    setAccountTracker(limitId: string, windowId: string) {
        this.publishValidated({ ...this.snapshot, limitId, windowId })
    }

    setTriggerCard(cardInternalId: string) {
        this.publishValidated({ ...this.snapshot, cardInternalId })
    }

    setTargetState(targetState: string) {
        this.publishValidated({ ...this.snapshot, targetState })
    }

    setSubmitting(submitting: boolean) {
        this.publishValidated({ ...this.snapshot, submitStatus: submitting ? 'submitting' : 'idle' })
    }

    createRegistrationRequest(): SequenceScheduleRegistrationRequest {
        const message = validationMessage(this.snapshot, this.sources)
        if (message) throw new Error(message)

        return {
            actionId: this.snapshot.actionId,
            cardInternalIds: [...this.snapshot.cardInternalIds],
            readyState: this.snapshot.readyState,
            trigger: selectedTrigger(this.snapshot, this.sources),
        }
    }

    private publishValidated(snapshot: CardSequenceDraftSnapshot) {
        const message = validationMessage(snapshot, this.sources)
        this.publish({ ...snapshot, canSubmit: message === null && snapshot.submitStatus === 'idle', validationMessage: message })
    }

    private publish(snapshot: CardSequenceDraftSnapshot) {
        this.snapshot = snapshot
        this.dispatchEvent(new Event('changed'))
    }
}

export const cardSequenceDraftService = new CardSequenceDraftService()
