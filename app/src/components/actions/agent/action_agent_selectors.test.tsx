import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../../data/action_types'
import { BUILTIN_AGENT_PROFILES } from '../../../data/agent_profiles'
import type { ActionRunSettingsStore } from '../../../services/actions/action_run_settings_service'
import { createAppTheme } from '../../../theme/app_theme'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ActionAgentSelectors } from './action_agent_selectors'

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
        selectedAgentModels: ['gpt-5.5', 'gpt-5.6-sol'],
        settingsLoading: false,
        thinkingLevel: 'high' as 'none' | 'low' | 'medium' | 'high' | 'max',
    },
}))

vi.mock('../../hooks/use_action_runs', () => ({useActionRunSelector: () => selectorState.runStatus}))

vi.mock('../shared/use_action_run_settings', () => ({useActionRunSettings: () => selectorState.settings}))

const action = {description: 'Review', id: 'review', label: 'Review', prompt: 'Review project', type: 'agent'} as ActionDefinition
const context = { kind: 'project' as const }

function renderSelectors(setSettings = vi.fn()) {
    const settingsStore = { setSettings } as unknown as ActionRunSettingsStore
    const rendered = render(
        <AppThemeProvider>
            <ActionAgentSelectors action={action} context={context} settingsStore={settingsStore} />
        </AppThemeProvider>,
    )

    return { ...rendered, setSettings }
}

describe('ActionAgentSelectors', () => {
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
            selectedAgentModels: ['gpt-5.5', 'gpt-5.6-sol'],
            settingsLoading: false,
            thinkingLevel: 'high',
        }
    })

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('shows model and thinking level in one button with three labelled menu sections', () => {
        renderSelectors()

        const modelButton = screen.getByRole('button', { name: 'Model' })
        expect(modelButton).toHaveTextContent('gpt-5.5 high')
        fireEvent.click(modelButton)
        const menu = screen.getByRole('menu', { name: 'Agent model settings' })

        expect(within(menu).getByText('Agent')).toBeInTheDocument()
        expect(within(menu).getByText('Model')).toBeInTheDocument()
        expect(within(menu).getByText('Thinking level')).toBeInTheDocument()
        expect(within(menu).getByRole('menuitem', { name: 'gpt-5.6-sol' })).toBeInTheDocument()
        expect(within(menu).queryByRole('menuitem', { name: 'sonnet' })).not.toBeInTheDocument()
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
                <ActionAgentSelectors action={action} context={context} settingsStore={settingsStore} />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('button', { name: 'Model' })).toBeDisabled()
    })

    it('resets dependent settings when agent or model changes', () => {
        const { setSettings } = renderSelectors()
        fireEvent.click(screen.getByRole('button', { name: 'Model' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'claude' }))

        expect(setSettings).toHaveBeenCalledWith({agent: 'claude', model: 'default', permissionMode: 'ask-for-approval', thinkingLevel: 'none'}, false)

        fireEvent.click(screen.getByRole('button', { name: 'Model' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'gpt-5.6-sol' }))
        expect(setSettings).toHaveBeenLastCalledWith({agent: 'codex', model: 'gpt-5.6-sol', permissionMode: 'ask-for-approval', thinkingLevel: 'none'}, false)
    })

    it('disables unavailable agents and lists models for selected agent only', () => {
        selectorState.settings.agentAvailability.claude = { available: false, error: 'Claude missing' }
        const { rerender } = renderSelectors()
        fireEvent.click(screen.getByRole('button', { name: 'Model' }))
        expect(screen.getByRole('menuitem', { name: /claude/u })).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByText('Claude missing')).toBeInTheDocument()

        fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
        selectorState.settings = {
            ...selectorState.settings,
            agent: 'claude',
            model: 'sonnet',
            selectedAgentModels: ['default', 'sonnet', 'opus'],
        }
        const settingsStore = { setSettings: vi.fn() } as unknown as ActionRunSettingsStore
        rerender(
            <AppThemeProvider>
                <ActionAgentSelectors action={action} context={context} settingsStore={settingsStore} />
            </AppThemeProvider>,
        )
        fireEvent.click(screen.getByRole('button', { name: 'Model' }))
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
        expect(setSettings).toHaveBeenCalledWith({agent: 'codex', model: 'gpt-5.5', permissionMode: 'approve-for-me', thinkingLevel: 'high'}, true)
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
