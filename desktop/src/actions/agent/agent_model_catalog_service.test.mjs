import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { AgentModelCatalogService } = require('./agent_model_catalog_service');
const { BUILTIN_AGENT_PROFILES, buildResumeAgentCommand } = require('./agent_profiles.mjs');

function codexModel(model = 'gpt-6.1-sol') {
    return {
        id: 'picker-entry', model, displayName: 'Runtime model', hidden: false,
        supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'xhigh' }],
        serviceTiers: [{ id: 'priority', name: 'Fast', description: 'Increased usage' }],
    };
}

function codexProfile() {
    return { ...BUILTIN_AGENT_PROFILES.find(({ name }) => name === 'codex'), defaultModel: 'gpt-6.1-sol' };
}

function serviceFixture(overrides = {}) {
    const probes = [];
    const request = vi.fn(async (method) => {
        if (method === 'model/list') return { data: [codexModel()], nextCursor: null };
        if (method === 'config/read') return { config: { model_provider: 'openai' } };
        if (method === 'configRequirements/read') return { requirements: null };
        return {};
    });
    const createProbe = vi.fn(() => {
        const probe = { start: vi.fn(), request, write: vi.fn(), close: vi.fn(async () => undefined) };
        probes.push(probe);
        return probe;
    });
    const service = new AgentModelCatalogService({
        createProbe, executableResolver: { find: vi.fn(async () => '/clients/codex') },
        fingerprint: vi.fn(async () => 'client-fingerprint'), settingsFingerprint: vi.fn(async () => 'settings-fingerprint'),
        environment: {}, ...overrides,
    });

    return { service, createProbe, probes, request };
}

function config(speedMode) {
    return {
        agentProfiles: [codexProfile()],
        agentSelection: {
            activeAgent: 'codex', permissionMode: 'ask-for-approval',
            settingsByAgent: { codex: { model: 'gpt-6.1-sol', thinkingLevel: 'max', speedMode } },
        },
    };
}

describe('host model catalogs', () => {
    it('discovers a new execution ID independently of the old profile list', async () => {
        const { service, probes } = serviceFixture();
        const catalog = await service.load(codexProfile(), '/project');

        expect(catalog.models[0].id).toBe('gpt-6.1-sol');
        expect(catalog.models[0].serviceTiers[0].id).toBe('priority');
        expect(probes[0].request.mock.calls.map(([method]) => method))
            .toEqual(['initialize', 'model/list', 'config/read', 'configRequirements/read']);
        expect(probes[0].close).toHaveBeenCalledOnce();
    });

    it('deduplicates concurrent reads and refreshes only the requested context', async () => {
        const { service, createProbe } = serviceFixture();
        await Promise.all([service.load(codexProfile(), '/project'), service.load(codexProfile(), '/project')]);
        expect(createProbe).toHaveBeenCalledOnce();
        await service.load(codexProfile(), '/worktree');
        await service.load(codexProfile(), '/project');
        expect(createProbe).toHaveBeenCalledTimes(2);
        await service.load(codexProfile(), '/project', true);
        expect(createProbe).toHaveBeenCalledTimes(3);
    });

    it('invalidates cached catalogs after expiry and changed executable settings', async () => {
        let observedAt = 0;
        let fingerprint = 'before';
        const { service, createProbe } = serviceFixture({ now: () => observedAt, fingerprint: async () => fingerprint });
        await service.load(codexProfile(), '/project');
        observedAt = 24 * 60 * 60 * 1000;
        await service.load(codexProfile(), '/project');
        fingerprint = 'after';
        await service.load(codexProfile(), '/project');
        expect(createProbe).toHaveBeenCalledTimes(3);
    });

    it('reads every page and rejects repeated cursors while cleaning up', async () => {
        const { service, request, probes } = serviceFixture();
        request.mockImplementation(async (method, params) => {
            if (method === 'model/list') {
                return { data: [codexModel(params.cursor ? 'second-model' : 'first-model')], nextCursor: 'repeated' };
            }
            return {};
        });
        await expect(service.load(codexProfile(), '/project')).rejects.toThrow('repeated');
        expect(probes[0].close).toHaveBeenCalledOnce();
    });

    it('keeps configured custom profiles independent of provider processes', async () => {
        const { service, createProbe } = serviceFixture();
        const profile = { name: 'custom', command: ['custom'], models: ['manual-id'], defaultThinkingLevel: 'none' };
        const catalog = await service.load(profile, '/project');
        expect(catalog.source).toBe('configured');
        expect(catalog.models[0].id).toBe('manual-id');
        expect(createProbe).not.toHaveBeenCalled();
    });

    it('preserves Claude aliases and resolved IDs without exposing its account metadata', async () => {
        const { service, request } = serviceFixture();
        request.mockResolvedValue({
            models: [{ value: 'opus', resolvedModel: 'claude-new-opus', displayName: 'Opus', supportedEffortLevels: ['medium'] }],
            account: { email: 'private@example.com' },
        });
        const profile = BUILTIN_AGENT_PROFILES.find(({ name }) => name === 'claude');
        const catalog = await service.load(profile, '/project');
        expect(catalog.models[0]).toMatchObject({ id: 'opus', resolvedModel: 'claude-new-opus', serviceTiers: [] });
        expect(catalog).not.toHaveProperty('account');
    });
});

describe('catalog-validated execution', () => {
    it('applies verified Fast tiers and retains them during one-shot resume', async () => {
        const { service } = serviceFixture();
        const resolved = await service.resolveExecution(config('fast'), {}, false, '/project');
        expect(resolved.command).toContain('service_tier="priority"');
        expect(resolved.command).toContain('features.fast_mode=true');
        expect(resolved.executionSettings).toEqual({ model: 'gpt-6.1-sol', effort: 'xhigh', serviceTier: 'priority' });
        const resumed = buildResumeAgentCommand(resolved.profile, 'saved-session', resolved.command);
        expect(resumed).toContain('service_tier="priority"');
        expect(resumed.slice(-4)).toEqual(['exec', 'resume', '--json', 'saved-session']);
    });

    it('explicitly clears Fast for Standard and leaves provider default unoverridden', async () => {
        const { service } = serviceFixture();
        const standard = await service.resolveExecution(config('standard'), {}, true, '/project');
        expect(standard.executionSettings.serviceTier).toBe('default');
        expect(standard.command).toContain('service_tier="default"');
        const inherited = await service.resolveExecution(config('default'), {}, true, '/project');
        expect(inherited.executionSettings).not.toHaveProperty('serviceTier');
        expect(inherited.command.some((value) => value.startsWith('service_tier='))).toBe(false);
    });

    it('blocks unadvertised models, unsupported effort, and non-OpenAI Fast before execution', async () => {
        const { service, request } = serviceFixture();
        await expect(service.resolveExecution(config('default'), { model: 'unadvertised' }, true, '/project')).rejects.toThrow('not advertised');
        await expect(service.resolveExecution(config('default'), { thinkingLevel: 'high' }, true, '/project')).rejects.toThrow('reasoning level');
        request.mockImplementation(async (method) => {
            if (method === 'model/list') return { data: [codexModel()], nextCursor: null };
            if (method === 'configRequirements/read') return { requirements: null };
            return method === 'config/read' ? { config: { model_provider: 'other-provider' } } : {};
        });
        await service.load(codexProfile(), '/project', true);
        await expect(service.resolveExecution(config('fast'), {}, true, '/project')).rejects.toThrow('only by the OpenAI');
    });

    it('blocks Fast when managed feature requirements disable it', async () => {
        const { service, request } = serviceFixture();
        request.mockImplementation(async (method) => {
            if (method === 'model/list') return { data: [codexModel()], nextCursor: null };
            if (method === 'config/read') return { config: { model_provider: 'openai' } };
            if (method === 'configRequirements/read') return { requirements: { featureRequirements: { fast_mode: false } } };
            return {};
        });
        await expect(service.resolveExecution(config('fast'), {}, true, '/project')).rejects.toThrow('Fast mode is not advertised');
    });
});
