import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfigPage } from './config_page'
import { configService } from '../../services/config_service'
import { BUILTIN_AGENT_PROFILES } from '../../data/agent_profiles'
import { dataService } from '../../services/data_service'
import { dialogService } from '../../services/dialog_service'

function mockMatchMedia(matches: boolean) {
    window.matchMedia = ((query: string) => ({
        addEventListener: () => {},
        addListener: () => {},
        dispatchEvent: () => false,
        matches,
        media: query,
        onchange: null,
        removeEventListener: () => {},
        removeListener: () => {},
    })) as unknown as typeof window.matchMedia
}

function initConfigFromElectronBridge() {
    const desktopConfig = window.md2Config?.getDesktopConfig() ?? null
    configService.init({ desktopConfig })
}

describe('ConfigPage', () => {
    afterEach(() => {
        cleanup()
        vi.useRealTimers()
        configService.clear()
        window.history.pushState(null, '', '/config')
        mockMatchMedia(false)
        window.localStorage.clear()
        delete window.md2Config
    })

    it('renders typed editors with descriptions', () => {
        mockMatchMedia(false)
        configService.init()

        render(<ConfigPage hash="" />)

        expect(screen.getByRole('switch', { name: 'Startup splash' })).toBeInTheDocument()
        expect(screen.getByRole('slider', { name: 'Auto commit delay' })).toBeInTheDocument()
        expect(screen.getByText('Delay before editor changes are committed after typing stops.')).toBeInTheDocument()
        expect(screen.getByRole('region', { name: 'React app' })).toHaveClass('MuiPaper-outlined')
        expect(screen.queryByLabelText('GitHub scopes')).toBeNull()
    })

    it('renders only the section selected by the hash route', () => {
        mockMatchMedia(false)
        configService.init()

        render(<ConfigPage hash="#connection" />)

        expect(screen.getByLabelText('GitHub scopes')).toBeInTheDocument()
        expect(screen.getByText('OAuth scopes requested when connecting GitHub.')).toBeInTheDocument()
        expect(screen.queryByRole('switch', { name: 'Startup splash' })).toBeNull()
        expect(screen.getByRole('tab', { name: 'React app' })).toHaveAttribute('href', '#react')
    })

    it('loads the config draft once under StrictMode', () => {
        mockMatchMedia(false)
        configService.init()
        const loadDraft = vi.spyOn(configService, 'loadDraft')

        render(
            <StrictMode>
                <ConfigPage hash="" />
            </StrictMode>,
        )

        expect(loadDraft).toHaveBeenCalledTimes(1)
        expect(screen.getByRole('switch', { name: 'Startup splash' })).toBeInTheDocument()
    })

    it('keeps the draft through StrictMode remount and discards it on real unmount', () => {
        vi.useFakeTimers()
        mockMatchMedia(false)
        configService.init()

        const { unmount } = render(
            <StrictMode>
                <ConfigPage hash="" />
            </StrictMode>,
        )

        act(() => {
            vi.runOnlyPendingTimers()
        })

        expect(configService.getDraft()).not.toBeNull()

        unmount()
        act(() => {
            vi.runOnlyPendingTimers()
        })

        expect(configService.getDraft()).toBeNull()
        vi.useRealTimers()
    })

    it('saves draft edits into active config', () => {
        mockMatchMedia(false)
        configService.init()

        render(<ConfigPage hash="" />)
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(configService.get('react.showStartupSplash')).toBe(false)
    })

    it('reports success and closes the config page after saving', async () => {
        mockMatchMedia(false)
        configService.init()
        const reportSuccess = vi.spyOn(dialogService, 'success')

        render(<ConfigPage hash="" />)
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => {
            expect(reportSuccess).toHaveBeenCalledWith('Config saved')
            expect(window.location.pathname).toBe('/')
        })

        reportSuccess.mockRestore()
    })

    it('saves slider draft edits into active config', () => {
        mockMatchMedia(false)
        configService.init()

        render(<ConfigPage hash="" />)
        fireEvent.change(screen.getByRole('slider', { name: 'Auto commit delay' }), { target: { value: '5000' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(configService.get('react.autoCommitDelayMs')).toBe(5000)
    })

    it('does not save project config when only React config changed', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)
        const saveProjectConfig = vi.spyOn(dataService.projectLoading, 'saveProjectConfig').mockResolvedValue()

        render(<ConfigPage hash="" />)
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(saveProjectConfig).not.toHaveBeenCalled()
        saveProjectConfig.mockRestore()
    })

    it('saves project config when project config changed', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)
        const saveProjectConfig = vi.spyOn(dataService.projectLoading, 'saveProjectConfig').mockResolvedValue()

        render(<ConfigPage hash="#project" />)
        configService.setDraftValue('project.pushMode', 'manual')
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(saveProjectConfig).toHaveBeenCalledTimes(1)
        saveProjectConfig.mockRestore()
    })

    it('edits project states as ordered JSON definitions', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)

        render(<ConfigPage hash="#project" />)
        const statesEditor = screen.getByRole('textbox', { name: 'States' })
        const states = [
            { alwaysVisible: true, state: 'backlog' },
            { alwaysVisible: false, state: 'done' },
        ]
        fireEvent.change(statesEditor, { target: { value: JSON.stringify(states) } })
        fireEvent.blur(statesEditor)

        expect(configService.getDraft()?.['project.states']).toEqual(states)
    })

    it('keeps the config page visible while project config save is pending', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)
        const saveProjectConfig = vi.spyOn(dataService.projectLoading, 'saveProjectConfig').mockReturnValue(new Promise(() => undefined))

        render(<ConfigPage hash="#project" />)
        configService.setDraftValue('project.pushMode', 'manual')
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(screen.getByRole('tablist', { name: 'Config sections' })).toBeInTheDocument()
        expect(screen.getByLabelText('Push mode')).toBeInTheDocument()
        saveProjectConfig.mockRestore()
    })

    it('reports project config save errors through the dialog service', async () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)
        const saveProjectConfig = vi.spyOn(dataService.projectLoading, 'saveProjectConfig').mockRejectedValue(new Error('GitHub save failed'))
        const reportError = vi.spyOn(dialogService, 'error')

        render(<ConfigPage hash="#project" />)
        configService.setDraftValue('project.pushMode', 'manual')
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => {
            expect(reportError).toHaveBeenCalledWith(expect.any(Error), { fallbackMessage: 'Config save failed' })
        })
        expect(window.location.pathname).toBe('/config')

        reportError.mockRestore()
        saveProjectConfig.mockRestore()
    })

    it('cancels draft edits without changing active config', () => {
        mockMatchMedia(false)
        configService.init()

        render(<ConfigPage hash="" />)
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.change(screen.getByRole('slider', { name: 'Auto commit delay' }), { target: { value: '5000' } })
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(configService.get('react.showStartupSplash')).toBe(true)
        expect(configService.get('react.autoCommitDelayMs')).toBe(30000)
        expect(window.location.pathname).toBe('/')
    })

    it('scrolls desktop section tabs separately from the active section content', () => {
        mockMatchMedia(false)
        configService.init({
            desktopConfig: {
                agent: 'codex',
                agentSlotCommand: '',
                agentProfiles: BUILTIN_AGENT_PROFILES,
                model: '',
                projectLocationMode: 'folder',
            },
        })
        configService.loadProjectConfig(null)

        render(<ConfigPage hash="#project" />)

        expect(screen.getByRole('region', { name: 'Config page' })).toHaveStyle({ overflow: 'hidden' })
        expect(screen.getByRole('navigation', { name: 'Config section navigation' })).toHaveStyle({ overflow: 'auto' })
        expect(screen.getByRole('region', { name: 'Config section content' })).toHaveStyle({ overflow: 'auto' })
        expect(screen.getByRole('tablist', { name: 'Config sections' })).toHaveAttribute('aria-orientation', 'vertical')
        expect(screen.getByRole('tab', { name: 'Project' })).toHaveAttribute('href', '#project')
        expect(screen.getByRole('tab', { name: 'Desktop' })).toBeInTheDocument()
    })

    it('uses horizontal section tabs on mobile', () => {
        mockMatchMedia(true)
        configService.init()

        render(<ConfigPage hash="#connection" />)

        expect(screen.getByRole('tablist', { name: 'Config sections' })).not.toHaveAttribute('aria-orientation', 'vertical')
    })

    it('pushes desktop config edits through the electron bridge on save', () => {
        mockMatchMedia(false)
        const setDesktopConfig = vi.fn()
        window.md2Config = {
            getDesktopConfig: () => ({
                agent: 'codex',
                agentSlotCommand: 'old-slot-command',
                agentProfiles: BUILTIN_AGENT_PROFILES,
                model: '',
                projectLocationMode: 'folder',
            }),
            setDesktopConfig,
        }
        initConfigFromElectronBridge()

        render(<ConfigPage hash="#desktop" />)
        configService.setDraftValue('desktop.agent', 'claude')
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(setDesktopConfig).toHaveBeenCalledWith({
            agent: 'claude',
            agentSlotCommand: 'old-slot-command',
            agentProfiles: BUILTIN_AGENT_PROFILES,
            model: '',
            projectLocationMode: 'folder',
        })

        delete window.md2Config
    })

    it('adds an agent profile with fields and persists it through the desktop bridge', () => {
        mockMatchMedia(false)
        const setDesktopConfig = vi.fn()
        window.md2Config = {
            getDesktopConfig: () => ({
                agent: 'codex',
                agentSlotCommand: '',
                agentProfiles: BUILTIN_AGENT_PROFILES,
                model: '',
                projectLocationMode: 'folder',
            }),
            setDesktopConfig,
        }
        initConfigFromElectronBridge()

        render(<ConfigPage hash="#desktop" />)
        fireEvent.click(screen.getByRole('button', { name: 'Add profile' }))

        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'local' } })
        fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'local-agent {{model}}' } })
        fireEvent.change(screen.getByLabelText('Model argument'), { target: { value: '--model' } })
        fireEvent.change(screen.getByLabelText('Models'), { target: { value: 'gpt-5, gpt-5-mini' } })
        fireEvent.change(screen.getByLabelText('Profile default model'), { target: { value: 'gpt-5' } })
        fireEvent.change(screen.getByLabelText('Resume command'), { target: { value: 'local resume {{sessionId}}' } })
        fireEvent.change(screen.getByLabelText('Session-id pattern'), { target: { value: 'session ([a-z0-9-]+)' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(setDesktopConfig).toHaveBeenCalledWith(expect.objectContaining({
            agentProfiles: expect.arrayContaining([
                expect.objectContaining({
                    command: 'local-agent {{model}}',
                    defaultModel: 'gpt-5',
                    modelArgument: '--model',
                    models: ['gpt-5', 'gpt-5-mini'],
                    name: 'local',
                    resumeCommand: 'local resume {{sessionId}}',
                    sessionIdPattern: 'session ([a-z0-9-]+)',
                }),
            ]),
        }))
        expect(configService.get('desktop.agentProfiles')).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'local' })]))

        delete window.md2Config
    })

    it('edits and removes user agent profiles while built-ins stay read-only', () => {
        mockMatchMedia(false)
        const setDesktopConfig = vi.fn()
        window.md2Config = {
            getDesktopConfig: () => ({
                agent: 'codex',
                agentSlotCommand: '',
                agentProfiles: [...BUILTIN_AGENT_PROFILES, { command: 'local-agent', name: 'local' }],
                model: '',
                projectLocationMode: 'folder',
            }),
            setDesktopConfig,
        }
        initConfigFromElectronBridge()

        render(<ConfigPage hash="#desktop" />)

        expect(screen.getAllByText('Built-in')).toHaveLength(2)

        fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
        fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'edited-agent' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(setDesktopConfig).toHaveBeenLastCalledWith(expect.objectContaining({agentProfiles: expect.arrayContaining([expect.objectContaining({ command: 'edited-agent', name: 'local' })])}))

        fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        const lastCall = setDesktopConfig.mock.calls.at(-1)?.[0]
        expect(lastCall.agentProfiles).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'local' })]))

        delete window.md2Config
    })

    it('reports agent profile validation errors before page save is enabled', () => {
        mockMatchMedia(false)
        window.md2Config = {
            getDesktopConfig: () => ({
                agent: 'codex',
                agentSlotCommand: '',
                agentProfiles: BUILTIN_AGENT_PROFILES,
                model: '',
                projectLocationMode: 'folder',
            }),
            setDesktopConfig: vi.fn(),
        }
        initConfigFromElectronBridge()

        render(<ConfigPage hash="#desktop" />)
        fireEvent.click(screen.getByRole('button', { name: 'Add profile' }))

        expect(screen.getByText(/Name is required/)).toBeInTheDocument()
        expect(screen.getByText(/Command is required/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'codex' } })
        fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'agent' } })

        expect(screen.getByText('Duplicate agent profile: codex')).toBeInTheDocument()

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'local' } })
        fireEvent.change(screen.getByLabelText('Session-id pattern'), { target: { value: '(' } })

        expect(screen.getByText('Session-id pattern is not a valid regular expression.')).toBeInTheDocument()

        fireEvent.change(screen.getByLabelText('Session-id pattern'), { target: { value: '(?:session)' } })

        expect(screen.getByText('Session-id pattern must include one capture group.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled()

        delete window.md2Config
    })

    it('renders desktop config values initialized during bootstrap', () => {
        mockMatchMedia(false)
        window.md2Config = {
            getDesktopConfig: () => ({
                agent: 'claude',
                agentSlotCommand: 'slot-command',
                agentProfiles: BUILTIN_AGENT_PROFILES,
                model: '',
                projectLocationMode: 'current-directory',
            }),
            setDesktopConfig: vi.fn(),
        }
        initConfigFromElectronBridge()

        render(<ConfigPage hash="#desktop" />)

        expect(configService.get('desktop.agent')).toBe('claude')
        expect(configService.get('desktop.agentSlotCommand')).toBe('slot-command')
        expect(configService.get('desktop.projectLocationMode')).toBe('current-directory')
        expect(screen.getByRole('tab', { name: 'Desktop' })).toBeInTheDocument()
        expect(screen.getByLabelText('Agent slot command')).toHaveValue('slot-command')

        delete window.md2Config
    })

    it('shows disabled desktop config entries in web mode', () => {
        mockMatchMedia(false)
        configService.init()

        render(<ConfigPage hash="#desktop" />)

        expect(screen.getByRole('tab', { name: 'Desktop' })).toBeInTheDocument()
        expect(screen.getByLabelText('Default agent')).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByLabelText('Agent slot command')).toBeDisabled()
        expect(screen.getByLabelText('Project location')).toHaveAttribute('aria-disabled', 'true')
    })

    it('never touches the desktop bridge in web mode', () => {
        mockMatchMedia(false)
        configService.init()

        render(<ConfigPage hash="" />)
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(window.md2Config).toBeUndefined()
    })
})
