import type { ChangeEvent } from 'react'
import type { ActionContext } from '../../../data/action_context'
import type { ActionDefinition } from '../../../data/action_types'
import type { ActionRun } from '../../../services/actions/action_run_registry'
import type { ActionRunSettingsStore } from '../../../services/actions/action_run_settings_service'
import {
    DEFAULT_PERMISSION_MODE,
    defaultModelForProfile,
    findAgentProfile,
    supportsPermissionMode,
    validatePermissionMode,
    validateThinkingLevel,
} from '../../../data/agent_profiles'
import { useActionRunSelector } from '../../hooks/use_action_runs'
import { ActionAgentSelectors } from './action_agent_selectors'
import { useActionRunSettings } from '../shared/use_action_run_settings'

interface ActionAgentSelectorsOwnerProps {
    action: ActionDefinition
    context: ActionContext
    settingsStore: ActionRunSettingsStore
}

function selectRunStatus(run: ActionRun | null) {
    return run?.status ?? null
}

/** Owns agent option subscriptions and editable overrides. */
export function ActionAgentSelectorsOwner(props: ActionAgentSelectorsOwnerProps) {
    const { action, context, settingsStore } = props
    const runStatus = useActionRunSelector(action.id, context, selectRunStatus)
    const settings = useActionRunSettings(action, settingsStore)
    const currentSettings = {
        agent: settings.agent,
        model: settings.model,
        permissionMode: settings.permissionMode,
        thinkingLevel: settings.thinkingLevel,
    }
    const disabled = settings.settingsLoading || runStatus === 'queued' || runStatus === 'running'

    const handleAgentChange = (event: ChangeEvent<HTMLInputElement>) => {
        const agent = event.target.value
        const profile = findAgentProfile(settings.agentProfiles, agent)
        const nextSettings: Parameters<ActionRunSettingsStore['setSettings']>[0] = {
            agent,
            model: profile ? defaultModelForProfile(profile) : '',
            permissionMode: profile && supportsPermissionMode(profile) ? DEFAULT_PERMISSION_MODE : '',
            thinkingLevel: 'none' as const,
        }
        settingsStore.setSettings(nextSettings, runStatus === 'waitingForInput')
    }

    const handleModelChange = (event: ChangeEvent<HTMLInputElement>) => {
        settingsStore.setSettings({ ...currentSettings, model: event.target.value, thinkingLevel: 'none' }, runStatus === 'waitingForInput')
    }

    const handleThinkingLevelChange = (event: ChangeEvent<HTMLInputElement>) => {
        const thinkingLevel = validateThinkingLevel(event.target.value, 'action run input')
        settingsStore.setSettings({ ...currentSettings, thinkingLevel }, runStatus === 'waitingForInput')
    }

    const handlePermissionModeChange = (event: ChangeEvent<HTMLInputElement>) => {
        const permissionMode = validatePermissionMode(event.target.value, 'action run input')
        settingsStore.setSettings({ ...currentSettings, permissionMode }, runStatus === 'waitingForInput')
    }

    return (
        <ActionAgentSelectors
            agent={settings.agent}
            agentAvailability={settings.agentAvailability}
            agentProfiles={settings.agentProfiles}
            disabled={disabled}
            model={settings.model}
            onAgentChange={handleAgentChange}
            onModelChange={handleModelChange}
            onPermissionModeChange={handlePermissionModeChange}
            onThinkingLevelChange={handleThinkingLevelChange}
            selectedAgentModels={settings.selectedAgentModels}
            permissionMode={settings.permissionMode}
            permissionModeSupported={settings.permissionModeSupported}
            thinkingLevel={settings.thinkingLevel}
        />
    )
}
