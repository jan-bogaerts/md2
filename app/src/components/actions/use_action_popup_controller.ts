import { useEffect, useState } from 'react'
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
import { useActionExecution } from '../hooks/use_action_executions'
import { useConfigValueOrFallback } from '../hooks/use_config_value'
import { useAgentCapabilities } from '../hooks/use_agent_capabilities'
import {
    defaultCancelAction,
    defaultConvertPromptToAction,
    defaultLoadHistory,
    defaultRunAction,
    defaultScheduleAction,
    type CancelAction,
    type ConvertPromptToAction,
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
    context: ActionContext
    convertPromptToAction?: ConvertPromptToAction
    loadHistory?: LoadHistory
    runAction?: RunAction
    scheduleAction?: ScheduleAction
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
    const [extraPrompt, setExtraPrompt] = useState('')
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
    const [thinkingLevelOverride, setThinkingLevelOverride] = useState<{ actionId: string, value: ThinkingLevel } | null>(null)
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
    const sharedExecution = useActionExecution(action.id, context)
    const executionId = sharedExecution?.executionId ?? localExecutionId
    const runStatus = sharedExecution?.status ?? localRunStatus
    const runLogs = sharedExecution?.logs ?? localRunResult?.logs ?? []

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

    const handleRun = async () => {
        setLocalRunStatus('running')
        setLocalRunResult(null)

        try {
            const runInput = action.type === 'agent'
                ? { ...(agent ? { agent } : {}), extraPrompt, ...(model ? { model } : {}), thinkingLevel }
                : { extraPrompt }
            const result = await runAction(action, context, runInput, setLocalExecutionId)
            setLocalRunResult(result)
            setLocalRunStatus(result.status)
            setLocalExecutionId(null)
            setHistory(await loadHistory(action, context))
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Action run failed'
            setLocalRunResult({
                logs: [{ actionName: action.name, command: null, message, phase: 'main', status: 'failed', stderr: message, stdout: '' }],
                status: 'failed',
            })
            setLocalRunStatus('failed')
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
        extraPrompt,
        executionDisabledMessage,
        handleActionLabelChange,
        handleCancel,
        handleAgentChange,
        handleConvertToAction,
        handleExtraPromptChange,
        handleModelChange,
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
