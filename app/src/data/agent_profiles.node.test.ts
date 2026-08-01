import { describe, expect, it } from 'vitest'
import { BUILTIN_AGENT_PROFILES, buildResumeAgentCommand, validateAgentProfiles } from './agent_profiles'

describe('agent profile validation', () => {
    it('provides configured models for built-in profiles', () => {
        expect(BUILTIN_AGENT_PROFILES).toEqual([
            expect.objectContaining({ models: ['gpt-5.5', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'], name: 'codex' }),
            expect.objectContaining({ models: ['default', 'sonnet', 'fable', 'opus', 'haiku'], name: 'claude' }),
        ])
    })

    it('accepts resume command templates and drops legacy session patterns', () => {
        const [profile] = validateAgentProfiles([{
            command: ['agent'],
            models: ['model-a'],
            name: 'agent',
            resumeCommand: ['agent', 'resume', '{{sessionId}}'],
            sessionIdPattern: 'legacy ignored field',
        }])

        expect(profile).not.toHaveProperty('sessionIdPattern')
        expect(buildResumeAgentCommand(profile, 'session-1')).toEqual(['agent', 'resume', 'session-1'])
    })

    it('rejects missing, empty, duplicate, and malformed model lists', () => {
        expect(() => validateAgentProfiles([{ command: ['agent'], name: 'missing' }])).toThrow('models')
        expect(() => validateAgentProfiles([{ command: ['agent'], models: [], name: 'empty' }])).toThrow('models')
        expect(() => validateAgentProfiles([{ command: ['agent'], models: ['same', 'same'], name: 'duplicate' }])).toThrow('Duplicate')
        expect(() => validateAgentProfiles([{ command: ['agent'], models: [' model-a'], name: 'malformed' }])).toThrow('models')
    })
})
