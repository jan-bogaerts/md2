import type { ChangeEvent } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import { defaultModelForProfile, findAgentProfile, validateThinkingLevel } from '../../data/agent_profiles'
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
        store.setAgent(agent, profile ? defaultModelForProfile(profile) : '')
    }

    const handleModelChange = (event: ChangeEvent<HTMLInputElement>) => {
        store.setModel(event.target.value)
    }

    const handleThinkingLevelChange = (event: ChangeEvent<HTMLInputElement>) => {
        store.setThinkingLevel(validateThinkingLevel(event.target.value, 'action run input'))
    }

    return (
        <ActionAgentSelectors
            agent={settings.agent}
            agentAvailability={settings.agentAvailability}
            agentProfiles={settings.agentProfiles}
            disabled={sessionActive}
            model={settings.model}
            onAgentChange={handleAgentChange}
            onModelChange={handleModelChange}
            onThinkingLevelChange={handleThinkingLevelChange}
            selectedAgentModels={settings.selectedAgentModels}
            thinkingLevel={settings.thinkingLevel}
        />
    )
}
