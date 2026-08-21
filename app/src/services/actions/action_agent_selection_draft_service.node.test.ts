import { describe, expect, it } from 'vitest'
import type { RawActionDefinition } from '../../data/action_types'
import { BUILTIN_AGENT_PROFILES } from '../../data/agent_profiles'
import {
    projectAgentSelection,
    selectAgent,
    selectModel,
    selectThinkingLevel,
    type AgentSelectionState,
} from '../../data/agent_selection'
import { getService } from '../service_injector'
import {
    ActionAgentSelectionDraftService,
    actionAgentSelectionDraftService,
} from './action_agent_selection_draft_service'

const desktopSelection: AgentSelectionState = {
    activeAgent: 'codex',
    permissionMode: 'full-access',
    settingsByAgent: {
        claude: { model: 'sonnet', thinkingLevel: 'low' },
        codex: { model: 'gpt-5.5', thinkingLevel: 'none' },
    },
}

const definition: RawActionDefinition = {
    agent: 'codex',
    description: 'Review code',
    id: 'review',
    label: 'Review',
    model: 'gpt-5.6-sol',
    prompt: 'Review',
    thinkingLevel: 'high',
    type: 'agent',
}

describe('ActionAgentSelectionDraftService', () => {
    it('registers its singleton with the service injector', () => {
        expect(getService('actionAgentSelectionDraftService')).toBe(actionAgentSelectionDraftService)
    })

    it('remembers agent pairs per editor source while keeping permission shared', () => {
        const service = new ActionAgentSelectionDraftService()
        const initial = service.getSelection('actions/review.json', definition, desktopSelection, BUILTIN_AGENT_PROFILES)
        const claudeSelection = selectAgent(initial, 'claude', BUILTIN_AGENT_PROFILES, [desktopSelection])
        const changedModel = selectModel(claudeSelection, 'opus')
        const changedThinking = selectThinkingLevel(changedModel, 'max')
        service.setSelection('actions/review.json', changedThinking)

        const restoredCodex = selectAgent(changedThinking, 'codex', BUILTIN_AGENT_PROFILES, [desktopSelection])
        const restoredClaude = selectAgent(restoredCodex, 'claude', BUILTIN_AGENT_PROFILES, [desktopSelection])

        expect(projectAgentSelection(restoredCodex)).toEqual({agent: 'codex', model: 'gpt-5.6-sol', permissionMode: 'full-access', thinkingLevel: 'high'})
        expect(projectAgentSelection(restoredClaude)).toEqual({agent: 'claude', model: 'opus', permissionMode: 'full-access', thinkingLevel: 'max'})
        expect(service.getSelection('actions/other.json', definition, desktopSelection, BUILTIN_AGENT_PROFILES)).toEqual(initial)
        service.clearSelection('actions/review.json')
        expect(service.getSelection('actions/review.json', definition, desktopSelection, BUILTIN_AGENT_PROFILES)).toEqual(initial)
    })
})
