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

        expect(result).toMatchObject({ agent: 'codex', command: 'codex --model gpt-5 --search exec --json', model: 'gpt-5' })
    })

    it('constructs commands with placeholders and model arguments', () => {
        expect(buildAgentCommand({ command: 'custom --model {{model}}', models: ['fast'], name: 'custom' }, 'fast')).toBe('custom --model fast')
        expect(buildAgentCommand({ command: 'codex', modelArgument: '--model', models: ['gpt-5'], name: 'codex' }, 'gpt-5')).toBe('codex --model gpt-5')
    })

    it('translates fixed thinking levels through provider-specific adapters', () => {
        const codex = { command: 'codex', modelArgument: '--model', models: ['gpt-5'], name: 'codex' }
        const claude = { command: 'claude', modelArgument: '--model', models: ['sonnet'], name: 'claude' }

        expect(buildAgentExecutionCommand(codex, 'gpt-5', 'high')).toBe('codex --model gpt-5 -c model_reasoning_effort=high --search exec --json')
        expect(buildAgentExecutionCommand(codex, 'gpt-5', 'max')).toBe('codex --model gpt-5 -c model_reasoning_effort=xhigh --search exec --json')
        expect(buildAgentExecutionCommand(claude, 'sonnet', 'max')).toBe('claude --model sonnet --effort max --print --verbose --output-format stream-json')
        expect(buildAgentExecutionCommand(codex, 'gpt-5', 'none')).toBe('codex --model gpt-5 --search exec --json')
        expect(buildAgentExecutionCommand(codex, 'gpt-5', 'none', false)).toBe('codex --model gpt-5 exec --json')
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
            command: 'codex -c model_reasoning_effort=low --search exec --json', thinkingLevel: 'low',
        })
        expect(resolveAgentCommand(config)).toMatchObject({
            command: 'codex -c model_reasoning_effort=medium --search exec --json', thinkingLevel: 'medium',
        })
        expect(resolveAgentCommand({ ...config, thinkingLevel: undefined })).toMatchObject({ command: 'codex --search exec --json', thinkingLevel: 'none' })
    })

    it('falls back to the default profile when the configured profile is missing', () => {
        expect(BUILTIN_AGENT_PROFILES.map((profile) => profile.name)).not.toContain('system')
        expect(resolveAgentCommand({ agent: 'system', agentProfiles: BUILTIN_AGENT_PROFILES, model: '' })).toMatchObject({
            agent: 'codex', model: BUILTIN_AGENT_PROFILES[0].models[0],
        })
    })

    it('rejects stale action overrides when their agent profile is missing', () => {
        const config = {
            agent: 'claude',
            agentProfiles: BUILTIN_AGENT_PROFILES,
            model: 'sonnet',
            thinkingLevel: 'medium',
        }

        expect(() => resolveAgentCommand(config, {
            agent: 'missing', model: 'removed-model', thinkingLevel: 'high',
        })).toThrow('Unknown agent profile: missing')
    })

    it('still resolves user-defined free-form command profiles', () => {
        const result = resolveAgentCommand({
            agent: 'local',
            agentProfiles: [{ command: 'custom-agent --flag', models: ['custom'], name: 'local' }],
            model: '',
        })

        expect(result).toMatchObject({ agent: 'local', command: 'custom-agent --flag', model: 'custom' })
    })

    it('validates resume commands without free-text session patterns', () => {
        const [profile] = validateAgentProfiles([{
            command: 'agent',
            models: ['model-a'],
            name: 'agent',
            resumeCommand: 'agent resume {{sessionId}}',
            sessionIdPattern: 'legacy ignored field',
        }])

        expect(profile).not.toHaveProperty('sessionIdPattern')
        expect(buildResumeAgentCommand(profile, 'session-1')).toBe('agent resume session-1')
    })

    it('keeps provider resume output in JSON format', () => {
        const codex = BUILTIN_AGENT_PROFILES.find((profile) => profile.name === 'codex')
        const claude = BUILTIN_AGENT_PROFILES.find((profile) => profile.name === 'claude')
        if (!codex || !claude) throw new Error('Missing built-in agent profile')

        expect(buildResumeAgentCommand(codex, 'session-1')).toBe('codex exec resume --json session-1')
        expect(buildResumeAgentCommand(claude, 'session-1')).toBe(
            'claude --print --verbose --output-format stream-json --resume session-1',
        )
    })

    it('derives provider resume from the configured execution command', () => {
        const codex = { command: '"C:\\Tools\\codex.cmd"', models: ['gpt-5'], name: 'codex' }
        const claude = { command: '"C:\\Tools\\claude.cmd"', models: ['sonnet'], name: 'claude' }

        expect(buildResumeAgentCommand(codex, 'thread-1', '"C:\\Tools\\codex.cmd" --model gpt-5 exec --json')).toBe(
            '"C:\\Tools\\codex.cmd" --model gpt-5 exec resume --json thread-1',
        )
        expect(buildResumeAgentCommand(claude, 'session-1', '"C:\\Tools\\claude.cmd" --model sonnet --print --verbose --output-format stream-json')).toBe(
            '"C:\\Tools\\claude.cmd" --model sonnet --print --verbose --output-format stream-json --resume session-1',
        )
    })

    it('returns the first listed model when no explicit default exists', () => {
        expect(defaultModelForProfile({ command: 'claude', models: ['sonnet', 'opus'], name: 'claude' })).toBe('sonnet')
    })
})
