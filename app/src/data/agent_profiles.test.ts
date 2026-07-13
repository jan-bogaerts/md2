import { describe, expect, it } from 'vitest'
import { BUILTIN_AGENT_PROFILES, buildResumeAgentCommand, validateAgentProfiles } from './agent_profiles'

describe('agent profile validation', () => {
    it('provides configured models for built-in profiles', () => {
        expect(BUILTIN_AGENT_PROFILES).toEqual([
            expect.objectContaining({ models: ['GPT 5.5', 'GPT 5.6 sol', 'GPT 5.6 tera', 'GPT 5.6 luna'], name: 'codex' }),
            expect.objectContaining({ models: ['default', 'sonnet', 'fable', 'opus', 'haiku'], name: 'claude' }),
        ])
    })

    it('accepts session id patterns and resume command templates', () => {
        const [profile] = validateAgentProfiles([{
            command: 'agent',
            models: ['model-a'],
            name: 'agent',
            resumeCommand: 'agent resume {{sessionId}}',
            sessionIdPattern: 'Session: (.+)',
        }])

        expect(profile.sessionIdPattern).toBe('Session: (.+)')
        expect(buildResumeAgentCommand(profile, 'session-1')).toBe('agent resume session-1')
    })

    it('rejects invalid session id patterns', () => {
        expect(() => validateAgentProfiles([{ command: 'agent', models: ['model-a'], name: 'bad', sessionIdPattern: '(' }])).toThrow('sessionIdPattern')
    })

    it('rejects missing, empty, duplicate, and malformed model lists', () => {
        expect(() => validateAgentProfiles([{ command: 'agent', name: 'missing' }])).toThrow('models')
        expect(() => validateAgentProfiles([{ command: 'agent', models: [], name: 'empty' }])).toThrow('models')
        expect(() => validateAgentProfiles([{ command: 'agent', models: ['same', 'same'], name: 'duplicate' }])).toThrow('Duplicate')
        expect(() => validateAgentProfiles([{ command: 'agent', models: [' model-a'], name: 'malformed' }])).toThrow('models')
    })
})
