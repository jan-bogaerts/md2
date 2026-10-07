import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentModelCatalog } from '../../data/agent_model_catalog';
import { mergeAgentProfiles } from '../../data/agent_profiles';
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge';
import { agentCatalogFixture } from '../../test/agent_catalog_fixture';
import { AgentCapabilitiesService, type AgentCapabilitiesProvider } from './agent_capabilities_service';

const profiles = mergeAgentProfiles([]);
const codex = profiles[0];
const claude = profiles[1];

function provider(overrides: Partial<AgentCapabilitiesProvider> = {}): AgentCapabilitiesProvider {
    return {
        getAgentAvailability: vi.fn(async () => ({ codex: { available: true, error: null } })),
        getConnectionIdentity: () => 'host',
        getModelCatalog: vi.fn(async (profile) => agentCatalogFixture(profile)),
        ...overrides,
    };
}

describe('AgentCapabilitiesService', () => {
    afterEach(() => {
        setActionBridgeOverride(null);
        delete window.md2Data;
    });

    it('allows retry after discovery fails and retains the previous list', async () => {
        const capabilities = provider();
        const service = new AgentCapabilitiesService(capabilities);
        await service.loadCatalog(codex);
        const catalog = service.getCatalogSnapshot('codex').catalog;
        vi.mocked(capabilities.getModelCatalog).mockImplementationOnce(() => { throw new Error('Client unavailable'); });
        await service.loadCatalog(codex, true);
        expect(service.getCatalogSnapshot('codex')).toEqual({ catalog, error: 'Client unavailable', loading: false });
        await service.loadCatalog(codex, true);
        expect(service.getCatalogSnapshot('codex').error).toBeNull();
    });

    it('deduplicates concurrent requests by agent without notifying availability subscribers', async () => {
        let resolveCatalog: (catalog: AgentModelCatalog) => void = () => undefined;
        const promise = new Promise<AgentModelCatalog>((resolve) => { resolveCatalog = resolve; });
        const capabilities = provider({
            getModelCatalog: vi.fn(async (profile) => profile.name === 'codex'
                ? await promise : agentCatalogFixture(profile)),
        });
        const service = new AgentCapabilitiesService(capabilities);
        const changed = vi.fn();
        service.addEventListener('changed', changed);
        const first = service.loadCatalog(codex);
        const duplicate = service.loadCatalog({ ...codex, command: ['/draft/codex'] });
        await service.loadCatalog(claude);
        resolveCatalog(agentCatalogFixture(codex));
        await Promise.all([first, duplicate]);
        expect(capabilities.getModelCatalog).toHaveBeenCalledTimes(2);
        expect(service.getCatalogSnapshot('codex').catalog?.agent).toBe('codex');
        expect(service.getCatalogSnapshot('claude').catalog?.agent).toBe('claude');
        expect(changed).not.toHaveBeenCalled();
    });

    it('reads from the host on request instead of serving a separate renderer cache', async () => {
        const capabilities = provider();
        const service = new AgentCapabilitiesService(capabilities);
        await service.loadCatalog(codex);
        await service.loadCatalog(codex);
        expect(capabilities.getModelCatalog).toHaveBeenCalledTimes(2);
        expect(capabilities.getModelCatalog).toHaveBeenLastCalledWith(codex, false);
    });

    it('discovers available built-in agents during startup', async () => {
        const capabilities = provider();
        const service = new AgentCapabilitiesService(capabilities);
        await service.refreshStartupCatalogs(profiles);
        expect(capabilities.getModelCatalog).toHaveBeenCalledExactlyOnceWith(codex, true);
    });

    it('keeps one shared list across connection reloads and applies host notifications', async () => {
        const events = new EventTarget();
        const capabilities = provider({
            onModelCatalogChanged: (callback) => {
                const listener = (event: Event) => callback((event as CustomEvent<AgentModelCatalog>).detail);
                events.addEventListener('catalog', listener);
                return () => events.removeEventListener('catalog', listener);
            },
        });
        const service = new AgentCapabilitiesService(capabilities);
        await service.initialize();
        await service.loadCatalog(codex);
        const original = service.getCatalogSnapshot('codex').catalog;
        await service.reload();
        expect(service.getCatalogSnapshot('codex').catalog).toBe(original);
        const changed = vi.fn();
        service.addEventListener('catalog:codex', changed);
        const catalog = agentCatalogFixture(codex, ['shared-new-model']);
        events.dispatchEvent(new CustomEvent('catalog', { detail: catalog }));
        expect(service.getCatalogSnapshot('codex').catalog).toBe(catalog);
        expect(changed).toHaveBeenCalledOnce();
    });

    it('accepts an empty picker list and rejects malformed or cross-agent payloads', async () => {
        const capabilities = provider({ getModelCatalog: vi.fn(async (profile) => agentCatalogFixture(profile, [])) });
        const service = new AgentCapabilitiesService(capabilities);
        await service.loadCatalog(codex);
        expect(service.getCatalogSnapshot('codex').catalog?.models).toEqual([]);
        const invalidCatalogs = [{ agent: 'codex', models: null }, agentCatalogFixture(claude)];
        for (const catalog of invalidCatalogs) {
            const invalidProvider = provider({ getModelCatalog: vi.fn(async () => catalog as AgentModelCatalog) });
            const invalidService = new AgentCapabilitiesService(invalidProvider);
            await invalidService.loadCatalog(codex);
            expect(invalidService.getCatalogSnapshot('codex').error).toBeTruthy();
        }
    });

    it('requests the same global catalog through the active action bridge without project data', async () => {
        const local = vi.fn();
        window.md2Data = { loadAgentModelCatalog: local } as unknown as typeof window.md2Data;
        const remote = { loadAgentModelCatalog: vi.fn(async () => agentCatalogFixture(codex, ['shared-model'])) };
        setActionBridgeOverride(remote as unknown as ElectronActionBridge);
        const service = new AgentCapabilitiesService();
        await service.loadCatalog(codex, true);
        expect(local).not.toHaveBeenCalled();
        expect(remote.loadAgentModelCatalog).toHaveBeenCalledWith({ agent: 'codex', profile: codex, refresh: true });
        expect(service.getCatalogSnapshot('codex').catalog?.models[0].id).toBe('shared-model');
    });
});
