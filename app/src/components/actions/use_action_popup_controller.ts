import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
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
import type { ActionRunResult } from '../../data/action_run_types'
import type { AgentConversation } from '../../data/data_types'
import { dialogService } from '../../services/dialog_service'
import { useActionExecution } from '../hooks/use_action_executions'
import { useConfigValueOrFallback } from '../hooks/use_config_value'
import { useAgentCapabilities } from '../hooks/use_agent_capabilities'
import {
    defaultCancelAction,
    defaultConvertPromptToAction,
    defaultLoadConversation,
    defaultLoadConversations,
    defaultLoadHistory,
    defaultRunAction,
    defaultScheduleAction,
    type CancelAction,
    type ConvertPromptToAction,
    type LoadConversation,
    type LoadConversations,
    type LoadHistory,
    type PopupRunStatus,
    type RunAction,
    type ScheduleAction,
} from './action_popup_defaults'
import { createScheduleTrigger, type ScheduleTriggerType } from './action_schedule_trigger'

const DEFAULT_CONVERT_LABEL_LENGTH = 40

interface ActionPopupControllerInput {
    action: ActionDefinition
    cancelAction?: CancelAction
    continueFrom?: string
    context: ActionContext
    convertPromptToAction?: ConvertPromptToAction
    enableConversations?: boolean
    initialPrompt?: string
    loadConversation?: LoadConversation
    loadConversations?: LoadConversations
    loadHistory?: LoadHistory
    runAction?: RunAction
    scheduleAction?: ScheduleAction
}

function belongsToContext(conversation: AgentConversation, context: ActionContext) {
    return context.kind === 'project' ? conversation.cardPath === null : conversation.cardPath === context.file
}

function conversationTimestamp(conversation: AgentConversation) {
    const timestamp = Date.parse(conversation.startedAt)

    return Number.isNaN(timestamp) ? 0 : timestamp
}

function conversationContextKey(actionId: string, context: ActionContext) {
    const contextValues = Object.entries(context)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value ?? ''}`)
        .join('\u0000')

    return `${actionId}\u0000${contextValues}`
}

export function mergeConversationHistory(
    conversations: AgentConversation[],
    context: ActionContext,
    liveConversation: AgentConversation | null,
) {
    const byId = new Map<string, AgentConversation>()
    for (const conversation of conversations) {
        if (belongsToContext(conversation, context)) byId.set(conversation.id, conversation)
    }
    if (liveConversation && belongsToContext(liveConversation, context)) byId.set(liveConversation.id, liveConversation)

    return [...byId.values()].sort((left, right) => conversationTimestamp(right) - conversationTimestamp(left))
}

/** Own action popup state, injected services, and UI callbacks. */
export function useActionPopupController(input: ActionPopupControllerInput) {
    const { action, context } = input
    const configuredAgent = useConfigValueOrFallback('desktop.agent', '')
    const configuredAgentProfiles = useConfigValueOrFallback('desktop.agentProfiles', [])
    const configuredModel = useConfigValueOrFallback('desktop.model', '')
    const capabilities = useAgentCapabilities()
    const convertPromptToAction = input.convertPromptToAction ?? defaultConvertPromptToAction
    const cancelAction = input.cancelAction ?? defaultCancelAction
    const loadHistory = input.loadHistory ?? defaultLoadHistory
    const loadConversation = input.loadConversation ?? defaultLoadConversation
    const loadConversations = input.loadConversations ?? defaultLoadConversations
    const runAction = input.runAction ?? defaultRunAction
    const scheduleAction = input.scheduleAction ?? defaultScheduleAction
    const agentProfiles = mergeAgentProfiles(configuredAgentProfiles)
    const defaultAgent = action.agent ?? configuredAgent
    const defaultAgentProfile = findAgentProfile(agentProfiles, defaultAgent)
    const defaultModel = (action.model ?? configuredModel) || (defaultAgentProfile ? defaultModelForProfile(defaultAgentProfile) : '')
    const definitionThinkingLevel = validateThinkingLevel(action.thinkingLevel ?? 'none', `action "${action.name}"`)
    const [actionLabel, setActionLabel] = useState('')
    const [agentOverride, setAgentOverride] = useState<string | null>(null)
    const [convertMessage, setConvertMessage] = useState<string | null>(null)
    const [conversationHistoryState, setConversationHistoryState] = useState<{ conversations: AgentConversation[], key: string }>({ conversations: [], key: '' })
    const [extraPrompt, setExtraPrompt] = useState(input.initialPrompt ?? '')
    const [localExecutionId, setLocalExecutionId] = useState<string | null>(null)
    const [history, setHistory] = useState<ActionRunHistoryEntry[]>([])
    const [historyError, setHistoryError] = useState<string | null>(null)
    const [modelOverride, setModelOverride] = useState<string | null>(null)
    const [localRunResult, setLocalRunResult] = useState<ActionRunResult | null>(null)
    const [localRunStatus, setLocalRunStatus] = useState<PopupRunStatus>('idle')
    const [scheduleAfterActionName, setScheduleAfterActionName] = useState('')
    const [scheduleMessage, setScheduleMessage] = useState<string | null>(null)
    const [scheduleOpen, setScheduleOpen] = useState(false)
    const [scheduleTimestamp, setScheduleTimestamp] = useState('')
    const [scheduleTriggerType, setScheduleTriggerType] = useState<ScheduleTriggerType>('at')
    const [liveActionKey, setLiveActionKey] = useState<string | null>(null)
    const [selectedConversationState, setSelectedConversationState] = useState<{ conversation: AgentConversation | null, key: string }>({ conversation: null, key: '' })
    const [thinkingLevelOverride, setThinkingLevelOverride] = useState<{ actionId: string, value: ThinkingLevel } | null>(null)
    const selectionRequestRef = useRef(0)
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
    const conversationKey = conversationContextKey(action.id, context)
    const selectionKey = `${conversationKey}\u0000${input.continueFrom ?? ''}`
    const conversationHistory = conversationHistoryState.key === conversationKey ? conversationHistoryState.conversations : []
    const conversationHistoryLoading = !!input.enableConversations && conversationHistoryState.key !== conversationKey
    const selectedConversation = selectedConversationState.key === selectionKey ? selectedConversationState.conversation : null
    const sharedExecution = useActionExecution(action.id, context)
    const executionId = sharedExecution?.executionId ?? localExecutionId
    const runStatus = sharedExecution?.status ?? localRunStatus
    const runLogs = sharedExecution?.logs ?? localRunResult?.logs ?? []
    const showLiveConversation = !input.enableConversations
        ? !!sharedExecution
        : liveActionKey === conversationKey || runStatus === 'running'
    const sharedConversation = showLiveConversation ? sharedExecution?.conversation ?? null : null
    const liveConversation = sharedConversation
        ? { ...sharedConversation, path: sharedExecution?.reference ?? sharedConversation.path }
        : null
    const displayedConversation = liveConversation ?? selectedConversation
    const selectedHistory = selectedConversation ? [...conversationHistory, selectedConversation] : conversationHistory
    const conversations = mergeConversationHistory(selectedHistory, context, liveConversation)
    const continuationReference = liveConversation?.path
        ?? selectedConversation?.path
        ?? input.continueFrom
        ?? null
    const isFollowUp = action.type === 'agent' && runStatus !== 'running' && !!continuationReference

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
            try {
                const loadedConversations = await loadConversations(context)
                if (!isActive) return

                setConversationHistoryState({ conversations: loadedConversations, key: conversationKey })
                if (!input.continueFrom) {
                    setSelectedConversationState({ conversation: null, key: selectionKey })
                    return
                }

                const conversation = await loadConversation(input.continueFrom)
                if (!isActive || selectionRequestRef.current !== requestId) return
                if (!belongsToContext(conversation, context)) throw new Error('Selected agent conversation belongs to another context')
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
        action.type,
        context,
        conversationKey,
        input.continueFrom,
        input.enableConversations,
        loadConversation,
        loadConversations,
        selectionKey,
    ])

    useEffect(() => {
        let isActive = true

        async function loadRunHistory() {
            setHistoryError(null)
            try {
                const entries = await loadHistory(action, context)
                if (isActive) setHistory(entries)
            } catch (error) {
                if (isActive) setHistoryError(error instanceof Error ? error.message : 'Could not load run history')
            }
        }

        void loadRunHistory()

        return () => {
            isActive = false
        }
    }, [action, context, loadHistory])

    const runWithExtraPrompt = async (prompt: string) => {
        setLocalRunStatus('running')
        setLocalRunResult(null)
        if (action.type === 'agent') setLiveActionKey(conversationKey)

        try {
            const runInput = action.type === 'agent'
                ? {
                    ...(agent ? { agent } : {}),
                    ...(isFollowUp && continuationReference ? { continueFrom: continuationReference } : {}),
                    extraPrompt: prompt,
                    ...(model ? { model } : {}),
                    thinkingLevel,
                }
                : { extraPrompt: prompt }
            const result = await runAction(action, context, runInput, setLocalExecutionId)
            setLocalRunResult(result)
            setLocalRunStatus(result.status)
            setLocalExecutionId(null)
            if (action.type === 'agent') setExtraPrompt('')
            setHistory(await loadHistory(action, context))
            await refreshConversationHistory()
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Action run failed'
            setLocalRunResult({
                logs: [{ actionName: action.name, command: null, message, phase: 'main', status: 'failed', stderr: message, stdout: '' }],
                status: 'failed',
            })
            setLocalRunStatus('failed')
        }
    }

    const handleRun = async () => {
        await runWithExtraPrompt(extraPrompt)
    }

    const handlePhraseSelect = (text: string) => {
        setExtraPrompt(text)
        setConvertMessage(null)
    }

    const handlePhraseDoubleClick = async (text: string) => {
        handlePhraseSelect(text)
        await runWithExtraPrompt(text)
    }

    const handleConversationChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const path = event.target.value
        const requestId = selectionRequestRef.current + 1
        selectionRequestRef.current = requestId

        try {
            const conversation = await loadConversation(path)
            if (selectionRequestRef.current !== requestId) return
            if (!belongsToContext(conversation, context)) throw new Error('Selected agent conversation belongs to another context')

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
    }

    const handleToggleSchedule = () => {
        setScheduleOpen((previous) => !previous)
        setScheduleMessage(null)
    }

    const handleScheduleTriggerTypeChange = (event: ChangeEvent<HTMLInputElement>) => {
        setScheduleTriggerType(event.target.value as ScheduleTriggerType)
        setScheduleMessage(null)
    }

    const handleScheduleTimestampChange = (event: ChangeEvent<HTMLInputElement>) => {
        setScheduleTimestamp(event.target.value)
        setScheduleMessage(null)
    }

    const handleScheduleAfterActionNameChange = (event: ChangeEvent<HTMLInputElement>) => {
        setScheduleAfterActionName(event.target.value)
        setScheduleMessage(null)
    }

    const handleScheduleAction = async () => {
        setScheduleMessage(null)

        try {
            const trigger = createScheduleTrigger(scheduleTriggerType, scheduleTimestamp, scheduleAfterActionName)
            await scheduleAction(action, context, trigger)
            setScheduleMessage('Schedule registered')
        } catch (error) {
            setScheduleMessage(error instanceof Error ? error.message : 'Could not register schedule')
        }
    }

    const handleExtraPromptChange = (event: ChangeEvent<HTMLInputElement>) => {
        setExtraPrompt(event.target.value)
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

    const handleConvertToAction = async () => {
        setConvertMessage(null)
        try {
            const label = actionLabel.trim().length > 0 ? actionLabel : extraPrompt.trim().slice(0, DEFAULT_CONVERT_LABEL_LENGTH)
            const convertInput = {
                ...(agent ? { agent } : {}),
                context,
                label,
                ...(model ? { model } : {}),
                prompt: extraPrompt,
            }
            const result = await convertPromptToAction(convertInput)
            setConvertMessage(`Saved ${result.path}`)

            return true
        } catch (error) {
            setConvertMessage(error instanceof Error ? error.message : 'Could not convert prompt to action')

            return false
        }
    }

    const handleSaveAndRun = async () => {
        const saved = await handleConvertToAction()
        if (!saved) return

        await handleRun()
    }

    const saveDisabled = actionLabel.trim().length === 0 || runStatus === 'running' || !!executionDisabledMessage

    return {
        actionLabel,
        agent,
        agentAvailability,
        agentProfiles,
        backendAvailable,
        convertMessage,
        conversationHistoryLoading,
        conversations,
        displayedConversation,
        extraPrompt,
        executionDisabledMessage,
        handleActionLabelChange,
        handleCancel,
        handleAgentChange,
        handleConvertToAction,
        handleConversationChange,
        handleExtraPromptChange,
        handleModelChange,
        handlePhraseDoubleClick,
        handlePhraseSelect,
        handleRun,
        handleSaveAndRun,
        handleScheduleAction,
        handleScheduleAfterActionNameChange,
        handleScheduleTimestampChange,
        handleScheduleTriggerTypeChange,
        handleToggleSchedule,
        handleThinkingLevelChange,
        history,
        historyError,
        isFollowUp,
        model,
        runLogs,
        runStatus,
        saveDisabled,
        scheduleAfterActionName,
        scheduleMessage,
        scheduleOpen,
        scheduleTimestamp,
        scheduleTriggerType,
        selectedAgentModels,
        selectedAgentAvailable,
        thinkingLevel,
    }
}
