import { findAgentProfile } from '../data/agent_profiles'
import { configService } from './config_service'
import { register } from './service_injector'

export interface CapabilityState {
    error: string | null
    loading: boolean
    values: string[]
}

export interface AgentCapabilitiesSnapshot {
    models: CapabilityState
    thinkingLevels: CapabilityState
}

export interface AgentCapabilitiesProvider {
    getModels(agent: string): Promise<string[]>
    getThinkingLevels(agent: string, model: string): Promise<string[]>
}

const EMPTY_CAPABILITY_STATE: CapabilityState = { error: null, loading: false, values: [] }
const EMPTY_SNAPSHOT: AgentCapabilitiesSnapshot = {
    models: EMPTY_CAPABILITY_STATE,
    thinkingLevels: EMPTY_CAPABILITY_STATE,
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Agent capability request failed'
}

const configuredProfileProvider: AgentCapabilitiesProvider = {
    async getModels(agent) {
        const profile = findAgentProfile(configService.get('desktop.agentProfiles'), agent)
        if (!profile) throw new Error(`Unknown agent profile: ${agent}`)
        if (!profile.models || profile.models.length === 0) {
            throw new Error(`Model capability API is not configured for ${agent}`)
        }

        return profile.models
    },
    async getThinkingLevels(agent) {
        throw new Error(`Thinking-level capability API is not configured for ${agent}`)
    },
}

/** Owns asynchronous model/thinking capability state and rejects stale provider responses. */
export class AgentCapabilitiesService extends EventTarget {
    private modelRequest = 0
    private provider: AgentCapabilitiesProvider
    private snapshot = EMPTY_SNAPSHOT
    private thinkingLevelRequest = 0

    constructor(provider: AgentCapabilitiesProvider = configuredProfileProvider) {
        super()
        this.provider = provider
        register('agentCapabilitiesService', this)
    }

    getSnapshot() {
        return this.snapshot
    }

    clear() {
        this.modelRequest += 1
        this.thinkingLevelRequest += 1
        this.update(EMPTY_SNAPSHOT)
    }

    async loadModels(agent: string) {
        const request = this.modelRequest + 1
        this.modelRequest = request
        this.thinkingLevelRequest += 1
        this.update({ models: { error: null, loading: true, values: [] }, thinkingLevels: EMPTY_CAPABILITY_STATE })

        try {
            const values = await this.provider.getModels(agent)
            if (request !== this.modelRequest) return
            this.update({ ...this.snapshot, models: { error: null, loading: false, values } })
        } catch (error) {
            if (request !== this.modelRequest) return
            this.update({ ...this.snapshot, models: { error: errorMessage(error), loading: false, values: [] } })
        }
    }

    async loadThinkingLevels(agent: string, model: string) {
        const request = this.thinkingLevelRequest + 1
        this.thinkingLevelRequest = request
        this.update({ ...this.snapshot, thinkingLevels: { error: null, loading: true, values: [] } })

        try {
            const values = await this.provider.getThinkingLevels(agent, model)
            if (request !== this.thinkingLevelRequest) return
            this.update({ ...this.snapshot, thinkingLevels: { error: null, loading: false, values } })
        } catch (error) {
            if (request !== this.thinkingLevelRequest) return
            this.update({ ...this.snapshot, thinkingLevels: { error: errorMessage(error), loading: false, values: [] } })
        }
    }

    private update(snapshot: AgentCapabilitiesSnapshot) {
        this.snapshot = snapshot
        this.dispatchEvent(new CustomEvent<AgentCapabilitiesSnapshot>('changed', { detail: snapshot }))
    }
}

export const agentCapabilitiesService = new AgentCapabilitiesService()
