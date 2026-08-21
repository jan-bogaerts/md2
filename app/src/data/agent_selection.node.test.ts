import { describe, expect, it } from 'vitest'
import { BUILTIN_AGENT_PROFILES } from './agent_profiles'
import {
    projectAgentSelection,
    resolveAgentSettings,
    selectAgent,
    selectModel,
    selectPermissionMode,
    selectThinkingLevel,
    validateAgentSelectionState,
    type AgentSelectionState,
} from './agent_selection'

const selection: AgentSelectionState = {
    activeAgent: 'codex',
    permissionMode: 'ask-for-approval',
    settingsByAgent: { codex: { model: 'gpt-5.5', thinkingLevel: 'high' } },
}

describe('agent selection', () => {
    it('restores remembered settings and keeps shared permission mode when switching agent', () => {
        const withClaude: AgentSelectionState = {
            ...selection,
            settingsByAgent: { ...selection.settingsByAgent, claude: { model: 'opus', thinkingLevel: 'max' } },
        }

        expect(selectAgent(withClaude, 'claude', BUILTIN_AGENT_PROFILES)).toEqual({ ...withClaude, activeAgent: 'claude' })
    })

    it('uses profile defaults when target agent has no remembered settings', () => {
        expect(selectAgent(selection, 'claude', BUILTIN_AGENT_PROFILES)).toEqual({
            activeAgent: 'claude',
            permissionMode: 'ask-for-approval',
            settingsByAgent: {
                claude: { model: 'default', thinkingLevel: 'none' },
                codex: { model: 'gpt-5.5', thinkingLevel: 'high' },
            },
        })
    })

    it('uses first matching scope and preserves unavailable remembered values', () => {
        const card = { ...selection, settingsByAgent: { claude: { model: 'removed', thinkingLevel: 'max' as const } } }
        const desktop = { ...selection, settingsByAgent: { claude: { model: 'sonnet', thinkingLevel: 'low' as const } } }

        expect(resolveAgentSettings('claude', BUILTIN_AGENT_PROFILES, [card, desktop])).toEqual({ model: 'removed', thinkingLevel: 'max' })
    })

    it('changes model without resetting thinking level', () => {
        expect(projectAgentSelection(selectModel(selection, 'gpt-5.6-sol'))).toMatchObject({ model: 'gpt-5.6-sol', thinkingLevel: 'high' })
    })

    it('changes thinking and permission independently', () => {
        const thinking = selectThinkingLevel(selection, 'low')
        const permission = selectPermissionMode(thinking, 'full-access')

        expect(projectAgentSelection(permission)).toEqual({ agent: 'codex', model: 'gpt-5.5', permissionMode: 'full-access', thinkingLevel: 'low' })
    })

    it('strictly validates persisted shape', () => {
        expect(validateAgentSelectionState(selection, 'test')).toEqual(selection)
        expect(() => validateAgentSelectionState({ ...selection, settingsByAgent: {} }, 'test')).not.toThrow()
        expect(() => validateAgentSelectionState({ ...selection, permissionMode: 'invalid' }, 'test')).toThrow('Invalid permission mode')
        expect(() => validateAgentSelectionState({ ...selection, settingsByAgent: { codex: { model: 'gpt', thinkingLevel: 'extreme' } } }, 'test')).toThrow('Invalid thinking level')
    })
})
