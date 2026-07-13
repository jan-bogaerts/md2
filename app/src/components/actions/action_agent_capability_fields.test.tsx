import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawActionDefinition } from '../../data/action_types'
import { AgentCapabilitiesService, type AgentCapabilitiesProvider } from '../../services/agent_capabilities_service'
import { configService } from '../../services/config_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ActionAgentCapabilityFields } from './action_agent_capability_fields'

const definition: RawActionDefinition = {
    agent: 'codex',
    description: 'Review code',
    id: 'review',
    label: 'Review',
    model: 'stored-model',
    name: 'review',
    prompt: 'Review',
    thinkingLevel: 'high',
    type: 'agent',
}

function provider(overrides: Partial<AgentCapabilitiesProvider> = {}): AgentCapabilitiesProvider {
    return {
        getAgentAvailability: vi.fn(async () => ({
            claude: { available: true, error: null },
            codex: { available: true, error: null },
        })),
        getModels: vi.fn(async () => ['configured-model']),
        getThinkingLevels: vi.fn(async () => ['none', 'low', 'medium', 'high', 'max']),
        ...overrides,
    }
}

function renderFields(service: AgentCapabilitiesService, value = definition) {
    return render(
        <AppThemeProvider>
            <ActionAgentCapabilityFields definition={value} errors={{}} onChange={vi.fn()} service={service} />
        </AppThemeProvider>,
    )
}

describe('ActionAgentCapabilityFields', () => {
    beforeEach(() => {
        configService.init()
    })

    afterEach(() => {
        cleanup()
        configService.clear()
    })

    it('disables unavailable agents and explains the selected-agent error', async () => {
        const service = new AgentCapabilitiesService(provider({
            getAgentAvailability: vi.fn(async () => ({
                claude: { available: true, error: null },
                codex: { available: false, error: 'Executable not found for codex: codex' },
            })),
        }))
        renderFields(service)

        await waitFor(() => expect(screen.getAllByText('Executable not found for codex: codex').length).toBeGreaterThan(0))
        fireEvent.mouseDown(screen.getByLabelText('Agent override'))
        const codexOption = within(screen.getByRole('listbox')).getByRole('option', { name: /codex.*Executable not found/u })
        expect(codexOption).toHaveAttribute('aria-disabled', 'true')
        expect(within(screen.getByRole('listbox')).getByRole('option', { name: 'claude' })).not.toHaveAttribute('aria-disabled', 'true')
    })

    it('preserves stored selections while requests load and selections switch', () => {
        const neverModels = new Promise<string[]>(() => undefined)
        const neverThinkingLevels = new Promise<string[]>(() => undefined)
        const service = new AgentCapabilitiesService(provider({
            getModels: vi.fn(async () => neverModels),
            getThinkingLevels: vi.fn(async () => neverThinkingLevels),
        }))
        const rendered = renderFields(service)

        expect(screen.getByLabelText('Model')).toHaveTextContent('stored-model')
        expect(screen.getByLabelText('Thinking level')).toHaveTextContent('high')

        const switchedDefinition = { ...definition, agent: 'claude', model: 'removed-model', thinkingLevel: 'max' }
        rendered.rerender(
            <AppThemeProvider>
                <ActionAgentCapabilityFields definition={switchedDefinition} errors={{}} onChange={vi.fn()} service={service} />
            </AppThemeProvider>,
        )

        expect(screen.getByLabelText('Model')).toHaveTextContent('removed-model')
        expect(screen.getByLabelText('Thinking level')).toHaveTextContent('max')
    })
})
