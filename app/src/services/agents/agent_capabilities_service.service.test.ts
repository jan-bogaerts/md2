import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentModelCatalog } from '../../data/agent_model_catalog';
import { mergeAgentProfiles, type AgentProfile } from '../../data/agent_profiles';
import type { ProjectReference } from '../../data/data_types';
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge';
import { agentCatalogFixture } from '../../test/agent_catalog_fixture';
import { AgentCapabilitiesService, agentCatalogKey, type AgentCapabilitiesProvider } from './agent_capabilities_service';

const profiles = mergeAgentProfiles([]);
const codex = profiles.find(({ name }) => name === 'codex')!;
const claude = profiles.find(({ name }) => name === 'claude')!;
const project: ProjectReference = { branch: 'main', id: 'repo', rootPath: '/repo' };

function deferredValue<T>() {
    let resolveValue: (value: T) => void = () => undefined;
    const promise = new Promise<T>((resolve) => { resolveValue = resolve; });

    return { promise, resolve: resolveValue };
}

function provider(overrides: Partial<AgentCapabilitiesProvider> = {}): AgentCapabilitiesProvider {
    return {
        getAgentAvailability: vi.fn(async () => ({ codex: { available: true, error: null } })),
        getConnectionIdentity: () => 'host-1',
        getModelCatalog: vi.fn(async (profile) => agentCatalogFixture(profile, [profile.name === 'codex' ? 'gpt-6.1-sol' : 'sonnet'])),
        ...overrides,
    };
}

describe('AgentCapabilitiesService', () => {
    afterEach(() => {
        vi.useRealTimers();
        setActionBridgeOverride(null);
        delete window.md2Data;
    });

    it('allows retry after a provider rejects discovery synchronously', async () => {
        const capabilities = provider({ getModelCatalog: vi.fn(() => { throw new Error('Client unavailable'); }) });
        const service = new AgentCapabilitiesService(capabilities);
        const key = agentCatalogKey(codex, project);
        await service.loadCatalog(codex, project);
        expect(service.getCatalogSnapshot(key).error).toBe('Client unavailable');
        vi.mocked(capabilities.getModelCatalog).mockResolvedValue(agentCatalogFixture(codex, ['gpt-6.1-sol']));

        await service.loadCatalog(codex, project, true);

        expect(service.getCatalogSnapshot(key).catalog?.models[0].id).toBe('gpt-6.1-sol');
        expect(service.getCatalogSnapshot(key).error).toBeNull();
    });

    it('keeps catalogs scoped while deduplicating requests for the same context', async () => {
        const pending = deferredValue<AgentModelCatalog>();
        const capabilities = provider({
            getModelCatalog: vi.fn(async (profile) => profile.name === 'codex'
                ? await pending.promise : agentCatalogFixture(profile, ['sonnet'])),
        });
        const service = new AgentCapabilitiesService(capabilities);
        const changed = vi.fn();
        service.addEventListener('changed', changed);
        const first = service.loadCatalog(codex, project);
        const duplicate = service.loadCatalog(codex, project);
        await service.loadCatalog(claude, project);
        pending.resolve(agentCatalogFixture(codex, ['gpt-6.1-sol']));
        await first;
        await duplicate;

        expect(capabilities.getModelCatalog).toHaveBeenCalledTimes(2);
        expect(service.getCatalogSnapshot(agentCatalogKey(codex, project)).catalog?.models[0].id).toBe('gpt-6.1-sol');
        expect(service.getCatalogSnapshot(agentCatalogKey(claude, project)).catalog?.models[0].id).toBe('sonnet');
        expect(changed).not.toHaveBeenCalled();
    });

    it('refreshes expired catalogs, uses draft commands, and separates working directories', async () => {
        vi.useFakeTimers();
        const capabilities = provider();
        const service = new AgentCapabilitiesService(capabilities);
        await service.loadCatalog(codex, project);
        await service.loadCatalog(codex, project);
        expect(capabilities.getModelCatalog).toHaveBeenCalledOnce();
        await service.loadCatalog(codex, project, true);
        const worktree = { ...project, rootPath: '/worktree' };
        const draft = { ...codex, command: ['/new/codex'] };
        await service.loadCatalog(codex, worktree);
        await service.loadCatalog(draft, project);
        expect(capabilities.getModelCatalog).toHaveBeenCalledWith(draft, project, false);
        await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
        expect(service.getCatalogSnapshot(agentCatalogKey(codex, project)).stale).toBe(true);
        await service.loadCatalog(codex, project, true);
        expect(capabilities.getModelCatalog).toHaveBeenCalledTimes(5);
    });

    it('discards in-flight catalog and availability responses from a previous host', async () => {
        const previous = deferredValue<AgentModelCatalog>();
        const previousAvailability = deferredValue<Record<string, { available: boolean; error: string | null }>>();
        let connection = 'host-1';
        const capabilities = provider({
            getAgentAvailability: vi.fn().mockImplementationOnce(async () => await previousAvailability.promise)
                .mockResolvedValue({ codex: { available: true, error: null } }),
            getConnectionIdentity: () => connection,
            getModelCatalog: vi.fn().mockImplementationOnce(async () => await previous.promise)
                .mockResolvedValue(agentCatalogFixture(codex, ['new-model'])),
        });
        const service = new AgentCapabilitiesService(capabilities);
        const oldCatalog = service.loadCatalog(codex, project);
        const oldAvailability = service.initialize();
        connection = 'host-2';
        await service.reload();
        await service.loadCatalog(codex, project);
        previous.resolve(agentCatalogFixture(codex, ['old-model']));
        previousAvailability.resolve({ codex: { available: false, error: 'Old host missing' } });
        await oldCatalog;
        await oldAvailability;

        expect(service.getCatalogSnapshot(agentCatalogKey(codex, project)).catalog?.models[0].id).toBe('new-model');
        expect(service.getSnapshot().availability.values.codex.available).toBe(true);
    });

    it('retains the last catalog as stale when refresh fails and allows retry', async () => {
        const capabilities = provider();
        const service = new AgentCapabilitiesService(capabilities);
        await service.loadCatalog(codex, project);
        vi.mocked(capabilities.getModelCatalog).mockRejectedValueOnce(new Error('Client disconnected'));
        await service.loadCatalog(codex, project, true);
        expect(service.getCatalogSnapshot(agentCatalogKey(codex, project))).toMatchObject({catalog: { models: [{ id: 'gpt-6.1-sol' }] }, error: 'Client disconnected', loading: false, stale: true});
        await service.loadCatalog(codex, project, true);
        expect(service.getCatalogSnapshot(agentCatalogKey(codex, project))).toMatchObject({ error: null, stale: false });
    });

    it('rejects malformed, empty, duplicated and cross-agent catalogs', async () => {
        const catalog = agentCatalogFixture(codex, ['gpt-6.1-sol']);
        const invalidCatalogs = [
            { ...catalog, models: [] },
            { ...catalog, models: [...catalog.models, ...catalog.models] },
            { ...catalog, models: [{ ...catalog.models[0], reasoningEfforts: undefined }] },
            { ...catalog, agent: 'claude' },
        ];
        for (const invalid of invalidCatalogs) {
            const service = new AgentCapabilitiesService(provider({ getModelCatalog: vi.fn(async () => invalid as AgentModelCatalog) }));
            await service.loadCatalog(codex, project);
            expect(service.getCatalogSnapshot(agentCatalogKey(codex, project)).error).toBeTruthy();
            expect(service.getCatalogSnapshot(agentCatalogKey(codex, project)).catalog).toBeNull();
        }
    });

    it('uses the active remote action bridge rather than local desktop capabilities', async () => {
        const local = vi.fn();
        window.md2Data = { loadAgentModelCatalog: local } as unknown as typeof window.md2Data;
        const remote = {
            loadAgentAvailability: vi.fn(async () => ({ codex: { available: true, error: null } })),
            loadAgentModelCatalog: vi.fn(async () => agentCatalogFixture(codex, ['remote-model'])),
        };
        setActionBridgeOverride(remote as unknown as ElectronActionBridge);
        const service = new AgentCapabilitiesService();
        await service.initialize();
        await service.loadCatalog(codex, project, true);

        expect(local).not.toHaveBeenCalled();
        expect(remote.loadAgentModelCatalog).toHaveBeenCalledWith({ agent: 'codex', profile: codex, project, refresh: true });
        expect(service.getCatalogSnapshot(agentCatalogKey(codex, project)).catalog?.models[0].id).toBe('remote-model');
    });

    it('keeps custom profiles configured and reports a clear error for an older builtin host', async () => {
        const custom: AgentProfile = { command: ['custom'], models: ['my-model'], defaultThinkingLevel: 'none', name: 'custom' };
        const service = new AgentCapabilitiesService();
        await service.loadCatalog(custom, project);
        expect(service.getCatalogSnapshot(agentCatalogKey(custom, project)).catalog?.source).toBe('configured');
        await service.loadCatalog(codex, project);
        expect(service.getCatalogSnapshot(agentCatalogKey(codex, project)).error).toBe('Dynamic model discovery requires an updated desktop host');
    });
});
