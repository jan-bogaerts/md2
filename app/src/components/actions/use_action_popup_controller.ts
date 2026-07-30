import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { actionContextIdentity } from '../../data/action_context'
import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import { hasExecutionBackend, type ActionRunHistoryEntry } from '../../data/electron_action_bridge'
import {
    defaultModelForProfile,
    findAgentProfile,
    mergeAgentProfiles,
    type ThinkingLevel,
    validateThinkingLevel,
} from '../../data/agent_profiles'
import type { ActionExecutionStatus, ActionRunResult } from '../../data/action_run_types'
import type { AgentConversation } from '../../data/data_types'
import { actionExecutionService, type LiveAgentTurn } from '../../services/actions/action_execution_service'
import { dialogService } from '../../services/dialog_service'
import { useActionExecution } from '../hooks/use_action_executions'
import { useConfigValueOrFallback } from '../hooks/use_config_value'
import { useAgentCapabilities } from '../hooks/use_agent_capabilities'
import {
    defaultCancelAction,
    defaultAnswerQuestion,
    defaultConvertPromptToAction,
    defaultLoadConversation,
    defaultLoadConversations,
    defaultLoadHistory,
    defaultPreparePrompt,
    defaultFinishAction,
    defaultRunAction,
    defaultSendMessage,
    defaultScheduleAction,
    type CancelAction,
    type AnswerQuestion,
    type ConvertPromptToAction,
    type LoadConversation,
    type LoadConversations,
    type LoadHistory,
    type FinishAction,
    type PopupRunStatus,
    type PreparePrompt,
    type RunAction,
    type SendMessage,
    type ScheduleAction,
} from './action_popup_defaults'
import { createScheduleTrigger } from './action_schedule_trigger'

const DEFAULT_CONVERT_LABEL_LENGTH = 40
type PromptPreparationStatus = 'failed' | 'loading' | 'ready'

interface ActionPopupControllerInput {
    action: ActionDefinition
    answerQuestion?: AnswerQuestion
    cancelAction?: CancelAction
    continueFrom?: string
    context: ActionContext
    convertPromptToAction?: ConvertPromptToAction
    enableConversations?: boolean
    executionValidationError?: string | null
    finishAction?: FinishAction
    initialPrompt?: string
    loadConversation?: LoadConversation
    loadConversations?: LoadConversations
    loadHistory?: LoadHistory
    preparePrompt?: PreparePrompt
    runAction?: RunAction
    sendMessage?: SendMessage
    scheduleContext?: ActionContext
    scheduleAction?: ScheduleAction
}

function belongsToContext(conversation: AgentConversation, context: ActionContext) {
    return context.kind === 'project'
        ? conversation.cardInternalId === null
        : conversation.cardInternalId === context.cardInternalId
}

function belongsToAction(conversation: AgentConversation, actionId: string, context: ActionContext) {
    return belongsToContext(conversation, context) && conversation.actionId === actionId
}

function conversationTimestamp(conversation: AgentConversation) {
    const timestamp = Date.parse(conversation.startedAt)

    return Number.isNaN(timestamp) ? 0 : timestamp
}

function conversationContextKey(actionId: string, context: ActionContext) {
    return `${actionId}\u0000${actionContextIdentity(context)}`
}

function latestWaitingConversation(conversations: AgentConversation[], actionId: string, context: ActionContext) {
    return conversations
        .filter((conversation) => belongsToAction(conversation, actionId, context) && conversation.status === 'waitingForInput')
        .sort((left, right) => conversationTimestamp(right) - conversationTimestamp(left))[0] ?? null
}

function liveAgentConversation(
    turn: LiveAgentTurn,
    actionId: string,
    context: ActionContext,
    status: ActionExecutionStatus,
    base: AgentConversation | null,
): AgentConversation {
    const liveMessageIds = new Set(turn.messages.map(({ id }) => id))
    const liveActivityIds = new Set(turn.activities.map(({ providerItemId, id }) => providerItemId ?? id))
    const priorMessages = (base?.messages ?? []).filter(({ id }) => !liveMessageIds.has(id))
    const priorEvents = (base?.events ?? []).filter(({ providerItemId, id }) => !liveActivityIds.has(providerItemId ?? id))
    const messages = [...priorMessages, ...turn.messages]
    const conversationStatus = status === 'queued' || status === 'running' || status === 'waitingForInput'
        ? status === 'queued' ? 'running' : status
        : status === 'cancelled'
            ? 'cancelled'
            : status === 'failed'
                ? 'failed'
                : 'completed'

    return {
        actionId,
        cardInternalId: context.cardInternalId ?? null,
        cardPath: context.file ?? null,
        completedAt: null,
        events: [...priorEvents, ...turn.activities],
        hasExplicitTitle: base?.hasExplicitTitle ?? true,
        id: turn.conversationId,
        messages,
        path: turn.reference,
        providerSessions: base?.providerSessions ?? [],
        startedAt: base?.startedAt ?? turn.startedAt,
        status: conversationStatus,
        title: base?.title ?? turn.title,
        ...(base?.usage ? { usage: base.usage } : {}),
    }
}

export function mergeConversationHistory(
    conversations: AgentConversation[],
    actionId: string,
    context: ActionContext,
    liveConversation: AgentConversation | null,
) {
    const byId = new Map<string, AgentConversation>()
    for (const conversation of conversations) {
        if (belongsToAction(conversation, actionId, context)) byId.set(conversation.id, conversation)
    }
    if (liveConversation && belongsToAction(liveConversation, actionId, context)) byId.set(liveConversation.id, liveConversation)

    return [...byId.values()].sort((left, right) => conversationTimestamp(right) - conversationTimestamp(left))
}

/** Own action popup state, injected services, and UI callbacks. */
export function useActionPopupController(input: ActionPopupControllerInput) {
    const { action, context } = input
    const configuredAgent = useConfigValueOrFallback('desktop.agent', '')
    const configuredAgentProfiles = useConfigValueOrFallback('desktop.agentProfiles', [])
    const configuredModel = useConfigValueOrFallback('desktop.model', '')
    const configuredThinkingLevel = useConfigValueOrFallback('desktop.thinkingLevel', 'none')
    const capabilities = useAgentCapabilities()
    const sharedExecution = useActionExecution(action.id, context)
    const convertPromptToAction = input.convertPromptToAction ?? defaultConvertPromptToAction
    const cancelAction = input.cancelAction ?? defaultCancelAction
    const answerQuestion = input.answerQuestion ?? defaultAnswerQuestion
    const finishAction = input.finishAction ?? defaultFinishAction
    const loadHistory = input.loadHistory ?? defaultLoadHistory
    const loadConversation = input.loadConversation ?? defaultLoadConversation
    const loadConversations = input.loadConversations ?? defaultLoadConversations
    const preparePrompt = input.preparePrompt ?? defaultPreparePrompt
    const runAction = input.runAction ?? defaultRunAction
    const sendMessage = input.sendMessage ?? defaultSendMessage
    const scheduleAction = input.scheduleAction ?? defaultScheduleAction
    const promptContextKey = conversationContextKey(action.id, context)
    const sharedExecutionActive = sharedExecution?.status === 'queued'
        || sharedExecution?.status === 'running'
        || sharedExecution?.status === 'waitingForInput'
    const interactionKey = sharedExecutionActive && sharedExecution.activeActionId
        ? `${sharedExecution.executionId}\u0000${sharedExecution.activeActionId}`
        : promptContextKey
    const sharedPromptDraft = actionExecutionService.getPromptDraft(action.id, context)
    const initialPrompt = sharedPromptDraft || input.initialPrompt || ''
    const promptKey = `${interactionKey}\u0000${input.continueFrom ?? ''}\u0000${input.initialPrompt ?? ''}`
    const agentProfiles = mergeAgentProfiles(configuredAgentProfiles)
    const defaultAgent = action.agent ?? configuredAgent
    const defaultAgentProfile = findAgentProfile(agentProfiles, defaultAgent)
    const defaultModel = (action.model ?? configuredModel) || (defaultAgentProfile ? defaultModelForProfile(defaultAgentProfile) : '')
    const definitionThinkingLevel = validateThinkingLevel(action.thinkingLevel ?? configuredThinkingLevel, `action "${action.label}"`)
    const [actionLabel, setActionLabel] = useState('')
    const [agentOverride, setAgentOverride] = useState<string | null>(null)
    const [convertMessage, setConvertMessage] = useState<string | null>(null)
    const [conversationHistoryState, setConversationHistoryState] = useState<{ conversations: AgentConversation[], key: string }>({ conversations: [], key: '' })
    const [promptState, setPromptState] = useState<{ key: string, status: PromptPreparationStatus, value: string }>({
        key: promptKey,
        status: action.type === 'agent' && !input.continueFrom ? 'loading' : 'ready',
        value: initialPrompt,
    })
    // Bumped whenever the prompt is replaced externally (prepared, phrase, cleared) but
    // never while typing, so an uncontrolled markdown editor can reseed only on real resets.
    const [promptResetToken, setPromptResetToken] = useState(0)
    const [localExecutionId, setLocalExecutionId] = useState<string | null>(null)
    const [history, setHistory] = useState<ActionRunHistoryEntry[]>([])
    const [historyError, setHistoryError] = useState<string | null>(null)
    const [modelOverride, setModelOverride] = useState<string | null>(null)
    const [localRunResult, setLocalRunResult] = useState<ActionRunResult | null>(null)
    const [localRunStatus, setLocalRunStatus] = useState<PopupRunStatus>('idle')
    const [scheduleMessage, setScheduleMessage] = useState<string | null>(null)
    const [scheduleOpen, setScheduleOpen] = useState(false)
    const [scheduleTimestamp, setScheduleTimestamp] = useState('')
    const [liveActionKey, setLiveActionKey] = useState<string | null>(null)
    const [selectedConversationState, setSelectedConversationState] = useState<{ conversation: AgentConversation | null, key: string }>({ conversation: null, key: '' })
    const [thinkingLevelOverride, setThinkingLevelOverride] = useState<{ actionId: string, value: ThinkingLevel } | null>(null)
    const actionRef = useRef(action)
    const contextRef = useRef(context)
    const selectionRequestRef = useRef(0)
    const promptEditRevisionRef = useRef(0)
    const promptRequestRef = useRef(0)
    const agent = agentOverride ?? defaultAgent
    const model = modelOverride ?? defaultModel
    const selectedAgentProfile = findAgentProfile(agentProfiles, agent)
    const selectedAgentModels = selectedAgentProfile?.models ?? []
    const selectedAvailability = capabilities.availability.values[agent]
    const agentAvailability = input.runAction
        ? Object.fromEntries(agentProfiles.map((profile) => [profile.name, { available: true, error: null }]))
        : capabilities.availability.values
    const selectedAgentAvailable = !!input.runAction
        || action.type !== 'agent'
        || (!!selectedAvailability?.available && !capabilities.availability.error)
    const backendAvailable = !!input.runAction || hasExecutionBackend()
    const executionDisabledMessage = !backendAvailable
        ? 'Action execution requires the Electron desktop app'
        : action.type === 'agent' && capabilities.availability.loading
            ? 'Checking agent executable availability'
            : action.type === 'agent' && !selectedAgentAvailable
                ? selectedAvailability?.error ?? capabilities.availability.error ?? `Agent executable is unavailable for ${agent}`
                : null
    const thinkingLevel = thinkingLevelOverride?.actionId === action.id ? thinkingLevelOverride.value : definitionThinkingLevel
    const conversationKey = promptContextKey
    const activePromptState: { key: string, status: PromptPreparationStatus, value: string } = promptState.key === promptKey
        ? promptState
        : {
            key: promptKey,
            status: action.type === 'agent' && !input.continueFrom && !sharedExecutionActive ? 'loading' : 'ready',
            value: sharedPromptDraft || input.initialPrompt || '',
        }
    const prompt = activePromptState.value
    const promptPreparationPending = activePromptState.status === 'loading'
    const promptPreparationFailed = activePromptState.status === 'failed'
    const selectionKey = `${conversationKey}\u0000${input.continueFrom ?? ''}`
    const conversationHistory = conversationHistoryState.key === conversationKey ? conversationHistoryState.conversations : []
    const conversationHistoryLoading = !!input.enableConversations && conversationHistoryState.key !== conversationKey
    const selectedConversation = selectedConversationState.key === selectionKey ? selectedConversationState.conversation : null
    const selectedHistory = selectedConversation ? [...conversationHistory, selectedConversation] : conversationHistory
    const executionId = sharedExecution?.executionId ?? localExecutionId
    const runStatus = sharedExecution?.status ?? localRunStatus
    const runLogs = sharedExecution?.logs ?? localRunResult?.logs ?? []
    const sessionActive = runStatus === 'queued' || runStatus === 'running' || runStatus === 'waitingForInput'
    const agentActive = sessionActive && sharedExecution?.activeActionType === 'agent'
    const streamingActive = agentActive && !!sharedExecution?.activeActionStreaming
    const interactionReady = agentActive && !!sharedExecution?.interactionReady
    const manualFinishAvailable = streamingActive && !sharedExecution?.activeActionAutoFinish
    const showLiveConversation = !input.enableConversations
        ? !!sharedExecution
        : liveActionKey === conversationKey || runStatus === 'queued' || runStatus === 'running' || runStatus === 'waitingForInput'
    const sharedAgentTurn = showLiveConversation ? sharedExecution?.agentTurn ?? null : null
    const baseLiveConversation = sharedAgentTurn
        ? selectedHistory.find(({ id }) => id === sharedAgentTurn.conversationId) ?? null
        : null
    const liveConversation = sharedAgentTurn
        ? sharedExecution?.status !== 'running'
            && sharedExecution?.status !== 'waitingForInput'
            && baseLiveConversation?.status !== 'running'
            && baseLiveConversation?.status !== 'waitingForInput'
            ? baseLiveConversation
            : liveAgentConversation(sharedAgentTurn, action.id, context, sharedExecution?.status ?? 'running', baseLiveConversation)
        : null
    const displayedConversation = liveConversation ?? selectedConversation
    const conversations = mergeConversationHistory(selectedHistory, action.id, context, liveConversation)
    const restoredWaitingConversation = !sharedExecutionActive && selectedConversation?.status === 'waitingForInput'
    const continuationReference = liveConversation?.path
        ?? selectedConversation?.path
        ?? input.continueFrom
        ?? null
    const isFollowUp = action.type === 'agent'
        && (streamingActive || (runStatus !== 'queued' && runStatus !== 'running' && runStatus !== 'waitingForInput' && !!continuationReference))

    useEffect(() => {
        actionRef.current = action
        contextRef.current = context
    }, [action, context])

    useEffect(() => {
        const handlePromptDraftCleared = (event: Event) => {
            const detail = (event as CustomEvent<{ actionId: string, executionId: string }>).detail
            if (detail.executionId !== sharedExecution?.executionId) return
            if (detail.actionId !== sharedExecution.activeActionId) return

            setPromptState({ key: promptKey, status: 'ready', value: '' })
            setPromptResetToken((token) => token + 1)
        }
        actionExecutionService.addEventListener('promptDraftCleared', handlePromptDraftCleared)

        return () => actionExecutionService.removeEventListener('promptDraftCleared', handlePromptDraftCleared)
    }, [promptKey, sharedExecution?.activeActionId, sharedExecution?.executionId])

    useEffect(() => {
        const requestId = promptRequestRef.current + 1
        promptRequestRef.current = requestId
        promptEditRevisionRef.current = 0
        if (action.type !== 'agent' || input.continueFrom || sharedExecutionActive || restoredWaitingConversation) return

        const editRevision = promptEditRevisionRef.current

        async function loadPreparedPrompt() {
            try {
                const preparedPrompt = await preparePrompt(actionRef.current, contextRef.current)
                if (promptRequestRef.current !== requestId || promptEditRevisionRef.current !== editRevision) return
                setPromptState({ key: promptKey, status: 'ready', value: preparedPrompt })
                void actionExecutionService.setPromptDraft(action.id, context, preparedPrompt)
                setPromptResetToken((token) => token + 1)
            } catch (error) {
                if (promptRequestRef.current !== requestId) return
                setPromptState({ key: promptKey, status: 'failed', value: '' })
                setPromptResetToken((token) => token + 1)
                dialogService.error(error, { fallbackMessage: 'Could not prepare action prompt' })
            }
        }

        void loadPreparedPrompt()
    }, [
        action.id,
        action.type,
        context,
        input.continueFrom,
        preparePrompt,
        promptKey,
        restoredWaitingConversation,
        sharedExecutionActive,
    ])

    const refreshConversationHistory = async () => {
        if (!input.enableConversations || action.type !== 'agent') return

        try {
            const loadedConversations = await loadConversations(context)
            setConversationHistoryState({ conversations: loadedConversations, key: conversationKey })
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not refresh agent conversations' })
        }
    }

    useEffect(() => {
        if (!input.enableConversations || action.type !== 'agent') return

        let isActive = true
        const requestId = selectionRequestRef.current + 1
        selectionRequestRef.current = requestId

        async function loadInitialConversations() {
            const activeContext = contextRef.current
            try {
                const loadedConversations = await loadConversations(activeContext)
                if (!isActive) return

                setConversationHistoryState({ conversations: loadedConversations, key: conversationKey })
                if (!input.continueFrom) {
                    const waitingConversation = sharedExecutionActive
                        ? null
                        : latestWaitingConversation(loadedConversations, action.id, activeContext)
                    setSelectedConversationState({ conversation: waitingConversation, key: selectionKey })
                    if (waitingConversation) {
                        promptRequestRef.current += 1
                        promptEditRevisionRef.current = 0
                        setPromptState({ key: promptKey, status: 'ready', value: '' })
                        actionExecutionService.clearPromptDraft(action.id, activeContext)
                        setPromptResetToken((token) => token + 1)
                    }
                    return
                }

                const conversation = await loadConversation(input.continueFrom)
                if (!isActive || selectionRequestRef.current !== requestId) return
                if (!belongsToContext(conversation, activeContext)) throw new Error('Selected agent conversation belongs to another context')
                if (conversation.actionId !== action.id) throw new Error('Selected agent conversation belongs to another action')
                setSelectedConversationState({ conversation, key: selectionKey })
            } catch (error) {
                if (isActive) {
                    setConversationHistoryState({ conversations: [], key: conversationKey })
                    setSelectedConversationState({ conversation: null, key: selectionKey })
                    dialogService.error(error, { fallbackMessage: 'Could not load agent conversations' })
                }
            }
        }

        void loadInitialConversations()

        return () => {
            isActive = false
        }
    }, [
        action.id,
        action.type,
        conversationKey,
        input.continueFrom,
        input.enableConversations,
        loadConversation,
        loadConversations,
        promptKey,
        selectionKey,
        sharedExecutionActive,
    ])

    useEffect(() => {
        let isActive = true

        async function loadRunHistory() {
            setHistoryError(null)
            try {
                const entries = await loadHistory(actionRef.current, contextRef.current)
                if (isActive) setHistory(entries)
            } catch (error) {
                if (isActive) setHistoryError(error instanceof Error ? error.message : 'Could not load run history')
            }
        }

        void loadRunHistory()

        return () => {
            isActive = false
        }
    }, [loadHistory, promptContextKey])

    const runWithPrompt = async (currentPrompt: string) => {
        setLocalRunStatus('running')
        setLocalRunResult(null)
        if (action.type === 'agent') setLiveActionKey(conversationKey)

        try {
            if (input.executionValidationError) throw new Error(input.executionValidationError)

            const runInput = action.type === 'agent'
                ? {
                    ...(agent ? { agent } : {}),
                    ...(isFollowUp && continuationReference ? { continueFrom: continuationReference } : {}),
                    prompt: currentPrompt,
                    ...(model ? { model } : {}),
                    thinkingLevel,
                }
                : { extraPrompt: currentPrompt }
            const handleStarted = (startedExecutionId: string) => {
                setLocalExecutionId(startedExecutionId)
                actionExecutionService.clearPromptDraft(action.id, context)
            }
            const result = await runAction(action, context, runInput, handleStarted)
            setLocalRunResult(result)
            setLocalRunStatus(result.status)
            setLocalExecutionId(null)
            if (action.type === 'agent') {
                setPromptState({ key: promptKey, status: 'ready', value: '' })
                actionExecutionService.clearPromptDraft(action.id, context)
                setPromptResetToken((token) => token + 1)
            }
            setHistory(await loadHistory(action, context))
            await refreshConversationHistory()
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Action run failed'
            setLocalRunResult({
                logs: [{ actionId: action.id, actionName: action.label, command: null, message, phase: 'main', status: 'failed', stderr: message, stdout: '' }],
                status: 'failed',
            })
            setLocalRunStatus('failed')
            dialogService.error(error, { fallbackMessage: 'Action run failed' })
        }
    }

    const handleRun = async (currentPrompt: string) => {
        if (agentActive && executionId) {
            if (sharedExecution?.question) return
            try {
                if (streamingActive) {
                    if (input.sendMessage) await sendMessage(executionId, currentPrompt)
                    else await actionExecutionService.sendPromptDraft(action.id, context)
                }
                else await actionExecutionService.setPromptDraft(action.id, context, currentPrompt)
                setPromptState({ key: promptKey, status: 'ready', value: '' })
                actionExecutionService.clearPromptDraft(action.id, context)
                setPromptResetToken((token) => token + 1)
            } catch (error) {
                dialogService.error(error, { fallbackMessage: 'Could not send agent message' })
            }
            return
        }
        await runWithPrompt(currentPrompt)
    }

    const handlePhraseSelect = (text: string) => {
        promptEditRevisionRef.current += 1
        setPromptState({ key: promptKey, status: 'ready', value: text })
        void actionExecutionService.setPromptDraft(action.id, context, text)
        setPromptResetToken((token) => token + 1)
        setConvertMessage(null)
    }

    const handlePhraseDoubleClick = async (text: string) => {
        handlePhraseSelect(text)
        if (agentActive && executionId) {
            try {
                await actionExecutionService.setPromptDraft(action.id, context, text)
                if (streamingActive) {
                    if (input.sendMessage) await sendMessage(executionId, text)
                    else await actionExecutionService.sendPromptDraft(action.id, context)
                }
                setPromptState({ key: promptKey, status: 'ready', value: '' })
                actionExecutionService.clearPromptDraft(action.id, context)
                setPromptResetToken((token) => token + 1)
            } catch (error) {
                dialogService.error(error, { fallbackMessage: 'Could not send agent message' })
            }
            return
        }
        await runWithPrompt(text)
    }

    const handleConversationChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const path = event.target.value
        const requestId = selectionRequestRef.current + 1
        selectionRequestRef.current = requestId

        try {
            const conversation = await loadConversation(path)
            if (selectionRequestRef.current !== requestId) return
            if (!belongsToContext(conversation, context)) throw new Error('Selected agent conversation belongs to another context')
            if (conversation.actionId !== action.id) throw new Error('Selected agent conversation belongs to another action')

            setSelectedConversationState({ conversation, key: selectionKey })
            setLiveActionKey(null)
        } catch (error) {
            if (selectionRequestRef.current === requestId) {
                dialogService.error(error, { fallbackMessage: 'Could not load agent conversation' })
            }
        }
    }

    const handleCancel = async () => {
        if (!executionId) return

        await cancelAction(executionId)
        setPromptState({ key: promptKey, status: 'ready', value: '' })
        actionExecutionService.clearPromptDraft(action.id, context)
    }

    const handleFinish = async () => {
        if (!executionId) return

        try {
            await finishAction(executionId)
            setPromptState({ key: promptKey, status: 'ready', value: '' })
            actionExecutionService.clearPromptDraft(action.id, context)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not finish agent session' })
        }
    }

    const handleAnswerQuestion = async (answers: Record<string, string[]>) => {
        if (!executionId || !sharedExecution?.question) return

        try {
            await answerQuestion(executionId, sharedExecution.question.requestId, answers)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not answer agent question' })
        }
    }

    const handleToggleSchedule = () => {
        setScheduleOpen((previous) => !previous)
        setScheduleMessage(null)
    }

    const handleScheduleTimestampChange = (event: ChangeEvent<HTMLInputElement>) => {
        setScheduleTimestamp(event.target.value)
        setScheduleMessage(null)
    }

    const handleScheduleAction = async () => {
        setScheduleMessage(null)

        try {
            const trigger = createScheduleTrigger(scheduleTimestamp)
            await scheduleAction(action, input.scheduleContext ?? context, trigger)
            setScheduleMessage('Schedule registered')
        } catch (error) {
            setScheduleMessage(error instanceof Error ? error.message : 'Could not register schedule')
        }
    }

    const handlePromptChange = (value: string) => {
        promptEditRevisionRef.current += 1
        setPromptState({ key: promptKey, status: 'ready', value })
        void actionExecutionService.setPromptDraft(action.id, context, value).catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: 'Could not queue agent prompt' })
        })
        setConvertMessage(null)
    }

    const handleAgentChange = (event: ChangeEvent<HTMLInputElement>) => {
        const nextAgent = event.target.value
        const profile = findAgentProfile(agentProfiles, nextAgent)
        setAgentOverride(nextAgent)
        setModelOverride(profile ? defaultModelForProfile(profile) : '')
        setThinkingLevelOverride({ actionId: action.id, value: 'none' })
    }

    const handleModelChange = (event: ChangeEvent<HTMLInputElement>) => {
        setModelOverride(event.target.value)
        setThinkingLevelOverride({ actionId: action.id, value: 'none' })
    }

    const handleThinkingLevelChange = (event: ChangeEvent<HTMLInputElement>) => {
        const value = validateThinkingLevel(event.target.value, 'action run input')
        setThinkingLevelOverride({ actionId: action.id, value })
    }

    const handleActionLabelChange = (event: ChangeEvent<HTMLInputElement>) => {
        setActionLabel(event.target.value)
        setConvertMessage(null)
    }

    const handleConvertToAction = async (currentPrompt: string) => {
        setConvertMessage(null)
        try {
            const label = actionLabel.trim().length > 0 ? actionLabel : currentPrompt.trim().slice(0, DEFAULT_CONVERT_LABEL_LENGTH)
            const convertInput = {
                ...(agent ? { agent } : {}),
                context,
                label,
                ...(model ? { model } : {}),
                prompt: currentPrompt,
            }
            const result = await convertPromptToAction(convertInput)
            setConvertMessage(`Saved ${result.path}`)

            return true
        } catch (error) {
            setConvertMessage(error instanceof Error ? error.message : 'Could not convert prompt to action')

            return false
        }
    }

    const handleSaveAndRun = async (currentPrompt: string) => {
        const saved = await handleConvertToAction(currentPrompt)
        if (!saved) return

        await handleRun(currentPrompt)
    }

    const saveDisabled = actionLabel.trim().length === 0
        || runStatus === 'queued'
        || runStatus === 'running'
        || runStatus === 'waitingForInput'
        || !!executionDisabledMessage
        || promptPreparationPending
        || promptPreparationFailed

    return {
        actionLabel,
        agentActive,
        agent,
        agentAvailability,
        agentProfiles,
        backendAvailable,
        convertMessage,
        conversationHistoryLoading,
        conversations,
        displayedConversation,
        prompt,
        promptPreparationFailed,
        promptPreparationPending,
        promptResetToken,
        executionDisabledMessage,
        executionValidationError: input.executionValidationError ?? null,
        handleActionLabelChange,
        handleAnswerQuestion,
        handleCancel,
        handleAgentChange,
        handleConvertToAction,
        handleConversationChange,
        handleFinish,
        handlePromptChange,
        handleModelChange,
        handlePhraseDoubleClick,
        handlePhraseSelect,
        handleRun,
        handleSaveAndRun,
        handleScheduleAction,
        handleScheduleTimestampChange,
        handleToggleSchedule,
        handleThinkingLevelChange,
        history,
        historyError,
        interactionReady,
        isFollowUp,
        model,
        manualFinishAvailable,
        runLogs,
        runStatus,
        streamingActive,
        structuredQuestion: sharedExecution?.question ?? null,
        saveDisabled,
        scheduleMessage,
        scheduleOpen,
        scheduleTimestamp,
        selectedAgentModels,
        selectedAgentAvailable,
        thinkingLevel,
    }
}

export type ActionPopupController = ReturnType<typeof useActionPopupController>
