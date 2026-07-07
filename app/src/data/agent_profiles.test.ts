import { describe, expect, it } from 'vitest'
import { buildResumeAgentCommand, validateAgentProfiles } from './agent_profiles'

describe('agent profile validation', () => {
    it('accepts session id patterns and resume command templates', () => {
        const [profile] = validateAgentProfiles([{
            command: 'agent',
            name: 'agent',
            resumeCommand: 'agent resume {{sessionId}}',
            sessionIdPattern: 'Session: (.+)',
        }])

        expect(profile.sessionIdPattern).toBe('Session: (.+)')
        expect(buildResumeAgentCommand(profile, 'session-1')).toBe('agent resume session-1')
    })

    it('rejects invalid session id patterns', () => {
        expect(() => validateAgentProfiles([{ command: 'agent', name: 'bad', sessionIdPattern: '(' }])).toThrow('sessionIdPattern')
    })
})
