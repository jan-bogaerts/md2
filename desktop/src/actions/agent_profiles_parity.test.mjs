import { describe, expect, it } from 'vitest'
import {
    BUILTIN_AGENT_PROFILES,
    buildAgentCommand,
    defaultModelForProfile,
    validateAgentProfiles,
} from './agent_profiles.mjs'

const sharedAgentProfiles = await import('../../../shared/agent_profiles.mjs')

describe('agent_profiles shared adapter', () => {
    it('uses the shared implementation for desktop exports', () => {
        expect(BUILTIN_AGENT_PROFILES).toBe(sharedAgentProfiles.BUILTIN_AGENT_PROFILES)
        expect(validateAgentProfiles).toBe(sharedAgentProfiles.validateAgentProfiles)
    })

    it('keeps validation and command building behavior covered by shared built-ins', () => {
        const profiles = validateAgentProfiles(BUILTIN_AGENT_PROFILES)
        const codex = profiles.find((profile) => profile.name === 'codex')
        if (!codex) throw new Error('Missing codex built-in profile')

        expect(defaultModelForProfile(codex)).toBe('')
        expect(buildAgentCommand(codex, 'gpt-5')).toBe('codex --model gpt-5')
    })
})
