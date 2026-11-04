import { supportsModelDiscovery, type AgentProfile } from '../../data/agent_profiles';
import { validateAgentModelCatalog, type AgentModelCatalog } from '../../data/agent_model_catalog';
import { initialAgentAccountId, supportsAgentAccounts } from '../../data/agent_accounts';
import { getElectronDataBridge, type AgentAvailability } from '../../data/electron_data_bridge';
import { getElectronActionBridge } from '../../data/electron_action_bridge';
import { register } from '../service_injector';

export interface CapabilityState<T> {
    error: string | null;
    loading: boolean;
    values: T;
}

export interface AgentCapabilitiesSnapshot {
    availability: CapabilityState<Record<string, AgentAvailability>>;
}

export interface AgentCatalogSnapshot {
    catalog: AgentModelCatalog | null;
    error: string | null;
    loading: boolean;
}

export interface AgentCapabilitiesProvider {
    getAgentAvailability(): Promise<Record<string, AgentAvailability>>;
    getModelCatalog(profile: AgentProfile, accountId: string | undefined, refresh: boolean): Promise<AgentModelCatalog>;
    getConnectionIdentity(): unknown;
    onModelCatalogChanged?(callback: (catalog: AgentModelCatalog) => void): () => void;
}

const EMPTY_CATALOG: AgentCatalogSnapshot = { catalog: null, error: null, loading: false };
const EMPTY_SNAPSHOT: AgentCapabilitiesSnapshot = { availability: { error: null, loading: false, values: {} } };

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Agent capability request failed';
}

/** A missing account ID means the agent's initial account; agents without accounts have none. */
function resolveCatalogAccountId(agent: string, accountId: string | undefined) {
    if (!supportsAgentAccounts(agent)) return null;

    return accountId ?? initialAgentAccountId(agent);
}

function catalogKey(agent: string, accountId: string | null) {
    return `${agent}:${accountId ?? ''}`;
}

/** Scoped change event of one agent account catalog. */
export function agentCatalogChangedEvent(agent: string, accountId: string | undefined) {
    return `catalog:${catalogKey(agent, resolveCatalogAccountId(agent, accountId))}`;
}

function currentBridge() {
    return getElectronActionBridge() ?? getElectronDataBridge();
}

const hostProvider: AgentCapabilitiesProvider = {
    getConnectionIdentity: currentBridge,
    async getAgentAvailability() {
        const bridge = currentBridge();
        if (!bridge?.loadAgentAvailability) throw new Error('Agent executable availability requires the Electron desktop app');

        return bridge.loadAgentAvailability();
    },
    async getModelCatalog(profile, accountId, refresh) {
        const bridge = currentBridge();
        if (!bridge?.loadAgentModelCatalog) throw new Error('Model discovery requires the desktop host');
        const request = { agent: profile.name, ...(accountId ? { accountId } : {}), profile, refresh };

        return bridge.loadAgentModelCatalog(request);
    },
    onModelCatalogChanged(callback) {
        const bridge = currentBridge();

        return bridge?.onAgentModelCatalogChanged?.(callback) ?? (() => undefined);
    },
};

/** Displays the host's global model lists per agent account; no project, connection or freshness cache. */
export class AgentCapabilitiesService extends EventTarget {
    private availabilityPromise: Promise<void> | null = null;
    private availabilityRequest: object | null = null;
    private readonly catalogs = new Map<string, AgentCatalogSnapshot>();
    private readonly pendingCatalogs = new Map<string, Promise<void>>();
    private readonly provider: AgentCapabilitiesProvider;
    private snapshot = EMPTY_SNAPSHOT;
    private unsubscribeCatalogs: (() => void) | null = null;

    constructor(provider: AgentCapabilitiesProvider = hostProvider) {
        super();
        this.provider = provider;
        this.applyCatalog = this.applyCatalog.bind(this);
        register('agentCapabilitiesService', this);
    }

    getSnapshot() {
        return this.snapshot;
    }

    getCatalogSnapshot(agent: string, accountId?: string) {
        return this.catalogs.get(catalogKey(agent, resolveCatalogAccountId(agent, accountId))) ?? EMPTY_CATALOG;
    }

    initialize() {
        if (!this.availabilityPromise) {
            this.subscribeToCatalogs();
            this.availabilityPromise = this.loadAvailability();
        }

        return this.availabilityPromise;
    }

    /** Discover available built-in agents once during application startup, each for its selected account. */
    async refreshStartupCatalogs(profiles: AgentProfile[], selectedAccountIds: Record<string, string | undefined>) {
        await this.initialize();
        for (const profile of profiles) {
            if (!supportsModelDiscovery(profile) || !this.snapshot.availability.values[profile.name]?.available) continue;
            await this.loadCatalog(profile, selectedAccountIds[profile.name], true);
        }
    }

    /** Reconnect availability and model notifications without discarding the shared lists. */
    reload() {
        this.subscribeToCatalogs();
        this.availabilityPromise = this.loadAvailability();

        return this.availabilityPromise;
    }

    /** Loads one agent account catalog; a missing account ID means the agent's initial account. */
    loadCatalog(profile: AgentProfile, accountId?: string, refresh = false) {
        const key = catalogKey(profile.name, resolveCatalogAccountId(profile.name, accountId));
        const pending = this.pendingCatalogs.get(key);
        if (pending) return pending;
        const previous = this.catalogs.get(key) ?? EMPTY_CATALOG;
        this.catalogs.set(key, { ...previous, error: null, loading: true });
        const request = this.readCatalog(profile, accountId, key, refresh);
        this.pendingCatalogs.set(key, request);
        this.dispatchEvent(new Event(`catalog:${key}`));

        return request;
    }

    private subscribeToCatalogs() {
        this.unsubscribeCatalogs?.();
        this.unsubscribeCatalogs = this.provider.onModelCatalogChanged?.(this.applyCatalog) ?? null;
    }

    private applyCatalog(catalog: AgentModelCatalog) {
        const key = catalogKey(catalog.agent, catalog.accountId);
        this.catalogs.set(key, { catalog, error: null, loading: this.pendingCatalogs.has(key) });
        this.dispatchEvent(new Event(`catalog:${key}`));
    }

    private async readCatalog(profile: AgentProfile, accountId: string | undefined, key: string, refresh: boolean) {
        await Promise.resolve();
        try {
            const catalog = validateAgentModelCatalog(await this.provider.getModelCatalog(profile, accountId, refresh));
            if (catalog.agent !== profile.name) throw new Error('Model catalog belongs to a different agent');
            if (catalogKey(catalog.agent, catalog.accountId) !== key) throw new Error('Model catalog belongs to a different account');
            this.catalogs.set(key, { catalog, error: null, loading: false });
        } catch (error) {
            this.catalogs.set(key, { catalog: this.catalogs.get(key)?.catalog ?? null, error: errorMessage(error), loading: false });
        } finally {
            this.pendingCatalogs.delete(key);
        }
        this.dispatchEvent(new Event(`catalog:${key}`));
    }

    private async loadAvailability() {
        const request = {};
        const connection = this.provider.getConnectionIdentity();
        this.availabilityRequest = request;
        this.snapshot = { availability: { error: null, loading: true, values: {} } };
        this.dispatchEvent(new Event('changed'));
        try {
            const values = await this.provider.getAgentAvailability();
            if (request !== this.availabilityRequest || connection !== this.provider.getConnectionIdentity()) return;
            this.snapshot = { availability: { error: null, loading: false, values } };
        } catch (error) {
            if (request !== this.availabilityRequest || connection !== this.provider.getConnectionIdentity()) return;
            this.snapshot = { availability: { error: errorMessage(error), loading: false, values: {} } };
        }
        this.dispatchEvent(new Event('changed'));
    }
}

export const agentCapabilitiesService = new AgentCapabilitiesService();
