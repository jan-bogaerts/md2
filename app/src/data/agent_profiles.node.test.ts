import { describe, expect, it } from 'vitest'
import { buildResumeAgentCommand, migrateAgentProfiles, validateAgentProfiles, validateAgentSelection } from './agent_profiles'

describe('agent profile validation', () => {
    it('accepts unlisted models for builtin and custom agents', () => {
        expect(() => validateAgentSelection([], { agent: 'codex', model: 'new-provider-model', thinkingLevel: 'medium' }, 'test'))
            .not.toThrow();
        expect(() => validateAgentSelection([], { agent: 'claude', model: 'new-claude-alias', thinkingLevel: 'none' }, 'test'))
            .not.toThrow();
        const custom = { command: ['custom'], models: ['known-model'], defaultThinkingLevel: 'none' as const, name: 'custom' };
        expect(() => validateAgentSelection([custom], { agent: 'custom', model: 'unknown-model', thinkingLevel: 'none' }, 'test'))
            .not.toThrow();
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

    it('allows profiles without configured model suggestions or with an unlisted default', () => {
        const profile = { command: ['agent'], defaultThinkingLevel: 'none', name: 'custom', defaultModel: 'new-model' };
        expect(validateAgentProfiles([profile])).toEqual([{ ...profile, models: [] }]);
        expect(validateAgentProfiles([{ ...profile, models: ['old-model'] }])[0].defaultModel).toBe('new-model');
    });

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
