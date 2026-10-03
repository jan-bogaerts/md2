import { supportsModelDiscovery, type AgentProfile } from '../../data/agent_profiles';
import { validateAgentModelCatalog, type AgentModelCatalog } from '../../data/agent_model_catalog';
import type { ProjectReference } from '../../data/data_types';
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
    stale: boolean;
}

export interface AgentCapabilitiesProvider {
    getAgentAvailability(): Promise<Record<string, AgentAvailability>>;
    getModelCatalog(profile: AgentProfile, project: ProjectReference | null, refresh: boolean): Promise<AgentModelCatalog>;
    getConnectionIdentity(): unknown;
}

interface CatalogContext {
    connection: unknown;
    pending: Promise<void> | null;
    snapshot: AgentCatalogSnapshot;
    timer: ReturnType<typeof setTimeout> | null;
}

const CATALOG_TTL_MS = 5 * 60 * 1000;
const MAX_CATALOG_CONTEXTS = 32;
const EMPTY_CATALOG: AgentCatalogSnapshot = { catalog: null, error: null, loading: false, stale: false };
const EMPTY_SNAPSHOT: AgentCapabilitiesSnapshot = { availability: { error: null, loading: false, values: {} } };

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Agent capability request failed';
}

function currentBridge() {
    return getElectronActionBridge() ?? getElectronDataBridge();
}

function configuredCatalog(profile: AgentProfile): AgentModelCatalog {
    return {
        agent: profile.name,
        fetchedAt: Date.now(),
        models: profile.models.map((id) => ({ displayName: id, hidden: false, id, reasoningEfforts: null, serviceTiers: [] })),
        provider: profile.name,
        source: 'configured',
    };
}

const configuredProfileProvider: AgentCapabilitiesProvider = {
    getConnectionIdentity: currentBridge,
    async getAgentAvailability() {
        const bridge = currentBridge();
        if (!bridge?.loadAgentAvailability) throw new Error('Agent executable availability requires the Electron desktop app');

        return bridge.loadAgentAvailability();
    },
    async getModelCatalog(profile, project, refresh) {
        if (!supportsModelDiscovery(profile)) return configuredCatalog(profile);
        const bridge = currentBridge();
        if (!bridge?.loadAgentModelCatalog) throw new Error('Dynamic model discovery requires an updated desktop host');

        return bridge.loadAgentModelCatalog({ agent: profile.name, profile, ...(project ? { project } : {}), refresh });
    },
};

/** Identifies capability inputs; the connection itself is checked separately. */
export function agentCatalogKey(profile: AgentProfile, project: ProjectReference | null) {
    return JSON.stringify([profile, project?.id, project?.branch, project?.rootPath]);
}

/** Owns model catalogs per provider, host, profile and working directory. */
export class AgentCapabilitiesService extends EventTarget {
    private availabilityPromise: Promise<void> | null = null;
    private availabilityRequest: object | null = null;
    private readonly catalogs = new Map<string, CatalogContext>();
    private readonly provider: AgentCapabilitiesProvider;
    private snapshot = EMPTY_SNAPSHOT;

    constructor(provider: AgentCapabilitiesProvider = configuredProfileProvider) {
        super();
        this.provider = provider;
        register('agentCapabilitiesService', this);
    }

    getSnapshot() {
        return this.snapshot;
    }

    getConnectionIdentity() {
        return this.provider.getConnectionIdentity();
    }

    getCatalogSnapshot(key: string) {
        const context = this.catalogs.get(key);

        return context && context.connection === this.getConnectionIdentity() ? context.snapshot : EMPTY_CATALOG;
    }

    initialize() {
        if (!this.availabilityPromise) this.availabilityPromise = this.loadAvailability();

        return this.availabilityPromise;
    }

    /** Discard old host/configuration results when the active connection changes. */
    reload() {
        this.clearCatalogs();
        this.availabilityPromise = this.loadAvailability();

        return this.availabilityPromise;
    }

    loadCatalog(profile: AgentProfile, project: ProjectReference | null, refresh = false) {
        const key = agentCatalogKey(profile, project);
        const connection = this.getConnectionIdentity();
        const previous = this.catalogs.get(key);
        if (previous && previous.connection === connection && previous.pending) return previous.pending;
        if (previous && previous.connection === connection && previous.snapshot.catalog && !previous.snapshot.stale && !refresh) {
            return Promise.resolve();
        }
        if (previous?.timer) clearTimeout(previous.timer);
        if (!previous && this.catalogs.size >= MAX_CATALOG_CONTEXTS) this.evictOldestCatalog();
        const catalog = previous && previous.connection === connection ? previous.snapshot.catalog : null;
        const context: CatalogContext = {
            connection,
            pending: null,
            snapshot: { catalog, error: null, loading: true, stale: !!catalog },
            timer: null,
        };
        this.catalogs.set(key, context);
        context.pending = this.readCatalog(key, context, profile, project, refresh);
        this.dispatchEvent(new Event(`catalog:${key}`));

        return context.pending;
    }

    private clearCatalogs() {
        const keys = [...this.catalogs.keys()];
        for (const context of this.catalogs.values()) {
            if (context.timer) clearTimeout(context.timer);
        }
        this.catalogs.clear();
        for (const key of keys) this.dispatchEvent(new Event(`catalog:${key}`));
    }

    private evictOldestCatalog() {
        const key = this.catalogs.keys().next().value;
        if (key === undefined) return;
        const context = this.catalogs.get(key);
        if (context?.timer) clearTimeout(context.timer);
        this.catalogs.delete(key);
        this.dispatchEvent(new Event(`catalog:${key}`));
    }

    private async readCatalog(
        key: string,
        context: CatalogContext,
        profile: AgentProfile,
        project: ProjectReference | null,
        refresh: boolean,
    ) {
        await Promise.resolve();
        try {
            const catalog = validateAgentModelCatalog(await this.provider.getModelCatalog(profile, project, refresh));
            if (catalog.agent !== profile.name) throw new Error('Model catalog belongs to a different agent');
            if (!this.isCurrentCatalog(key, context)) return;
            context.snapshot = { catalog, error: null, loading: false, stale: false };
            // A remote host's wall clock may differ; age this view from receipt on the local clock.
            context.timer = setTimeout(() => this.expireCatalog(key, context), CATALOG_TTL_MS);
        } catch (error) {
            if (!this.isCurrentCatalog(key, context)) return;
            context.snapshot = {
                catalog: context.snapshot.catalog,
                error: errorMessage(error),
                loading: false,
                stale: !!context.snapshot.catalog,
            };
        } finally {
            context.pending = null;
        }
        if (this.isCurrentCatalog(key, context)) this.dispatchEvent(new Event(`catalog:${key}`));
    }

    private isCurrentCatalog(key: string, context: CatalogContext) {
        return this.catalogs.get(key) === context && context.connection === this.getConnectionIdentity();
    }

    private expireCatalog(key: string, context: CatalogContext) {
        if (!this.isCurrentCatalog(key, context)) return;
        context.timer = null;
        context.snapshot = { ...context.snapshot, stale: true };
        this.dispatchEvent(new Event(`catalog:${key}`));
    }

    private async loadAvailability() {
        const request = {};
        const connection = this.getConnectionIdentity();
        this.availabilityRequest = request;
        this.snapshot = { availability: { error: null, loading: true, values: {} } };
        this.dispatchEvent(new Event('changed'));
        try {
            const values = await this.provider.getAgentAvailability();
            if (request !== this.availabilityRequest || connection !== this.getConnectionIdentity()) return;
            this.snapshot = { availability: { error: null, loading: false, values } };
        } catch (error) {
            if (request !== this.availabilityRequest || connection !== this.getConnectionIdentity()) return;
            this.snapshot = { availability: { error: errorMessage(error), loading: false, values: {} } };
        }
        this.dispatchEvent(new Event('changed'));
    }
}

export const agentCapabilitiesService = new AgentCapabilitiesService();
