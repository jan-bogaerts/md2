import type { ChangeEvent } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import {
    defaultAccessLevelForProfile,
    defaultApprovalPolicyForProfile,
    defaultModelForProfile,
    findAgentProfile,
    validateThinkingLevel,
} from '../../data/agent_profiles'
import { useActionRun } from '../hooks/use_action_runs'
import { ActionAgentSelectors } from './action_agent_selectors'
import type { ActionRunInputStore } from './action_run_input_store'
import { useActionRunSettings } from './use_action_run_settings'

interface ActionAgentSelectorsOwnerProps {
    action: ActionDefinition
    context: ActionContext
    store: ActionRunInputStore
}

/** Owns agent option subscriptions and editable overrides. */
export function ActionAgentSelectorsOwner(props: ActionAgentSelectorsOwnerProps) {
    const { action, context, store } = props
    const run = useActionRun(action.id, context)
    const settings = useActionRunSettings(action, store)
    const sessionActive = run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput'

    const handleAgentChange = (event: ChangeEvent<HTMLInputElement>) => {
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
        store.setModel(event.target.value)
    }

    const handleThinkingLevelChange = (event: ChangeEvent<HTMLInputElement>) => {
        store.setThinkingLevel(validateThinkingLevel(event.target.value, 'action run input'))
    }

    const handleAccessLevelChange = (event: ChangeEvent<HTMLInputElement>) => {
        store.setAccessLevel(event.target.value)
    }

    const handleApprovalPolicyChange = (event: ChangeEvent<HTMLInputElement>) => {
        store.setApprovalPolicy(event.target.value)
    }

    return (
        <ActionAgentSelectors
            accessLevel={settings.accessLevel}
            agent={settings.agent}
            agentAvailability={settings.agentAvailability}
            agentProfiles={settings.agentProfiles}
            approvalPolicy={settings.approvalPolicy}
            disabled={sessionActive}
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
