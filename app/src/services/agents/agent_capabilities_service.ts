import { supportsModelDiscovery, type AgentProfile } from '../../data/agent_profiles';
import { validateAgentModelCatalog, type AgentModelCatalog } from '../../data/agent_model_catalog';
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
    getModelCatalog(profile: AgentProfile, refresh: boolean): Promise<AgentModelCatalog>;
    getConnectionIdentity(): unknown;
    onModelCatalogChanged?(callback: (catalog: AgentModelCatalog) => void): () => void;
}

const EMPTY_CATALOG: AgentCatalogSnapshot = { catalog: null, error: null, loading: false };
const EMPTY_SNAPSHOT: AgentCapabilitiesSnapshot = { availability: { error: null, loading: false, values: {} } };

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Agent capability request failed';
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
    async getModelCatalog(profile, refresh) {
        const bridge = currentBridge();
        if (!bridge?.loadAgentModelCatalog) throw new Error('Model discovery requires the desktop host');

        return bridge.loadAgentModelCatalog({ agent: profile.name, profile, refresh });
    },
    onModelCatalogChanged(callback) {
        const bridge = currentBridge();

        return bridge?.onAgentModelCatalogChanged?.(callback) ?? (() => undefined);
    },
};

/** Displays the host's global model lists; no project, connection or freshness cache. */
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

    getCatalogSnapshot(agent: string) {
        return this.catalogs.get(agent) ?? EMPTY_CATALOG;
    }

    initialize() {
        if (!this.availabilityPromise) {
            this.subscribeToCatalogs();
            this.availabilityPromise = this.loadAvailability();
        }

        return this.availabilityPromise;
    }

    /** Discover available built-in agents once during application startup. */
    async refreshStartupCatalogs(profiles: AgentProfile[]) {
        await this.initialize();
        for (const profile of profiles) {
            if (!supportsModelDiscovery(profile) || !this.snapshot.availability.values[profile.name]?.available) continue;
            await this.loadCatalog(profile, true);
        }
    }

    /** Reconnect availability and model notifications without discarding the shared lists. */
    reload() {
        this.subscribeToCatalogs();
        this.availabilityPromise = this.loadAvailability();

        return this.availabilityPromise;
    }

    loadCatalog(profile: AgentProfile, refresh = false) {
        const pending = this.pendingCatalogs.get(profile.name);
        if (pending) return pending;
        const previous = this.getCatalogSnapshot(profile.name);
        this.catalogs.set(profile.name, { ...previous, error: null, loading: true });
        const request = this.readCatalog(profile, refresh);
        this.pendingCatalogs.set(profile.name, request);
        this.dispatchEvent(new Event(`catalog:${profile.name}`));

        return request;
    }

    private subscribeToCatalogs() {
        this.unsubscribeCatalogs?.();
        this.unsubscribeCatalogs = this.provider.onModelCatalogChanged?.(this.applyCatalog) ?? null;
    }

    private applyCatalog(catalog: AgentModelCatalog) {
        this.catalogs.set(catalog.agent, { catalog, error: null, loading: this.pendingCatalogs.has(catalog.agent) });
        this.dispatchEvent(new Event(`catalog:${catalog.agent}`));
    }

    private async readCatalog(profile: AgentProfile, refresh: boolean) {
        await Promise.resolve();
        try {
            const catalog = validateAgentModelCatalog(await this.provider.getModelCatalog(profile, refresh));
            if (catalog.agent !== profile.name) throw new Error('Model catalog belongs to a different agent');
            this.catalogs.set(profile.name, { catalog, error: null, loading: false });
        } catch (error) {
            this.catalogs.set(profile.name, {
                catalog: this.getCatalogSnapshot(profile.name).catalog,
                error: errorMessage(error),
                loading: false,
            });
        } finally {
            this.pendingCatalogs.delete(profile.name);
        }
        this.dispatchEvent(new Event(`catalog:${profile.name}`));
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
