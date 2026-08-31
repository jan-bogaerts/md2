import { describe, expect, it } from 'vitest'
import { BUILTIN_AGENT_PROFILES, buildResumeAgentCommand, migrateAgentProfiles, validateAgentProfiles } from './agent_profiles'

describe('agent profile validation', () => {
    it('provides configured models for built-in profiles', () => {
        expect(BUILTIN_AGENT_PROFILES).toEqual([
            expect.objectContaining({ defaultThinkingLevel: 'none', models: ['gpt-5.5', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'], name: 'codex' }),
            expect.objectContaining({ defaultThinkingLevel: 'none', models: ['default', 'sonnet', 'fable', 'opus', 'haiku'], name: 'claude' }),
        ])
    })

    it('accepts resume command templates and drops legacy session patterns', () => {
        const [profile] = validateAgentProfiles([{
            command: ['agent'],
            defaultThinkingLevel: 'none',
            models: ['model-a'],
            name: 'agent',
            resumeCommand: ['agent', 'resume', '{{sessionId}}'],
            sessionIdPattern: 'legacy ignored field',
        }])

        expect(profile).not.toHaveProperty('sessionIdPattern')
        expect(buildResumeAgentCommand(profile, 'session-1')).toEqual(['agent', 'resume', 'session-1'])
    })

    it('rejects missing, empty, duplicate, and malformed model lists', () => {
        expect(() => validateAgentProfiles([{ command: ['agent'], defaultThinkingLevel: 'none', name: 'missing' }])).toThrow('models')
        expect(() => validateAgentProfiles([{ command: ['agent'], defaultThinkingLevel: 'none', models: [], name: 'empty' }])).toThrow('models')
        expect(() => validateAgentProfiles([{ command: ['agent'], defaultThinkingLevel: 'none', models: ['same', 'same'], name: 'duplicate' }])).toThrow('Duplicate')
        expect(() => validateAgentProfiles([{ command: ['agent'], defaultThinkingLevel: 'none', models: [' model-a'], name: 'malformed' }])).toThrow('models')
    })

    it('requires a valid default thinking level', () => {
        expect(() => validateAgentProfiles([{ command: ['agent'], models: ['model-a'], name: 'missing' }])).toThrow('defaultThinkingLevel')
        expect(() => validateAgentProfiles([{ command: ['agent'], defaultThinkingLevel: 'extreme', models: ['model-a'], name: 'invalid' }])).toThrow('defaultThinkingLevel')
        expect(() => validateAgentProfiles([{ command: ['custom'], defaultThinkingLevel: 'high', models: ['model-a'], name: 'custom' }]))
            .toThrow('does not support default thinking level high')
    })

    it('migrates missing legacy default thinking level before strict validation', () => {
        const migrated = migrateAgentProfiles([{ command: ['custom'], models: ['model-a'], name: 'custom' }])

        expect(validateAgentProfiles(migrated)).toEqual([{
            command: ['custom'],
            defaultThinkingLevel: 'none',
            models: ['model-a'],
            name: 'custom',
        }])
    })

    it('preserves an optional positive monthly subscription cost and rejects invalid values', () => {
        const profile = { command: ['agent'], defaultThinkingLevel: 'none', models: ['model-a'], name: 'agent' }

        expect(validateAgentProfiles([{ ...profile, monthlySubscriptionCostUsd: 100 }]))
            .toEqual([{ ...profile, monthlySubscriptionCostUsd: 100 }])
        for (const monthlySubscriptionCostUsd of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '100']) {
            expect(() => validateAgentProfiles([{ ...profile, monthlySubscriptionCostUsd }]))
                .toThrow('monthlySubscriptionCostUsd')
        }
    })
})
