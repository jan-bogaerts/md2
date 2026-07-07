import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
    buildAgentCommand,
    buildResumeAgentCommand,
    defaultModelForProfile,
    resolveAgentCommand,
    validateAgentProfiles,
} = require('./agent_profiles')

describe('agent profile resolution', () => {
    it('uses profile default model when config model is empty', () => {
        const result = resolveAgentCommand({
            agent: 'codex',
            agentProfiles: [{ command: 'codex', defaultModel: 'gpt-5', modelArgument: '--model', models: ['gpt-5'], name: 'codex' }],
            model: '',
        })

        expect(result).toMatchObject({ agent: 'codex', command: 'codex --model gpt-5', model: 'gpt-5' })
    })

    it('constructs commands with placeholders and model arguments', () => {
        expect(buildAgentCommand({ command: 'custom --model {{model}}', name: 'custom' }, 'fast')).toBe('custom --model fast')
        expect(buildAgentCommand({ command: 'codex', modelArgument: '--model', name: 'codex' }, 'gpt-5')).toBe('codex --model gpt-5')
    })

    it('validates profile session id patterns and resume commands', () => {
        const [profile] = validateAgentProfiles([{
            command: 'agent',
            name: 'agent',
            resumeCommand: 'agent resume {{sessionId}}',
            sessionIdPattern: 'Session: (.+)',
        }])

        expect(profile.sessionIdPattern).toBe('Session: (.+)')
        expect(buildResumeAgentCommand(profile, 'session-1')).toBe('agent resume session-1')
        expect(() => validateAgentProfiles([{ command: 'agent', name: 'bad', sessionIdPattern: '(' }])).toThrow('sessionIdPattern')
    })

    it('returns the first listed model when no explicit default exists', () => {
        expect(defaultModelForProfile({ command: 'claude', models: ['sonnet', 'opus'], name: 'claude' })).toBe('sonnet')
    })
})
