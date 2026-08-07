import type { ChangeEvent } from 'react'
import type { ActionContext } from '../../../data/action_context'
import type { ActionDefinition } from '../../../data/action_types'
import type { ActionRun } from '../../../services/actions/action_run_registry'
import type { ActionRunSettingsStore } from '../../../services/actions/action_run_settings_service'
import {
    defaultAccessLevelForProfile,
    defaultApprovalPolicyForProfile,
    defaultModelForProfile,
    findAgentProfile,
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
        accessLevel: settings.accessLevel,
        agent: settings.agent,
        approvalPolicy: settings.approvalPolicy,
        model: settings.model,
        thinkingLevel: settings.thinkingLevel,
    }
    const disabled = settings.settingsLoading || runStatus === 'queued' || runStatus === 'running'

    const handleAgentChange = (event: ChangeEvent<HTMLInputElement>) => {
        const agent = event.target.value
        const profile = findAgentProfile(settings.agentProfiles, agent)
        const nextSettings = {
            accessLevel: profile ? defaultAccessLevelForProfile(profile) ?? '' : '',
            agent,
            approvalPolicy: profile ? defaultApprovalPolicyForProfile(profile) ?? '' : '',
            model: profile ? defaultModelForProfile(profile) : '',
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

    const handleAccessLevelChange = (event: ChangeEvent<HTMLInputElement>) => {
        settingsStore.setSettings({ ...currentSettings, accessLevel: event.target.value }, runStatus === 'waitingForInput')
    }

    const handleApprovalPolicyChange = (event: ChangeEvent<HTMLInputElement>) => {
        settingsStore.setSettings({ ...currentSettings, approvalPolicy: event.target.value }, runStatus === 'waitingForInput')
    }

    return (
        <ActionAgentSelectors
            accessLevel={settings.accessLevel}
            agent={settings.agent}
            agentAvailability={settings.agentAvailability}
            agentProfiles={settings.agentProfiles}
            approvalPolicy={settings.approvalPolicy}
            disabled={disabled}
            model={settings.model}
            onAccessLevelChange={handleAccessLevelChange}
            onAgentChange={handleAgentChange}
            onApprovalPolicyChange={handleApprovalPolicyChange}
            onModelChange={handleModelChange}
            onThinkingLevelChange={handleThinkingLevelChange}
            selectedAccessLevels={settings.selectedAccessLevels}
            selectedAgentModels={settings.selectedAgentModels}
            selectedApprovalPolicies={settings.selectedApprovalPolicies}
            thinkingLevel={settings.thinkingLevel}
        />
    )
}
