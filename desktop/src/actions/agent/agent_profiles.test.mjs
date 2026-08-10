import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    BUILTIN_AGENT_PROFILES,
    buildAgentCommand,
    buildAgentExecutionCommand,
    buildAgentStreamingCommand,
    buildResumeAgentCommand,
    defaultModelForProfile,
    normalizeAgentProfiles,
    resolveAgentCommand,
    supportsAgentStreaming,
    supportsPermissionMode,
    validateAgentProfiles,
    validatePermissionMode,
    validateThinkingLevel,
} = require('./agent_profiles.mjs');

describe('agent profile resolution', () => {
    it('uses profile default model when config model is empty', () => {
        const result = resolveAgentCommand({
            agent: 'codex',
            agentProfiles: [{ command: ['codex'], defaultModel: 'gpt-5', modelArgument: '--model', models: ['gpt-5'], name: 'codex' }],
            model: '',
        });

        expect(result).toMatchObject({
            agent: 'codex',
            command: ['codex', '--model', 'gpt-5', '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request', '--search', 'exec', '--json'],
            model: 'gpt-5',
            permissionMode: 'ask-for-approval',
        });
    });

    it('constructs commands with placeholders and model arguments', () => {
        expect(buildAgentCommand({ command: ['custom', '--model', '{{model}}'], models: ['fast'], name: 'custom' }, 'fast')).toEqual(['custom', '--model', 'fast']);
        expect(buildAgentCommand({ command: ['codex'], modelArgument: '--model', models: ['gpt-5'], name: 'codex' }, 'gpt-5')).toEqual(['codex', '--model', 'gpt-5']);
    });

    it.each([
        ['codex', 'ask-for-approval', ['--sandbox', 'workspace-write', '--ask-for-approval', 'on-request']],
        ['codex', 'approve-for-me', ['--sandbox', 'workspace-write', '--ask-for-approval', 'on-request', '-c', 'approvals_reviewer=auto_review']],
        ['codex', 'full-access', ['--sandbox', 'danger-full-access', '--ask-for-approval', 'never']],
        ['claude', 'ask-for-approval', ['--permission-mode', 'acceptEdits']],
        ['claude', 'approve-for-me', ['--permission-mode', 'auto']],
        ['claude', 'full-access', ['--permission-mode', 'bypassPermissions']],
    ])('builds exact %s %s one-shot, streaming, and resume commands', (agent, permissionMode, permissionArguments) => {
        const profile = BUILTIN_AGENT_PROFILES.find(({ name }) => name === agent);
        if (!profile) throw new Error(`Missing profile ${agent}`);
        const model = agent === 'codex' ? 'gpt-5.5' : 'sonnet';
        const base = [agent, '--model', model, ...permissionArguments];
        const output = agent === 'codex'
            ? ['--search', 'exec', '--json']
            : ['--print', '--verbose', '--output-format', 'stream-json'];
        const streamingOutput = agent === 'codex'
            ? ['app-server', '--stdio']
            : [...output, '--include-partial-messages', '--input-format', 'stream-json', '--permission-prompt-tool', 'stdio'];
        const resumed = agent === 'codex'
            ? [...base, 'exec', 'resume', '--json', 'session-1']
            : [...base, ...output, '--resume', 'session-1'];

        expect(buildAgentExecutionCommand(profile, model, 'none', true, permissionMode)).toEqual([...base, ...output]);
        expect(buildAgentStreamingCommand(profile, model, 'none', permissionMode)).toEqual([...base, ...streamingOutput]);
        expect(buildResumeAgentCommand(
            profile,
            'session-1',
            buildAgentExecutionCommand(profile, model, 'none', false, permissionMode),
        )).toEqual(resumed);
    });

    it('validates shared modes and rejects permission modes for custom profiles', () => {
        const custom = { command: ['agent'], models: ['model'], name: 'agent' };

        expect(validatePermissionMode('ask-for-approval', 'test')).toBe('ask-for-approval');
        expect(validatePermissionMode('approve-for-me', 'test')).toBe('approve-for-me');
        expect(validatePermissionMode('full-access', 'test')).toBe('full-access');
        expect(() => validatePermissionMode('removed', 'test')).toThrow('Invalid permission mode in test: removed');
        expect(supportsPermissionMode(custom)).toBe(false);
        expect(() => buildAgentExecutionCommand(custom, 'model', 'none', true, 'ask-for-approval'))
            .toThrow('Agent profile does not support permission modes: agent');
    });

    it('translates fixed thinking levels through provider-specific adapters', () => {
        const codex = { command: ['codex'], modelArgument: '--model', models: ['gpt-5'], name: 'codex' };
        const claude = { command: ['claude'], modelArgument: '--model', models: ['sonnet'], name: 'claude' };

        expect(buildAgentExecutionCommand(codex, 'gpt-5', 'high')).toEqual(['codex', '--model', 'gpt-5', '-c', 'model_reasoning_effort=high', '--search', 'exec', '--json']);
        expect(buildAgentExecutionCommand(codex, 'gpt-5', 'max')).toEqual(['codex', '--model', 'gpt-5', '-c', 'model_reasoning_effort=xhigh', '--search', 'exec', '--json']);
        expect(buildAgentExecutionCommand(claude, 'sonnet', 'max')).toEqual(['claude', '--model', 'sonnet', '--effort', 'max', '--print', '--verbose', '--output-format', 'stream-json']);
        expect(buildAgentExecutionCommand(codex, 'gpt-5', 'none')).toEqual(['codex', '--model', 'gpt-5', '--search', 'exec', '--json']);
        expect(buildAgentExecutionCommand(codex, 'gpt-5', 'none', false)).toEqual(['codex', '--model', 'gpt-5', 'exec', '--json']);
    });

    it('builds streaming commands only for supported provider profiles', () => {
        const codex = { command: ['codex'], modelArgument: '--model', models: ['gpt-5'], name: 'codex' };
        const claude = { command: ['claude'], modelArgument: '--model', models: ['sonnet'], name: 'claude' };
        const custom = { command: ['custom'], models: ['fast'], name: 'custom' };

        expect(buildAgentStreamingCommand(codex, 'gpt-5', 'high')).toEqual([
            'codex', '--model', 'gpt-5', '-c', 'model_reasoning_effort=high', 'app-server', '--stdio',
        ]);
        expect(buildAgentStreamingCommand(claude, 'sonnet', 'none')).toEqual([
            'claude', '--model', 'sonnet', '--print', '--verbose', '--output-format', 'stream-json',
            '--include-partial-messages', '--input-format', 'stream-json', '--permission-prompt-tool', 'stdio',
        ]);
        expect(supportsAgentStreaming(custom)).toBe(false);
        expect(() => buildAgentStreamingCommand(custom, 'fast', 'none'))
            .toThrow('Agent profile does not support streaming: custom');
    });

    it('rejects invalid levels and profiles without a thinking-level adapter', () => {
        const custom = { command: ['custom-agent'], models: ['fast'], name: 'custom' };

        expect(() => validateThinkingLevel('extreme', 'test')).toThrow('Invalid thinking level in test: extreme');
        expect(() => buildAgentExecutionCommand(custom, 'fast', 'high')).toThrow('Agent profile does not support thinking levels: custom');
    });

    it('resolves effective thinking level from selection, config, then none', () => {
        const config = {
            agent: 'codex',
            agentProfiles: [{ command: ['codex'], models: ['gpt-5'], name: 'codex' }],
            model: 'gpt-5',
            thinkingLevel: 'medium',
        };

        const permissionArguments = ['--sandbox', 'workspace-write', '--ask-for-approval', 'on-request'];
        expect(resolveAgentCommand(config, { thinkingLevel: 'low' })).toMatchObject({command: ['codex', '-c', 'model_reasoning_effort=low', ...permissionArguments, '--search', 'exec', '--json'], thinkingLevel: 'low'});
        expect(resolveAgentCommand(config)).toMatchObject({command: ['codex', '-c', 'model_reasoning_effort=medium', ...permissionArguments, '--search', 'exec', '--json'], thinkingLevel: 'medium'});
        expect(resolveAgentCommand({ ...config, thinkingLevel: undefined })).toMatchObject({ command: ['codex', ...permissionArguments, '--search', 'exec', '--json'], thinkingLevel: 'none' });
    });

    it('falls back to the default profile when the configured profile is missing', () => {
        expect(BUILTIN_AGENT_PROFILES.map((profile) => profile.name)).not.toContain('system');
        expect(resolveAgentCommand({ agent: 'system', agentProfiles: BUILTIN_AGENT_PROFILES, model: '' })).toMatchObject({agent: 'codex', model: BUILTIN_AGENT_PROFILES[0].models[0]});
    });

    it('rejects stale action overrides when their agent profile is missing', () => {
        const config = {
            agent: 'claude',
            agentProfiles: BUILTIN_AGENT_PROFILES,
            model: 'sonnet',
            thinkingLevel: 'medium',
        };

        expect(() => resolveAgentCommand(config, {agent: 'missing', model: 'removed-model', thinkingLevel: 'high'})).toThrow('Unknown agent profile: missing');
    });

    it('still resolves user-defined free-form command profiles', () => {
        const result = resolveAgentCommand({
            agent: 'local',
            agentProfiles: [{ command: ['custom-agent', '--flag'], models: ['custom'], name: 'local' }],
            model: '',
        });

        expect(result).toMatchObject({ agent: 'local', command: ['custom-agent', '--flag'], model: 'custom' });
    });

    it('validates resume commands without free-text session patterns', () => {
        const [profile] = validateAgentProfiles([{
            command: ['agent'],
            models: ['model-a'],
            name: 'agent',
            resumeCommand: ['agent', 'resume', '{{sessionId}}'],
            sessionIdPattern: 'legacy ignored field',
        }]);

        expect(profile).not.toHaveProperty('sessionIdPattern');
        expect(buildResumeAgentCommand(profile, 'session-1')).toEqual(['agent', 'resume', 'session-1']);
    });

    it('normalizes profiles tolerantly by dropping invalid entries', () => {
        const profiles = normalizeAgentProfiles([
            { command: 'legacy-string-command', models: ['model-a'], name: 'legacy' },
            { command: ['valid-agent'], models: ['model-b'], name: 'valid' },
            { command: ['duplicate-agent'], models: ['model-c'], name: 'valid' },
        ]);

        expect(profiles).toEqual([{ command: ['valid-agent'], models: ['model-b'], name: 'valid' }]);
    });

    it('normalizes to fresh built-in profiles when nothing valid remains', () => {
        for (const input of [undefined, 'not-an-array', [], [{ command: 'legacy', models: [], name: 'broken' }]]) {
            const profiles = normalizeAgentProfiles(input);

            expect(profiles).toEqual(BUILTIN_AGENT_PROFILES);
            expect(profiles[0]).not.toBe(BUILTIN_AGENT_PROFILES[0]);
        }
    });

    it('keeps provider resume output in JSON format', () => {
        const codex = BUILTIN_AGENT_PROFILES.find((profile) => profile.name === 'codex');
        const claude = BUILTIN_AGENT_PROFILES.find((profile) => profile.name === 'claude');
        if (!codex || !claude) throw new Error('Missing built-in agent profile');

        expect(buildResumeAgentCommand(codex, 'session-1')).toEqual(['codex', 'exec', 'resume', '--json', 'session-1']);
        expect(buildResumeAgentCommand(claude, 'session-1')).toEqual(['claude', '--print', '--verbose', '--output-format', 'stream-json', '--resume', 'session-1']);
    });

    it('derives provider resume from the configured execution command', () => {
        const codex = { command: ['C:\\Tools\\codex.cmd'], models: ['gpt-5'], name: 'codex' };
        const claude = { command: ['C:\\Tools\\claude.cmd'], models: ['sonnet'], name: 'claude' };

        expect(buildResumeAgentCommand(codex, 'thread-1', ['C:\\Tools\\codex.cmd', '--model', 'gpt-5', 'exec', '--json'])).toEqual(
            ['C:\\Tools\\codex.cmd', '--model', 'gpt-5', 'exec', 'resume', '--json', 'thread-1'],
        );
        expect(buildResumeAgentCommand(claude, 'session-1', ['C:\\Tools\\claude.cmd', '--model', 'sonnet', '--print', '--verbose', '--output-format', 'stream-json'])).toEqual(
            ['C:\\Tools\\claude.cmd', '--model', 'sonnet', '--print', '--verbose', '--output-format', 'stream-json', '--resume', 'session-1'],
        );
    });

    it('returns the first listed model when no explicit default exists', () => {
        expect(defaultModelForProfile({ command: ['claude'], models: ['sonnet', 'opus'], name: 'claude' })).toBe('sonnet');
    });
});
