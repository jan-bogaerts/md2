import { findAgentProfile } from '../../data/agent_profiles'
import { getElectronDataBridge, type AgentAvailability } from '../../data/electron_data_bridge'
import { getElectronActionBridge } from '../../data/electron_action_bridge'
import { configService } from '../config/config_service'
import { register } from '.././service_injector'

export interface CapabilityState<T = string[]> {
    error: string | null
    loading: boolean
    values: T
}

export interface AgentCapabilitiesSnapshot {
    availability: CapabilityState<Record<string, AgentAvailability>>
    models: CapabilityState
    thinkingLevels: CapabilityState
}

export interface AgentCapabilitiesProvider {
    getAgentAvailability(): Promise<Record<string, AgentAvailability>>
    getModels(agent: string): Promise<string[]>
    getThinkingLevels(agent: string, model: string): Promise<string[]>
}

const THINKING_LEVELS = ['none', 'low', 'medium', 'high', 'max']
const EMPTY_CAPABILITY_STATE: CapabilityState = { error: null, loading: false, values: [] }
const EMPTY_AVAILABILITY_STATE: CapabilityState<Record<string, AgentAvailability>> = { error: null, loading: false, values: {} }
const EMPTY_SNAPSHOT: AgentCapabilitiesSnapshot = {
    availability: EMPTY_AVAILABILITY_STATE,
    models: EMPTY_CAPABILITY_STATE,
    thinkingLevels: EMPTY_CAPABILITY_STATE,
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Agent capability request failed'
}

function validateCapabilityValues(values: unknown, capability: string) {
    if (!Array.isArray(values) || values.length === 0) throw new Error(`${capability} capability list is missing or empty`)
    if (values.some((value) => typeof value !== 'string' || value.length === 0 || value.trim() !== value)) {
        throw new Error(`${capability} capability list is malformed`)
    }
    if (new Set(values).size !== values.length) throw new Error(`${capability} capability list contains duplicate values`)

    return values
}

const configuredProfileProvider: AgentCapabilitiesProvider = {
    async getAgentAvailability() {
        const dataBridge = getElectronDataBridge()
        const actionBridge = getElectronActionBridge()
        const loadAvailability = dataBridge?.loadAgentAvailability?.bind(dataBridge)
            ?? actionBridge?.loadAgentAvailability?.bind(actionBridge)
        if (!loadAvailability) throw new Error('Agent executable availability requires the Electron desktop app')

        return loadAvailability()
    },
    async getModels(agent) {
        const profile = findAgentProfile(configService.get('desktop.agentProfiles'), agent)
        if (!profile) throw new Error(`Unknown agent profile: ${agent}`)

        return validateCapabilityValues(profile.models, `Model for ${agent}`)
    },
    async getThinkingLevels() {
        return THINKING_LEVELS
    },
}

/** Owns cached agent capability state and rejects stale provider responses. */
export class AgentCapabilitiesService extends EventTarget {
    private availabilityPromise: Promise<void> | null = null
    private modelCache = new Map<string, string[]>()
    private modelRequest = 0
    private provider: AgentCapabilitiesProvider
    private snapshot = EMPTY_SNAPSHOT
    private thinkingLevelCache = new Map<string, string[]>()
    private thinkingLevelRequest = 0

    constructor(provider: AgentCapabilitiesProvider = configuredProfileProvider) {
        super()
        this.provider = provider
        register('agentCapabilitiesService', this)
    }

    getSnapshot() {
        return this.snapshot
    }

    initialize() {
        if (!this.availabilityPromise) this.availabilityPromise = this.loadAvailability()

        return this.availabilityPromise
    }

    /** Re-read agent availability from the currently active bridge, discarding the cached result. */
    reload() {
        this.availabilityPromise = this.loadAvailability()

        return this.availabilityPromise
    }

    clear() {
        this.modelRequest += 1
        this.thinkingLevelRequest += 1
        this.update({ ...this.snapshot, models: EMPTY_CAPABILITY_STATE, thinkingLevels: EMPTY_CAPABILITY_STATE })
    }

    async loadModels(agent: string) {
        const request = this.modelRequest + 1
        this.modelRequest = request
        this.thinkingLevelRequest += 1
        const cachedValues = this.modelCache.get(agent)
        this.update({
            ...this.snapshot,
            models: cachedValues
                ? { error: null, loading: false, values: cachedValues }
                : { error: null, loading: true, values: [] },
            thinkingLevels: EMPTY_CAPABILITY_STATE,
        })
        if (cachedValues) return

        try {
            await this.initialize()
            this.requireAvailableAgent(agent)
            const values = validateCapabilityValues(await this.provider.getModels(agent), `Model for ${agent}`)
            if (request !== this.modelRequest) return
            this.modelCache.set(agent, values)
            this.update({ ...this.snapshot, models: { error: null, loading: false, values } })
        } catch (error) {
            if (request !== this.modelRequest) return
            this.update({ ...this.snapshot, models: { error: errorMessage(error), loading: false, values: [] } })
        }
    }

    async loadThinkingLevels(agent: string, model: string) {
        const request = this.thinkingLevelRequest + 1
        this.thinkingLevelRequest = request
        const cacheKey = `${agent}\u0000${model}`
        const cachedValues = this.thinkingLevelCache.get(cacheKey)
        this.update({
            ...this.snapshot,
            thinkingLevels: cachedValues
                ? { error: null, loading: false, values: cachedValues }
                : { error: null, loading: true, values: [] },
        })
        if (cachedValues) return

        try {
            const values = validateCapabilityValues(await this.provider.getThinkingLevels(agent, model), 'Thinking-level')
            if (request !== this.thinkingLevelRequest) return
            this.thinkingLevelCache.set(cacheKey, values)
            this.update({ ...this.snapshot, thinkingLevels: { error: null, loading: false, values } })
        } catch (error) {
            if (request !== this.thinkingLevelRequest) return
            this.update({ ...this.snapshot, thinkingLevels: { error: errorMessage(error), loading: false, values: [] } })
        }
    }

    private async loadAvailability() {
        this.update({ ...this.snapshot, availability: { error: null, loading: true, values: {} } })

        try {
            const values = await this.provider.getAgentAvailability()
            this.update({ ...this.snapshot, availability: { error: null, loading: false, values } })
        } catch (error) {
            this.update({ ...this.snapshot, availability: { error: errorMessage(error), loading: false, values: {} } })
        }
    }

    private requireAvailableAgent(agent: string) {
        if (this.snapshot.availability.error) throw new Error(this.snapshot.availability.error)
        const availability = this.snapshot.availability.values[agent]
        if (!availability) throw new Error(`Agent executable availability is missing for ${agent}`)
        if (!availability.available) throw new Error(availability.error ?? `Agent executable is unavailable for ${agent}`)
    }

    private update(snapshot: AgentCapabilitiesSnapshot) {
        this.snapshot = snapshot
        this.dispatchEvent(new CustomEvent<AgentCapabilitiesSnapshot>('changed', { detail: snapshot }))
    }
}

export const agentCapabilitiesService = new AgentCapabilitiesService()
