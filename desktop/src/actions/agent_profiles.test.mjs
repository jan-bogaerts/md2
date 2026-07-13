import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
    BUILTIN_AGENT_PROFILES,
    buildAgentCommand,
    buildAgentExecutionCommand,
    buildResumeAgentCommand,
    defaultModelForProfile,
    resolveAgentCommand,
    validateAgentProfiles,
    validateThinkingLevel,
} = require('./agent_profiles.mjs')

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
        expect(buildAgentCommand({ command: 'custom --model {{model}}', models: ['fast'], name: 'custom' }, 'fast')).toBe('custom --model fast')
        expect(buildAgentCommand({ command: 'codex', modelArgument: '--model', models: ['gpt-5'], name: 'codex' }, 'gpt-5')).toBe('codex --model gpt-5')
    })

    it('translates fixed thinking levels through provider-specific adapters', () => {
        const codex = { command: 'codex', modelArgument: '--model', models: ['gpt-5'], name: 'codex' }
        const claude = { command: 'claude', modelArgument: '--model', models: ['sonnet'], name: 'claude' }

        expect(buildAgentExecutionCommand(codex, 'gpt-5', 'high')).toBe('codex --model gpt-5 -c model_reasoning_effort=high')
        expect(buildAgentExecutionCommand(codex, 'gpt-5', 'max')).toBe('codex --model gpt-5 -c model_reasoning_effort=xhigh')
        expect(buildAgentExecutionCommand(claude, 'sonnet', 'max')).toBe('claude --model sonnet --effort max')
        expect(buildAgentExecutionCommand(codex, 'gpt-5', 'none')).toBe('codex --model gpt-5')
    })

    it('rejects invalid levels and profiles without a thinking-level adapter', () => {
        const custom = { command: 'custom-agent', models: ['fast'], name: 'custom' }

        expect(() => validateThinkingLevel('extreme', 'test')).toThrow('Invalid thinking level in test: extreme')
        expect(() => buildAgentExecutionCommand(custom, 'fast', 'high')).toThrow('Agent profile does not support thinking levels: custom')
    })

    it('resolves effective thinking level from selection, config, then none', () => {
        const config = {
            agent: 'codex',
            agentProfiles: [{ command: 'codex', models: ['gpt-5'], name: 'codex' }],
            model: 'gpt-5',
            thinkingLevel: 'medium',
        }

        expect(resolveAgentCommand(config, { thinkingLevel: 'low' })).toMatchObject({
            command: 'codex -c model_reasoning_effort=low', thinkingLevel: 'low',
        })
        expect(resolveAgentCommand(config)).toMatchObject({
            command: 'codex -c model_reasoning_effort=medium', thinkingLevel: 'medium',
        })
        expect(resolveAgentCommand({ ...config, thinkingLevel: undefined })).toMatchObject({ command: 'codex', thinkingLevel: 'none' })
    })

    it('falls back to the default profile when the configured profile is missing', () => {
        expect(BUILTIN_AGENT_PROFILES.map((profile) => profile.name)).not.toContain('system')
        expect(resolveAgentCommand({ agent: 'system', agentProfiles: BUILTIN_AGENT_PROFILES, model: '' })).toMatchObject({
            agent: 'codex', model: BUILTIN_AGENT_PROFILES[0].models[0],
        })
    })

    it('ignores stale action overrides when their agent profile is missing', () => {
        const config = {
            agent: 'claude',
            agentProfiles: BUILTIN_AGENT_PROFILES,
            model: 'sonnet',
            thinkingLevel: 'medium',
        }

        expect(resolveAgentCommand(config, {
            agent: 'missing', model: 'removed-model', thinkingLevel: 'high',
        })).toMatchObject({
            agent: 'claude', command: 'claude --model sonnet --effort medium', model: 'sonnet', thinkingLevel: 'medium',
        })
    })

    it('still resolves user-defined free-form command profiles', () => {
        const result = resolveAgentCommand({
            agent: 'local',
            agentProfiles: [{ command: 'custom-agent --flag', models: ['custom'], name: 'local' }],
            model: '',
        })

        expect(result).toMatchObject({ agent: 'local', command: 'custom-agent --flag', model: 'custom' })
    })

    it('validates profile session id patterns and resume commands', () => {
        const [profile] = validateAgentProfiles([{
            command: 'agent',
            models: ['model-a'],
            name: 'agent',
            resumeCommand: 'agent resume {{sessionId}}',
            sessionIdPattern: 'Session: (.+)',
        }])

        expect(profile.sessionIdPattern).toBe('Session: (.+)')
        expect(buildResumeAgentCommand(profile, 'session-1')).toBe('agent resume session-1')
        expect(() => validateAgentProfiles([{ command: 'agent', models: ['model-a'], name: 'bad', sessionIdPattern: '(' }])).toThrow('sessionIdPattern')
    })

    it('returns the first listed model when no explicit default exists', () => {
        expect(defaultModelForProfile({ command: 'claude', models: ['sonnet', 'opus'], name: 'claude' })).toBe('sonnet')
    })
})
