import type { ChangeEvent } from 'react'
import type { ActionContext } from '../../../data/action_context'
import type { ActionDefinition } from '../../../data/action_types'
import type { ActionRun } from '../../../services/actions/action_run_registry'
import {
    defaultAccessLevelForProfile,
    defaultApprovalPolicyForProfile,
    defaultModelForProfile,
    findAgentProfile,
    validateThinkingLevel,
} from '../../../data/agent_profiles'
import { useActionRunSelector } from '../../hooks/use_action_runs'
import { ActionAgentSelectors } from './action_agent_selectors'
import type { ActionRunInputStore } from '../run/state/action_run_input_store'
import { useActionRunSettings } from '../shared/use_action_run_settings'

interface ActionAgentSelectorsOwnerProps {
    action: ActionDefinition
    context: ActionContext
    store: ActionRunInputStore
}

function selectRunStatus(run: ActionRun | null) {
    return run?.status ?? null
}

/** Owns agent option subscriptions and editable overrides. */
export function ActionAgentSelectorsOwner(props: ActionAgentSelectorsOwnerProps) {
    const { action, context, store } = props
    const runStatus = useActionRunSelector(action.id, context, selectRunStatus)
    const settings = useActionRunSettings(action, store)
    const disabled = runStatus === 'queued' || runStatus === 'running'

    const handleAgentChange = (event: ChangeEvent<HTMLInputElement>) => {
        if (runStatus === 'waitingForInput') store.recordSettingsChangeWhileWaiting()
        const agent = event.target.value
        const profile = findAgentProfile(settings.agentProfiles, agent)
        store.setAgent(
            agent,
            profile ? defaultModelForProfile(profile) : '',
            profile ? defaultAccessLevelForProfile(profile) ?? '' : '',
            profile ? defaultApprovalPolicyForProfile(profile) ?? '' : '',
        )
    }

    const handleModelChange = (event: ChangeEvent<HTMLInputElement>) => {
        if (runStatus === 'waitingForInput') store.recordSettingsChangeWhileWaiting()
        store.setModel(event.target.value)
    }

    const handleThinkingLevelChange = (event: ChangeEvent<HTMLInputElement>) => {
        if (runStatus === 'waitingForInput') store.recordSettingsChangeWhileWaiting()
        store.setThinkingLevel(validateThinkingLevel(event.target.value, 'action run input'))
    }

    const handleAccessLevelChange = (event: ChangeEvent<HTMLInputElement>) => {
        if (runStatus === 'waitingForInput') store.recordSettingsChangeWhileWaiting()
        store.setAccessLevel(event.target.value)
    }

    const handleApprovalPolicyChange = (event: ChangeEvent<HTMLInputElement>) => {
        if (runStatus === 'waitingForInput') store.recordSettingsChangeWhileWaiting()
        store.setApprovalPolicy(event.target.value)
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
