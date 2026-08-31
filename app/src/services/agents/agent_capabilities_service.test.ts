import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ElectronDataBridge } from '../../data/electron_data_bridge'
import { configService } from '../config/config_service'
import { AgentCapabilitiesService, type AgentCapabilitiesProvider } from './agent_capabilities_service'

function provider(overrides: Partial<AgentCapabilitiesProvider> = {}): AgentCapabilitiesProvider {
    return {
        getAgentAvailability: vi.fn(async () => ({
            claude: { available: true, error: null },
            codex: { available: true, error: null },
        })),
        getModels: vi.fn(async () => ['model-a']),
        getThinkingLevels: vi.fn(async () => ['none', 'low', 'medium', 'high', 'max']),
        ...overrides,
    }
}

function deferred<T>() {
    let resolvePromise: (value: T) => void = () => undefined
    const promise = new Promise<T>((resolve) => {
        resolvePromise = resolve
    })

    return { promise, resolve: resolvePromise }
}

function createAvailabilityBridge() {
    return {loadAgentAvailability: vi.fn(async () => ({ codex: { available: true, error: null } }))} as unknown as ElectronDataBridge
}

describe('AgentCapabilitiesService', () => {
    afterEach(() => {
        configService.clear()
        delete window.md2Data
    })

    it('owns availability, model, and thinking-level results', async () => {
        const capabilitiesProvider = provider()
        const service = new AgentCapabilitiesService(capabilitiesProvider)

        await service.loadModels('codex')
        await service.loadThinkingLevels('codex', 'model-a')

        expect(capabilitiesProvider.getAgentAvailability).toHaveBeenCalledOnce()
        expect(capabilitiesProvider.getModels).toHaveBeenCalledWith('codex')
        expect(capabilitiesProvider.getThinkingLevels).toHaveBeenCalledWith('codex', 'model-a')
        expect(service.getSnapshot()).toEqual({
            availability: {
                error: null,
                loading: false,
                values: {
                    claude: { available: true, error: null },
                    codex: { available: true, error: null },
                },
            },
            models: { error: null, loading: false, values: ['model-a'] },
            thinkingLevels: { error: null, loading: false, values: ['none', 'low', 'medium', 'high', 'max'] },
        })
    })

    it('loads configured profile overrides and fixed thinking levels without provider credentials', async () => {
        configService.init({
            desktopConfig: {
                agentProfiles: [{ command: ['codex'], defaultThinkingLevel: 'none', models: ['override-a', 'override-b'], name: 'codex' }],
                agentSelection: { activeAgent: 'codex', permissionMode: 'ask-for-approval', settingsByAgent: { codex: { model: 'override-a', thinkingLevel: 'none' } } },
            },
        })
        window.md2Data = createAvailabilityBridge()
        const service = new AgentCapabilitiesService()

        await service.loadModels('codex')
        await service.loadThinkingLevels('codex', 'override-a')

        expect(service.getSnapshot().models.values).toEqual(['override-a', 'override-b'])
        expect(service.getSnapshot().thinkingLevels.values).toEqual(['none', 'low', 'medium', 'high', 'max'])
    })

    it('reports invalid model lists and unavailable executables', async () => {
        const invalidService = new AgentCapabilitiesService(provider({ getModels: vi.fn(async () => ['same', 'same']) }))
        await invalidService.loadModels('codex')
        expect(invalidService.getSnapshot().models.error).toContain('duplicate')

        const unavailableService = new AgentCapabilitiesService(provider({getAgentAvailability: vi.fn(async () => ({codex: { available: false, error: 'Executable not found for codex: codex' }}))}))
        await unavailableService.loadModels('codex')
        expect(unavailableService.getSnapshot().models.error).toBe('Executable not found for codex: codex')
    })

    it('rejects empty and malformed capability results', async () => {
        const emptyService = new AgentCapabilitiesService(provider({ getModels: vi.fn(async () => []) }))
        await emptyService.loadModels('codex')
        expect(emptyService.getSnapshot().models.error).toContain('missing or empty')

        const malformedService = new AgentCapabilitiesService(provider({getThinkingLevels: vi.fn(async () => [' low'])}))
        await malformedService.loadThinkingLevels('codex', 'model-a')
        expect(malformedService.getSnapshot().thinkingLevels.error).toContain('malformed')
    })

    it('reports a local capability error outside Electron', async () => {
        configService.init()
        const service = new AgentCapabilitiesService()

        await service.loadModels('codex')

        expect(service.getSnapshot().models.error).toBe('Agent executable availability requires the Electron desktop app')
    })

    it('caches availability, models, and thinking levels', async () => {
        const capabilitiesProvider = provider()
        const service = new AgentCapabilitiesService(capabilitiesProvider)

        await service.loadModels('codex')
        await service.loadModels('codex')
        await service.loadThinkingLevels('codex', 'model-a')
        await service.loadThinkingLevels('codex', 'model-a')

        expect(capabilitiesProvider.getAgentAvailability).toHaveBeenCalledOnce()
        expect(capabilitiesProvider.getModels).toHaveBeenCalledOnce()
        expect(capabilitiesProvider.getThinkingLevels).toHaveBeenCalledOnce()
    })

    it('rejects stale model and thinking-level responses after selection changes', async () => {
        const codexModels = deferred<string[]>()
        const claudeModels = deferred<string[]>()
        const firstThinkingLevels = deferred<string[]>()
        const secondThinkingLevels = deferred<string[]>()
        const getModels = vi.fn((agent: string) => agent === 'codex' ? codexModels.promise : claudeModels.promise)
        const getThinkingLevels = vi.fn((_agent: string, model: string) => (
            model === 'model-a' ? firstThinkingLevels.promise : secondThinkingLevels.promise
        ))
        const service = new AgentCapabilitiesService(provider({ getModels, getThinkingLevels }))

        const firstModelLoad = service.loadModels('codex')
        const secondModelLoad = service.loadModels('claude')
        claudeModels.resolve(['claude-model'])
        await secondModelLoad
        codexModels.resolve(['codex-model'])
        await firstModelLoad
        expect(service.getSnapshot().models.values).toEqual(['claude-model'])

        const firstThinkingLoad = service.loadThinkingLevels('claude', 'model-a')
        const secondThinkingLoad = service.loadThinkingLevels('claude', 'model-b')
        secondThinkingLevels.resolve(['high'])
        await secondThinkingLoad
        firstThinkingLevels.resolve(['low'])
        await firstThinkingLoad
        expect(service.getSnapshot().thinkingLevels.values).toEqual(['high'])
    })
})
