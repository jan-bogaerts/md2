import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const fs = require('node:fs/promises');
const path = require('node:path');
const { AgentModelCatalogService } = require('./agent_model_catalog_service');
const { BUILTIN_AGENT_PROFILES } = require('./agent_profiles.mjs');

const INITIAL_CODEX_ACCOUNT = { id: 'codex-initial', agent: 'codex', kind: 'initial', name: 'Default' };
const WORK_CODEX_ACCOUNT = {id: '11111111-1111-4111-8111-111111111111', agent: 'codex', kind: 'directory', name: 'work', configDirectory: '/accounts/work'};

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
        return {};
    });
    const createProbe = vi.fn(() => {
        const probe = { start: vi.fn(), request, write: vi.fn(), close: vi.fn(async () => undefined) };
        probes.push(probe);
        return probe;
    });
    const service = new AgentModelCatalogService({
        createProbe, executableResolver: { find: vi.fn(async () => '/clients/codex') },
        environment: {}, workingDirectory: '/global', ...overrides,
    });

    return { service, createProbe, probes, request };
}

describe('host model catalogs', () => {
    it('discovers a new execution ID independently of the old profile list', async () => {
        const { service, probes } = serviceFixture();
        const catalog = await service.load(codexProfile(), INITIAL_CODEX_ACCOUNT, true);

        expect(catalog.models[0].id).toBe('gpt-6.1-sol');
        expect(probes[0].request.mock.calls.map(([method]) => method))
            .toEqual(['initialize', 'model/list']);
        expect(probes[0].close).toHaveBeenCalledOnce();
    });

    it('shares one list per agent and deduplicates concurrent refreshes', async () => {
        const { service, createProbe, probes } = serviceFixture();
        const [first, duplicate] = await Promise.all([
            service.load(codexProfile(), INITIAL_CODEX_ACCOUNT, true),
            service.load(codexProfile(), INITIAL_CODEX_ACCOUNT, true),
        ]);
        expect(duplicate).toBe(first);
        expect(createProbe).toHaveBeenCalledOnce();
        const differentProfile = { ...codexProfile(), command: ['/another/codex'] };
        expect(await service.load(differentProfile, INITIAL_CODEX_ACCOUNT)).toBe(first);
        expect(probes[0].start).toHaveBeenCalledWith('/clients/codex', expect.any(Array), { cwd: '/global', env: expect.any(Object) });
    });

    it('announces refreshed lists to all subscribers and retains the list if refresh fails', async () => {
        const { service, request } = serviceFixture();
        const listener = vi.fn();
        service.addEventListener('catalog', listener);
        const catalog = await service.load(codexProfile(), INITIAL_CODEX_ACCOUNT, true);
        expect(listener.mock.calls[0][0].detail).toBe(catalog);
        request.mockRejectedValueOnce(new Error('Discovery failed'));
        await expect(service.load(codexProfile(), INITIAL_CODEX_ACCOUNT, true)).rejects.toThrow('Discovery failed');
        expect(await service.load(codexProfile(), INITIAL_CODEX_ACCOUNT)).toBe(catalog);
    });

    it('reads discovered models without checking file metadata', async () => {
        const readFileMetadata = vi.spyOn(fs, 'stat').mockRejectedValue(new Error('File metadata is unavailable'));
        const { service, createProbe } = serviceFixture();
        try {
            const catalog = await service.load(codexProfile(), INITIAL_CODEX_ACCOUNT, true);
            expect(await service.load(codexProfile(), INITIAL_CODEX_ACCOUNT)).toBe(catalog);

            expect(readFileMetadata).not.toHaveBeenCalled();
            expect(createProbe).toHaveBeenCalledOnce();
        } finally {
            readFileMetadata.mockRestore();
        }
    });

    it('reads every page and rejects repeated cursors while cleaning up', async () => {
        const { service, request, probes } = serviceFixture();
        request.mockImplementation(async (method, params) => {
            if (method === 'model/list') {
                return { data: [codexModel(params.cursor ? 'second-model' : 'first-model')], nextCursor: 'repeated' };
            }
            return {};
        });
        await expect(service.load(codexProfile(), INITIAL_CODEX_ACCOUNT, true)).rejects.toThrow('repeated');
        expect(probes[0].close).toHaveBeenCalledOnce();
    });

    it('keeps configured custom profiles independent of provider processes', async () => {
        const { service, createProbe } = serviceFixture();
        const profile = { name: 'custom', command: ['custom'], models: ['manual-id'], defaultThinkingLevel: 'none' };
        const catalog = await service.load(profile, null);
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
        const catalog = await service.load(profile, { id: 'claude-initial', agent: 'claude', kind: 'initial', name: 'Default' }, true);
        expect(catalog.models[0]).toMatchObject({ id: 'opus', resolvedModel: 'claude-new-opus' });
        expect(catalog).not.toHaveProperty('account');
    });

    it('caches, refreshes and publishes the catalogs of two accounts independently', async () => {
        const { service, createProbe, probes } = serviceFixture();
        const listener = vi.fn();
        service.addEventListener('catalog', listener);

        const initial = await service.load(codexProfile(), INITIAL_CODEX_ACCOUNT, true);
        const work = await service.load(codexProfile(), WORK_CODEX_ACCOUNT, true);

        expect(createProbe).toHaveBeenCalledTimes(2);
        expect(initial.accountId).toBe('codex-initial');
        expect(work.accountId).toBe(WORK_CODEX_ACCOUNT.id);
        expect(await service.load(codexProfile(), INITIAL_CODEX_ACCOUNT)).toBe(initial);
        expect(await service.load(codexProfile(), WORK_CODEX_ACCOUNT)).toBe(work);
        expect(listener.mock.calls.map(([event]) => event.detail.accountId)).toEqual(['codex-initial', WORK_CODEX_ACCOUNT.id]);
        expect(probes[0].start.mock.calls[0][2].env).not.toHaveProperty('CODEX_HOME');
        expect(probes[1].start.mock.calls[0][2].env.CODEX_HOME).toBe(path.resolve('/accounts/work'));
    });

    it('keeps another account catalog available when discovery fails for one account', async () => {
        const { service, request } = serviceFixture();
        const initial = await service.load(codexProfile(), INITIAL_CODEX_ACCOUNT, true);
        request.mockRejectedValueOnce(new Error('Login required'));

        await expect(service.load(codexProfile(), WORK_CODEX_ACCOUNT, true)).rejects.toThrow('Login required');

        expect(await service.load(codexProfile(), INITIAL_CODEX_ACCOUNT)).toBe(initial);
    });
});
