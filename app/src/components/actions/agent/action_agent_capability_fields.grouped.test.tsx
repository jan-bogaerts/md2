import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawActionDefinition } from '../../../data/action_types'
import { AgentCapabilitiesService, type AgentCapabilitiesProvider } from '../../../services/agents/agent_capabilities_service'
import { configService } from '../../../services/config/config_service'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ActionAgentCapabilityFields } from './action_agent_capability_fields'
import { agentCatalogFixture } from '../../../test/agent_catalog_fixture';
import type { AgentModelCatalog } from '../../../data/agent_model_catalog';

const definition: RawActionDefinition = {
    agent: 'codex',
    description: 'Review code',
    id: 'review',
    label: 'Review',
    model: 'stored-model',
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
        getModelCatalog: vi.fn(async (profile) => agentCatalogFixture(profile, ['configured-model'])),
        getConnectionIdentity: () => 'host',
        ...overrides,
    }
}

function renderFields(service: AgentCapabilitiesService, value = definition, onChange = vi.fn()) {
    return render(
        <AppThemeProvider>
            <ActionAgentCapabilityFields definition={value} errors={{}} onChange={onChange} service={service} sourcePath="actions/review.json" />
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

    it('shows default labels when agent overrides are absent', async () => {
        const service = new AgentCapabilitiesService(provider());
        const value = { ...definition, agent: undefined, model: undefined, thinkingLevel: undefined };
        renderFields(service, value);

        await waitFor(() => expect(screen.queryByText('Checking agent availability…')).not.toBeInTheDocument());

        expect(screen.getByLabelText('Agent')).toHaveTextContent('Application default');
        expect(screen.getByLabelText('Model')).toHaveTextContent('Select model');
        expect(screen.getByLabelText('Permission mode')).toHaveTextContent('Application default');
    });

    it('disables unavailable agents and explains the selected-agent error', async () => {
        const service = new AgentCapabilitiesService(provider({
            getAgentAvailability: vi.fn(async () => ({
                claude: { available: true, error: null },
                codex: { available: false, error: 'Executable not found for codex: codex' },
            })),
        }))
        renderFields(service)

        await waitFor(() => expect(screen.getAllByText('Executable not found for codex: codex').length).toBeGreaterThan(0))
        expect(screen.getByRole('heading', { name: 'Agent override' })).toBeInTheDocument()
        fireEvent.mouseDown(screen.getByLabelText('Agent'))
        const codexOption = within(screen.getByRole('listbox')).getByRole('option', { name: /codex.*Executable not found/u })
        expect(codexOption).toHaveAttribute('aria-disabled', 'true')
        expect(within(screen.getByRole('listbox')).getByRole('option', { name: 'claude' })).not.toHaveAttribute('aria-disabled', 'true')
    })

    it('preserves stored selections while requests load and selections switch', () => {
        const neverModels = new Promise<AgentModelCatalog>(() => undefined)
        const service = new AgentCapabilitiesService(provider({getModelCatalog: vi.fn(async () => neverModels)}))
        const rendered = renderFields(service)

        expect(screen.getByLabelText('Model')).toHaveTextContent('stored-model')
        expect(screen.getByLabelText('Thinking level')).toHaveTextContent('high')
        expect(screen.getByLabelText('Model')).not.toHaveAttribute('aria-disabled', 'true')

        const switchedDefinition = { ...definition, agent: 'claude', model: 'removed-model', thinkingLevel: 'max' }
        rendered.rerender(
            <AppThemeProvider>
                <ActionAgentCapabilityFields definition={switchedDefinition} errors={{}} onChange={vi.fn()} service={service} sourcePath="actions/review.json" />
            </AppThemeProvider>,
        )

        expect(screen.getByLabelText('Model')).toHaveTextContent('removed-model')
        expect(screen.getByLabelText('Thinking level')).toHaveTextContent('max')
    })

    it('keeps model, reasoning and Fast selections usable when discovery fails', async () => {
        const service = new AgentCapabilitiesService(provider({ getModelCatalog: vi.fn(async () => { throw new Error('Discovery failed'); }) }));
        renderFields(service, { ...definition, speedMode: 'fast' });
        await waitFor(() => expect(screen.getByText('Discovery failed')).toBeInTheDocument());
        expect(screen.getByLabelText('Model')).toHaveTextContent('stored-model');
        expect(screen.getByLabelText('Model')).not.toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByLabelText('Thinking level')).toHaveTextContent('high');
        fireEvent.mouseDown(screen.getByLabelText('Speed'));
        expect(within(screen.getByRole('listbox')).getByRole('option', { name: 'Fast' })).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('allows an empty model picker without invalidating saved settings', async () => {
        const capabilities = provider({ getModelCatalog: vi.fn(async (profile) => agentCatalogFixture(profile, [])) });
        const service = new AgentCapabilitiesService(capabilities);
        renderFields(service);
        await waitFor(() => expect(service.getCatalogSnapshot('codex').catalog?.models).toEqual([]));
        expect(screen.getByLabelText('Model')).toHaveTextContent('stored-model');
        expect(screen.getByLabelText('Model')).not.toHaveAttribute('aria-invalid', 'true');
    });

    it('restores profile defaults when agent changes without remembered settings', async () => {
        const service = new AgentCapabilitiesService(provider())
        const onChange = vi.fn()
        renderFields(service, definition, onChange)

        await waitFor(() => expect(screen.queryByText('Checking agent availability…')).not.toBeInTheDocument())
        fireEvent.mouseDown(screen.getByLabelText('Agent'))
        fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'claude' }))

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            agent: 'claude',
            model: 'default',
            thinkingLevel: 'medium',
        }))
    })
})
