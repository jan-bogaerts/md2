import { dataService } from '../../../../services/data/data_service';
import { worktreeService } from '../../../../services/project/worktree_service';
import { isSequenceCardAssigned } from './card_sequence_eligibility';
import type { SequenceScheduleRegistrationRequest } from '../../../../data/electron_action_bridge'
import type { ActionDefinition } from '../../../../data/action_types';
import type { AgentProfile, AgentSelection, PermissionMode, SpeedMode, ThinkingLevel } from '../../../../data/agent_profiles';
import { validateAgentSelection, validateThinkingLevel } from '../../../../data/agent_profiles';
import { projectAgentSelection, resolveAgentSelectionState, resolveAgentSettings, selectAgent, selectModel, selectPermissionMode, selectSpeedMode, selectThinkingLevel, type AgentSelectionState } from '../../../../data/agent_selection';
import type { ScheduleTrigger } from '../../../../data/action_schedule_types'
import type { ActionScheduleTriggerSources } from '../schedule/action_schedule_trigger'
import { createScheduleTrigger } from '../schedule/action_schedule_trigger'
import type { ActionScheduleSnapshot, ActionScheduleTriggerType } from '../schedule/action_schedule_store'

export type CardSequenceTriggerType = ActionScheduleTriggerType | 'now'
export type CardSequenceSubmitStatus = 'idle' | 'submitting'

interface CardSequenceCardSource {
    assigned: boolean;
    cardInternalId: string;
    id: string;
    path: string;
    state: string | null;
    title: string;
}

export interface CardSequenceDraftSnapshot {
    cardSources: readonly CardSequenceCardSource[];
    actionId: string
    executionSelection: AgentSelectionState | null;
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
    worktreeBranch: string;
}

interface CardSequenceValidationSources {
    actionIds: readonly string[]
    actions?: readonly ActionDefinition[];
    agentProfiles?: AgentProfile[];
    desktopSelection?: AgentSelectionState;
    agentAvailability?: Record<string, { available: boolean; error?: string | null }>;
    availabilityError?: string | null;
    availabilityLoading?: boolean;
    modelIds?: readonly string[];
    modelLoading?: boolean;
    modelError?: string | null;
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
        cardSources: [],
        actionId: '',
        executionSelection: null,
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
        worktreeBranch: '',
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
    const cards = dataService.getState().snapshot?.activeCards ?? [];
    if (cards.some((card) => snapshot.cardInternalIds.includes(card.header.internalId!) && isSequenceCardAssigned(card))) return 'Sequence cards cannot have a worktree assignment';
    if (snapshot.worktreeBranch) {
        const record = worktreeService.getRecords().find(({ branch }) => branch === snapshot.worktreeBranch);
        if (!record || !worktreeService.isWorktreeAvailableForSequence(record)) return 'Selected worktree is already in use';
    }
    if (!sources.cardsAvailable) return 'Every sequence card must remain active'
    if (!snapshot.actionId || !sources.actionIds.includes(snapshot.actionId)) return 'Select an action available for every card'
    const action = sources.actions?.find(({ id }) => id === snapshot.actionId);
    if (action?.type === 'agent') {
        if (!snapshot.executionSelection) return 'Select sequence execution agent settings';
        const selection = projectAgentSelection(snapshot.executionSelection, sources.agentProfiles);
        try {
            validateAgentSelection(sources.agentProfiles ?? [], selection, 'sequence execution settings');
        } catch (error) {
            return error instanceof Error ? error.message : 'Invalid sequence execution settings';
        }
        if (sources.availabilityLoading) return 'Checking agent availability';
        if (sources.availabilityError) return sources.availabilityError;
        const availability = sources.agentAvailability?.[selection.agent];
        if (!availability?.available) return availability?.error ?? `Agent executable is unavailable for ${selection.agent}`;
        if (sources.modelLoading) return 'Loading agent models';
        if (sources.modelError) return sources.modelError;
        if (!selection.model || !sources.modelIds?.includes(selection.model)) return `Unsupported sequence model: ${selection.model || '(none)'}`;
    }
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

function initialExecutionSelection(action: ActionDefinition, sources: CardSequenceValidationSources): AgentSelectionState {
    const desktopSelection = sources.desktopSelection;
    if (!desktopSelection) throw new Error('Desktop agent selection is unavailable');
    const profiles = sources.agentProfiles ?? [];
    const agent = action.agent ?? desktopSelection.activeAgent;
    const settings = resolveAgentSettings(agent, profiles, [desktopSelection]);
    const definitionSelection: AgentSelectionState = {
        activeAgent: agent,
        permissionMode: action.permissionMode ?? desktopSelection.permissionMode,
        settingsByAgent: {
            ...desktopSelection.settingsByAgent,
            [agent]: {
                ...settings,
                model: action.model ?? settings.model,
                thinkingLevel: validateThinkingLevel(action.thinkingLevel ?? settings.thinkingLevel, 'sequence action'),
                speedMode: action.speedMode ?? settings.speedMode ?? 'default',
            },
        },
    };
    return resolveAgentSelectionState(definitionSelection, profiles, [desktopSelection]);
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

    /** Refresh only fields used by sequence choices and action applicability. */
    refreshCardSources() {
        if (!this.snapshot.open) return;
        const cards = dataService.getState().snapshot?.activeCards ?? [];
        const cardSources = cards.map((card) => ({
            assigned: isSequenceCardAssigned(card),
            cardInternalId: card.header.internalId ?? '',
            id: card.header.id,
            path: card.path,
            state: card.header.status,
            title: card.header.title,
        }));
        const previous = this.snapshot.cardSources;
        const unchanged = previous.length === cardSources.length && cardSources.every((source, index) => (
            source.assigned === previous[index].assigned && source.cardInternalId === previous[index].cardInternalId
            && source.id === previous[index].id && source.path === previous[index].path
            && source.state === previous[index].state && source.title === previous[index].title
        ));
        if (unchanged) return;
        this.publishValidated({ ...this.snapshot, cardSources });
    }

    updateSources(sources: CardSequenceValidationSources) {
        this.sources = sources
        const actionId = sources.actionIds.includes(this.snapshot.actionId) ? this.snapshot.actionId : ''
        const action = sources.actions?.find(({ id }) => id === actionId);
        const executionSelection = action?.type === 'agent'
            ? this.snapshot.executionSelection ?? (sources.desktopSelection ? initialExecutionSelection(action, sources) : null)
            : null;
        const readyState = sources.readyStates.includes(this.snapshot.readyState) ? this.snapshot.readyState : ''
        const nextSnapshot = { ...this.snapshot, actionId, executionSelection, readyState }
        const message = validationMessage(nextSnapshot, this.sources)
        const canSubmit = message === null && nextSnapshot.submitStatus === 'idle'
        if (
            actionId === this.snapshot.actionId
            && executionSelection === this.snapshot.executionSelection
            && readyState === this.snapshot.readyState
            && message === this.snapshot.validationMessage
            && canSubmit === this.snapshot.canSubmit
        ) return

        this.publish({ ...nextSnapshot, canSubmit, validationMessage: message })
    }

    addCard(cardInternalId: string, beforeCardInternalId: string | null = null) {
        if (!cardInternalId) throw new Error('Cannot add a sequence card without an internal ID')
        const card = dataService.getState().snapshot?.activeCards.find(({ header }) => header.internalId === cardInternalId);
        if (card && isSequenceCardAssigned(card)) {
            this.publish({ ...this.snapshot, validationMessage: 'Sequence cards cannot have a worktree assignment' });
            return;
        }
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

    setWorktreeBranch(worktreeBranch: string) {
        this.publishValidated({ ...this.snapshot, worktreeBranch });
    }

    setActionId(actionId: string) {
        const action = this.sources.actions?.find(({ id }) => id === actionId);
        const executionSelection = action?.type === 'agent' && this.sources.desktopSelection
            ? initialExecutionSelection(action, this.sources)
            : null;
        this.publishValidated({ ...this.snapshot, actionId, executionSelection })
    }

    setExecutionAgent(agent: string) {
        const selection = this.snapshot.executionSelection;
        if (!selection) return;
        const fallbackSources = this.sources.desktopSelection ? [this.sources.desktopSelection] : [];
        const executionSelection = selectAgent(selection, agent, this.sources.agentProfiles ?? [], fallbackSources);
        this.publishValidated({ ...this.snapshot, executionSelection });
    }

    setExecutionModel(model: string) {
        const selection = this.snapshot.executionSelection;
        if (selection) this.publishValidated({ ...this.snapshot, executionSelection: selectModel(selection, model) });
    }

    setExecutionThinkingLevel(thinkingLevel: ThinkingLevel) {
        const selection = this.snapshot.executionSelection;
        if (selection) this.publishValidated({ ...this.snapshot, executionSelection: selectThinkingLevel(selection, thinkingLevel) });
    }

    setExecutionPermissionMode(permissionMode: PermissionMode) {
        const selection = this.snapshot.executionSelection;
        if (selection) this.publishValidated({ ...this.snapshot, executionSelection: selectPermissionMode(selection, permissionMode) });
    }

    setExecutionSpeedMode(speedMode: SpeedMode) {
        const selection = this.snapshot.executionSelection;
        if (selection) this.publishValidated({ ...this.snapshot, executionSelection: selectSpeedMode(selection, speedMode) });
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

        const selection = this.snapshot.executionSelection
            ? projectAgentSelection(this.snapshot.executionSelection, this.sources.agentProfiles)
            : null;
        const agentSelection: AgentSelection | null = selection
            ? {
                agent: selection.agent, model: selection.model, thinkingLevel: selection.thinkingLevel,
                ...(selection.permissionMode ? { permissionMode: selection.permissionMode } : {}),
                ...(selection.speedMode !== undefined ? { speedMode: selection.speedMode } : {}),
            }
            : null;
        return {
            ...(agentSelection ? { agentSelection } : {}),
            ...(this.snapshot.worktreeBranch ? { worktreeBranch: this.snapshot.worktreeBranch } : {}),
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
