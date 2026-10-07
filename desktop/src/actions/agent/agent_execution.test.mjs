import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { resolveAgentExecution } = require('./agent_execution');
const { AgentModelCatalogService } = require('./agent_model_catalog_service');
const { BUILTIN_AGENT_PROFILES, buildResumeAgentCommand } = require('./agent_profiles.mjs');

function config(speedMode) {
    const profile = { ...BUILTIN_AGENT_PROFILES.find(({ name }) => name === 'codex'), defaultModel: 'gpt-6.1-sol' };

    return {
        agentProfiles: [profile],
        agentSelection: {
            activeAgent: 'codex', permissionMode: 'ask-for-approval',
            settingsByAgent: { codex: { model: 'gpt-6.1-sol', thinkingLevel: 'max', speedMode } },
        },
    };
}

describe('agent execution settings', () => {
    it.each([false, true])('prepares selected settings without reading model lists when streaming is %s', (streaming) => {
        const loadCatalog = vi.spyOn(AgentModelCatalogService.prototype, 'load').mockRejectedValue(new Error('Catalog unavailable'));
        try {
            const resolved = resolveAgentExecution(config('fast'), { model: 'new-model', thinkingLevel: 'high' }, streaming);

            expect(resolved.executionSettings).toEqual({ model: 'new-model', effort: 'high', serviceTier: 'priority' });
            expect(loadCatalog).not.toHaveBeenCalled();
        } finally {
            loadCatalog.mockRestore();
        }
    });

    it('applies Fast settings and retains them during one-shot resume', () => {
        const resolved = resolveAgentExecution(config('fast'), {}, false);
        expect(resolved.command).toContain('service_tier="priority"');
        expect(resolved.command).toContain('features.fast_mode=true');
        expect(resolved.executionSettings).toEqual({ model: 'gpt-6.1-sol', effort: 'xhigh', serviceTier: 'priority' });
        const resumed = buildResumeAgentCommand(resolved.profile, 'saved-session', resolved.command);
        expect(resumed).toContain('service_tier="priority"');
        expect(resumed.slice(-4)).toEqual(['exec', 'resume', '--json', 'saved-session']);
    });

    it('explicitly clears Fast for Standard and leaves provider default unoverridden', () => {
        const standard = resolveAgentExecution(config('standard'), {}, true);
        expect(standard.executionSettings.serviceTier).toBe('default');
        expect(standard.command).toContain('service_tier="default"');
        const inherited = resolveAgentExecution(config('default'), {}, true);
        expect(inherited.executionSettings).not.toHaveProperty('serviceTier');
        expect(inherited.command.some((value) => value.startsWith('service_tier='))).toBe(false);
    });

    it('preserves a selected model without adding a reasoning override for none', () => {
        const resolved = resolveAgentExecution(config('default'), { model: 'new-model', thinkingLevel: 'none' }, true);

        expect(resolved.executionSettings).toEqual({ model: 'new-model' });
    });
});
