import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../../data/action_types'
import { BUILTIN_AGENT_PROFILES } from '../../../data/agent_profiles'
import type { AgentSelectionState } from '../../../data/agent_selection'
import type { ActionRunSettingsStore } from '../../../services/actions/action_run_settings_service'
import { createAppTheme } from '../../../theme/app_theme'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ActionAgentSelectors } from './action_agent_selectors'
import { ActionRunBindingStore } from '../run/state/action_run_binding_store'

const selectorState = vi.hoisted(() => ({
    runStatus: null as string | null,
    settings: {
        agent: 'codex',
        agentAvailability: {
            claude: { available: true, error: null as string | null },
            codex: { available: true, error: null as string | null },
        },
        agentProfiles: [] as typeof BUILTIN_AGENT_PROFILES,
        availabilityLoading: false,
        desktopConfigAvailable: true,
        model: 'gpt-5.5',
        permissionMode: 'ask-for-approval' as 'ask-for-approval' | 'approve-for-me' | 'full-access' | '',
        permissionModeSupported: true,
        modelOptions: ['gpt-5.5', 'gpt-5.6-sol'].map((id) => ({ id, displayName: id, available: true })),
        modelCatalog: { loading: false, stale: false, error: null as string | null, refresh: vi.fn() },
        thinkingLevelOptions: ['none', 'low', 'medium', 'high', 'max'],
        fastAvailable: true,
        speedSupported: true,
        speedMode: undefined as 'default' | 'standard' | 'fast' | undefined,
        selection: {
            activeAgent: 'codex', permissionMode: 'ask-for-approval',
            settingsByAgent: { codex: { model: 'gpt-5.5', thinkingLevel: 'high' } },
        } as AgentSelectionState,
        selectionSources: [] as AgentSelectionState[],
        settingsLoading: false,
        thinkingLevel: 'high' as 'none' | 'low' | 'medium' | 'high' | 'max',
    },
}))

vi.mock('../../hooks/use_action_runs', () => ({
    useBoundRunId: () => 'run-1',
    useRunSelector: () => selectorState.runStatus,
}))

vi.mock('../shared/use_action_run_settings', () => ({useActionRunSettings: () => selectorState.settings}))

const action = {description: 'Review', id: 'review', label: 'Review', prompt: 'Review project', type: 'agent'} as ActionDefinition
const bindingStore = new ActionRunBindingStore('run-1')

function renderSelectors(setSettings = vi.fn()) {
    const settingsStore = { setSettings } as unknown as ActionRunSettingsStore
    const rendered = render(
        <AppThemeProvider>
            <ActionAgentSelectors action={action} bindingStore={bindingStore} settingsStore={settingsStore} />
        </AppThemeProvider>,
    )

    return { ...rendered, setSettings }
}

function openSubmenu(name: 'Agent' | 'Model' | 'Thinking level' | 'Speed') {
    fireEvent.click(screen.getByRole('button', { name: 'Model' }))
    fireEvent.click(screen.getByRole('menuitem', { name: name === 'Speed' ? /^Speed/u : name }))
}

describe('ActionAgentSelectors', () => {
    it('selects an advertised model by its native ID while displaying its friendly name', () => {
        const { setSettings } = renderSelectors();
        selectorState.settings.modelOptions.push({ available: true, displayName: 'GPT 6.1 Sol', id: 'gpt-6.1-sol' });
        openSubmenu('Model');
        fireEvent.click(screen.getByRole('menuitem', { name: 'GPT 6.1 Sol' }));
        expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({settingsByAgent: { codex: { model: 'gpt-6.1-sol', thinkingLevel: 'high' } }}), false);
    });

    it('persists Fast for Codex and offers refresh through the model menu', () => {
        const { setSettings } = renderSelectors();
        openSubmenu('Speed');
        fireEvent.click(screen.getByRole('menuitem', { name: /Fast.*Higher provider usage/u }));
        expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({settingsByAgent: { codex: { model: 'gpt-5.5', thinkingLevel: 'high', speedMode: 'fast' } }}), false);
        fireEvent.click(screen.getByRole('button', { name: 'Model' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Refresh models' }));
        expect(selectorState.settings.modelCatalog.refresh).toHaveBeenCalledOnce();
    });

    it('hides unknown Fast support but retains a disabled saved Fast preference', () => {
        selectorState.settings.fastAvailable = false;
        const { rerender } = renderSelectors();
        openSubmenu('Speed');
        expect(screen.queryByRole('menuitem', { name: /Fast/u })).not.toBeInTheDocument();
        selectorState.settings.speedMode = 'fast';
        rerender(<AppThemeProvider><ActionAgentSelectors action={action} bindingStore={bindingStore}
            settingsStore={{ setSettings: vi.fn() } as unknown as ActionRunSettingsStore} /></AppThemeProvider>);
        expect(screen.getByRole('menuitem', { name: /Fast — unavailable/u })).toHaveAttribute('aria-disabled', 'true');
    });

    it('shows no speed controls for Claude', () => {
        selectorState.settings.agent = 'claude';
        renderSelectors();
        fireEvent.click(screen.getByRole('button', { name: 'Model' }));
        expect(screen.queryByRole('menuitem', { name: /^Speed/u })).not.toBeInTheDocument();
    });
    beforeEach(() => {
        selectorState.runStatus = null
        selectorState.settings = {
            agent: 'codex',
            agentAvailability: {
                claude: { available: true, error: null },
                codex: { available: true, error: null },
            },
            agentProfiles: BUILTIN_AGENT_PROFILES,
            availabilityLoading: false,
            desktopConfigAvailable: true,
            model: 'gpt-5.5',
            permissionMode: 'ask-for-approval',
            permissionModeSupported: true,
            modelOptions: ['gpt-5.5', 'gpt-5.6-sol'].map((id) => ({ id, displayName: id, available: true })),
            modelCatalog: { loading: false, stale: false, error: null as string | null, refresh: vi.fn() },
            thinkingLevelOptions: ['none', 'low', 'medium', 'high', 'max'],
            fastAvailable: true,
            speedSupported: true,
            speedMode: undefined as 'default' | 'standard' | 'fast' | undefined,
            selection: {
                activeAgent: 'codex', permissionMode: 'ask-for-approval',
                settingsByAgent: { codex: { model: 'gpt-5.5', thinkingLevel: 'high' } },
            },
            selectionSources: [],
            settingsLoading: false,
            thinkingLevel: 'high',
        }
    })

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('shows Agent, Model, and Thinking level as nested menus', () => {
        renderSelectors()

        const modelButton = screen.getByRole('button', { name: 'Model' })
        expect(modelButton.querySelector('[data-model-label]')).toHaveTextContent('gpt-5.5')
        expect(modelButton.querySelector('[data-full-thinking-level]')).toHaveTextContent('high')
        expect(modelButton.querySelector('[data-compact-thinking-level]')).toHaveTextContent('h')
        fireEvent.click(modelButton)
        const menu = screen.getByRole('menu', { name: 'Agent model settings' })

        expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(expect.arrayContaining(['Agent', 'Model', 'Thinking level', 'Refresh models']))
        fireEvent.click(within(menu).getByRole('menuitem', { name: 'Model' }))
        expect(screen.getByRole('menu', { name: 'Model choices' })).toHaveTextContent('gpt-5.6-sol')
    })

    it.each([
        ['low', 'l'],
        ['medium', 'm'],
        ['high', 'h'],
        ['none', 'none'],
        ['max', 'max'],
    ] as const)('provides compact %s label %s for the narrow footer', (thinkingLevel, compactLabel) => {
        selectorState.settings.thinkingLevel = thinkingLevel
        renderSelectors()
        const modelButton = screen.getByRole('button', { name: 'Model' })

        expect(modelButton.querySelector('[data-full-thinking-level]')).toHaveTextContent(thinkingLevel)
        expect(modelButton.querySelector('[data-compact-thinking-level]')).toHaveTextContent(compactLabel)
    })

    it('ellipsizes long model labels without shrinking the thinking label', () => {
        selectorState.settings.model = 'model-with-a-very-long-display-name'
        renderSelectors()
        const modelButton = screen.getByRole('button', { name: 'Model' })

        expect(modelButton).toHaveStyle({ minWidth: '0', overflow: 'hidden' })
        expect(modelButton.querySelector('[data-model-label]')).toHaveStyle({minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'})
        expect(modelButton.querySelector('[data-thinking-level]')).toHaveStyle({ flexShrink: '0' })
    })

    it('keeps selectors disabled until desktop config and availability are ready', () => {
        selectorState.settings.desktopConfigAvailable = false
        const { rerender } = renderSelectors()

        expect(screen.getByRole('button', { name: 'Model' })).toBeDisabled()

        selectorState.settings.desktopConfigAvailable = true
        selectorState.settings.availabilityLoading = true
        const settingsStore = { setSettings: vi.fn() } as unknown as ActionRunSettingsStore
        rerender(
            <AppThemeProvider>
                <ActionAgentSelectors action={action} bindingStore={bindingStore} settingsStore={settingsStore} />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('button', { name: 'Model' })).toBeDisabled()
    })

    it('restores agent defaults and preserves thinking level when model changes', () => {
        const { setSettings } = renderSelectors()
        openSubmenu('Agent')
        fireEvent.click(screen.getByRole('menuitem', { name: 'claude' }))

        expect(setSettings).toHaveBeenCalledWith({
            activeAgent: 'claude', permissionMode: 'ask-for-approval',
            settingsByAgent: {
                claude: { model: 'default', thinkingLevel: 'medium' },
                codex: { model: 'gpt-5.5', thinkingLevel: 'high' },
            },
        }, false)

        openSubmenu('Model')
        fireEvent.click(screen.getByRole('menuitem', { name: 'gpt-5.6-sol' }))
        expect(setSettings).toHaveBeenLastCalledWith({
            activeAgent: 'codex', permissionMode: 'ask-for-approval',
            settingsByAgent: { codex: { model: 'gpt-5.6-sol', thinkingLevel: 'high' } },
        }, false)
    })

    it('stores a full thinking level selected from the full-name menu', () => {
        const { setSettings } = renderSelectors()
        openSubmenu('Thinking level')
        fireEvent.click(screen.getByRole('menuitem', { name: 'low' }))

        expect(setSettings).toHaveBeenCalledWith({
            activeAgent: 'codex', permissionMode: 'ask-for-approval',
            settingsByAgent: { codex: { model: 'gpt-5.5', thinkingLevel: 'low' } },
        }, false)
    })

    it('disables unavailable agents and lists models for selected agent only', () => {
        selectorState.settings.agentAvailability.claude = { available: false, error: 'Claude missing' }
        const { rerender } = renderSelectors()
        openSubmenu('Agent')
        expect(screen.getByRole('menuitem', { name: /claude/u })).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByText('Claude missing')).toBeInTheDocument()

        fireEvent.keyDown(screen.getByRole('menu', { name: 'Agent choices' }), { key: 'ArrowLeft' })
        fireEvent.keyDown(screen.getByRole('menu', { name: 'Agent model settings' }), { key: 'Escape' })
        selectorState.settings = {
            ...selectorState.settings,
            agent: 'claude',
            model: 'sonnet',
            modelOptions: ['default', 'sonnet', 'opus'].map((id) => ({ id, displayName: id, available: true })),
        }
        const settingsStore = { setSettings: vi.fn() } as unknown as ActionRunSettingsStore
        rerender(
            <AppThemeProvider>
                <ActionAgentSelectors action={action} bindingStore={bindingStore} settingsStore={settingsStore} />
            </AppThemeProvider>,
        )
        openSubmenu('Model')
        expect(screen.getByRole('menuitem', { name: 'sonnet' })).toBeInTheDocument()
        expect(screen.queryByRole('menuitem', { name: 'gpt-5.6-sol' })).not.toBeInTheDocument()
    })

    it('shows permission descriptions and writes one complete waiting-input setting object', () => {
        selectorState.runStatus = 'waitingForInput'
        const { setSettings } = renderSelectors()
        fireEvent.click(screen.getByRole('button', { name: 'Permission mode' }))
        const menu = screen.getByRole('menu', { name: 'Security settings' })

        expect(within(menu).getByText('Ask before commands or file changes cross the normal approval boundary.')).toBeInTheDocument()
        expect(within(menu).getByText('Let the provider safety reviewer approve changes automatically.')).toBeInTheDocument()
        expect(within(menu).getByText('Disable the normal approval boundary and allow unrestricted access.')).toBeInTheDocument()
        fireEvent.click(within(menu).getByRole('menuitem', { name: /Approve for me/u }))
        expect(setSettings).toHaveBeenCalledWith({
            activeAgent: 'codex', permissionMode: 'approve-for-me',
            settingsByAgent: { codex: { model: 'gpt-5.5', thinkingLevel: 'high' } },
        }, true)
    })

    it.each([
        ['ask-for-approval', 'success.main'],
        ['approve-for-me', 'warning.main'],
        ['full-access', 'error.main'],
    ] as const)('colors security button for %s', (permissionMode, palettePath) => {
        selectorState.settings.permissionMode = permissionMode
        renderSelectors()
        const palette = createAppTheme('light').palette
        const [paletteGroup, paletteValue] = palettePath.split('.') as ['success' | 'warning' | 'error', 'main']

        expect(screen.getByRole('button', { name: 'Permission mode' })).toHaveStyle({color: palette[paletteGroup][paletteValue]})
    })

    it('shows neutral disabled security state with unsupported explanation', async () => {
        selectorState.settings.permissionMode = ''
        selectorState.settings.permissionModeSupported = false
        renderSelectors()
        const securityButton = screen.getByRole('button', { name: 'Permission mode' })

        expect(securityButton).toBeDisabled()
        expect(securityButton).toHaveAttribute('data-permission-mode', 'unsupported')
        fireEvent.mouseOver(securityButton.parentElement as HTMLElement)
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Permission controls are unsupported by this agent')
    })
})
