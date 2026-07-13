import { describe, expect, it, vi } from 'vitest'
import { AgentCapabilitiesService, type AgentCapabilitiesProvider } from './agent_capabilities_service'

function provider(overrides: Partial<AgentCapabilitiesProvider> = {}): AgentCapabilitiesProvider {
    return {
        getModels: vi.fn(async () => ['model-a']),
        getThinkingLevels: vi.fn(async () => ['low', 'high']),
        ...overrides,
    }
}

describe('AgentCapabilitiesService', () => {
    it('owns model and thinking-level loading results', async () => {
        const capabilitiesProvider = provider()
        const service = new AgentCapabilitiesService(capabilitiesProvider)

        await service.loadModels('codex')
        await service.loadThinkingLevels('codex', 'model-a')

        expect(capabilitiesProvider.getModels).toHaveBeenCalledWith('codex')
        expect(capabilitiesProvider.getThinkingLevels).toHaveBeenCalledWith('codex', 'model-a')
        expect(service.getSnapshot()).toEqual({
            models: { error: null, loading: false, values: ['model-a'] },
            thinkingLevels: { error: null, loading: false, values: ['low', 'high'] },
        })
    })

    it('exposes provider errors without static fallback values', async () => {
        const service = new AgentCapabilitiesService(provider({getModels: vi.fn(async () => { throw new Error('Provider unavailable') })}))

        await service.loadModels('claude')

        expect(service.getSnapshot().models).toEqual({ error: 'Provider unavailable', loading: false, values: [] })
    })
})
