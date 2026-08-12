import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultColumnAccent } from '../../data/data_types'
import { ConfigPage } from './config_page'
import { configService } from '../../services/config/config_service'
import { BUILTIN_AGENT_PROFILES } from '../../data/agent_profiles'
import { dataService } from '../../services/data/data_service'
import { dialogService } from '../../services/dialog_service'
import { worktreeService } from '../../services/project/worktree_service'
import { CUSTOM_MARKDOWN_STYLE_STORAGE_KEY, MARKDOWN_STYLE_STORAGE_KEY } from '../../theme/use_theme_settings'
import { MARKDOWN_STYLE_PRESETS, type MarkdownStyleConfig, type MarkdownStylePresetName } from '../../theme/theme_config'
import type { DesktopConfigValues } from '../../services/config/config_entries'
import { setDesktopConfigTransportOverride } from '../../services/config/desktop_config_transport'
import { agentCapabilitiesService } from '../../services/agents/agent_capabilities_service'

const useAppThemeMock = vi.hoisted(() => vi.fn())

vi.mock('../../theme/use_app_theme', () => ({ useAppTheme: useAppThemeMock }))

function renderConfigPage(hash: string, strict = false) {
    const configPage = <ConfigPage hash={hash} />

    return render(strict ? <StrictMode>{configPage}</StrictMode> : configPage)
}

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
    beforeEach(() => {
        window.location.hash = '#/config'
        useAppThemeMock.mockReturnValue({
            markdownStyle: 'modern',
            markdownStyleConfig: MARKDOWN_STYLE_PRESETS.modern,
            setCustomMarkdownStyle: (config: MarkdownStyleConfig) => {
                window.localStorage.setItem(MARKDOWN_STYLE_STORAGE_KEY, 'custom')
                window.localStorage.setItem(CUSTOM_MARKDOWN_STYLE_STORAGE_KEY, JSON.stringify(config))
            },
            setMarkdownStyle: (preset: MarkdownStylePresetName) => {
                window.localStorage.setItem(MARKDOWN_STYLE_STORAGE_KEY, preset)
            },
        })
    })

    afterEach(() => {
        cleanup()
        vi.useRealTimers()
        configService.clear()
        worktreeService.clear()
        window.location.hash = '#/config'
        mockMatchMedia(false)
        window.localStorage.clear()
        delete window.md2Config
        delete window.md2Data
        delete window.md2RemoteControl
        setDesktopConfigTransportOverride(null)
    })

    it('renders typed editors with descriptions', () => {
        mockMatchMedia(false)
        configService.init()

        renderConfigPage('')

        expect(screen.getByRole('switch', { name: 'Startup splash' })).toBeInTheDocument()
        expect(screen.getByRole('slider', { name: 'Auto commit delay' })).toBeInTheDocument()
        expect(screen.getByText('Delay before editor changes are committed after typing stops.')).toBeInTheDocument()
        expect(screen.getByRole('region', { name: 'React app' })).not.toHaveClass('MuiPaper-root')
        expect(screen.queryByLabelText('GitHub scopes')).toBeNull()
    })

    it('renders only the section selected by the hash route', () => {
        mockMatchMedia(false)
        configService.init()

        renderConfigPage('#desktop')

        expect(screen.getByLabelText('Default agent')).toBeInTheDocument()
        expect(screen.queryByRole('switch', { name: 'Startup splash' })).toBeNull()
        expect(screen.getByRole('tab', { name: 'React app' })).toHaveAttribute('href', '#/config/react')
    })

    it('renders global markdown settings in a dedicated tab', () => {
        mockMatchMedia(false)
        configService.init()

        renderConfigPage('#markdown')

        expect(screen.getByRole('tab', { name: 'Markdown' })).toHaveAttribute('href', '#/config/markdown')
        expect(screen.getByRole('region', { name: 'Markdown' })).toBeInTheDocument()
        expect(screen.getByLabelText('Markdown style preview')).toBeInTheDocument()
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Style' }))
        expect(screen.getByRole('option', { name: 'Custom' })).toBeInTheDocument()
    })

    it('switches edited presets to custom and saves the style in local storage', () => {
        mockMatchMedia(false)
        configService.init()

        renderConfigPage('#markdown')
        fireEvent.click(screen.getByRole('button', { name: 'Body' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Font size for Body' }), { target: { value: '1.2rem' } })

        expect(screen.getByRole('combobox', { name: 'Style' })).toHaveTextContent('Custom')
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(window.localStorage.getItem(MARKDOWN_STYLE_STORAGE_KEY)).toBe('custom')
        expect(JSON.parse(window.localStorage.getItem(CUSTOM_MARKDOWN_STYLE_STORAGE_KEY)!).body.fontSize).toBe('1.2rem')
    })

    it('discards unsaved markdown style edits', () => {
        mockMatchMedia(false)
        configService.init()

        renderConfigPage('#markdown')
        fireEvent.click(screen.getByRole('button', { name: 'Body' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Font size for Body' }), { target: { value: '1.2rem' } })
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(window.localStorage.getItem(MARKDOWN_STYLE_STORAGE_KEY)).toBeNull()
        expect(window.localStorage.getItem(CUSTOM_MARKDOWN_STYLE_STORAGE_KEY)).toBeNull()
    })

    it('keeps custom settings when replacing them is not confirmed', () => {
        mockMatchMedia(false)
        configService.init()
        const confirmReplace = vi.spyOn(window, 'confirm').mockReturnValue(false)

        renderConfigPage('#markdown')
        fireEvent.click(screen.getByRole('button', { name: 'Body' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Font size for Body' }), { target: { value: '1.2rem' } })
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Style' }))
        fireEvent.click(screen.getByRole('option', { name: 'Serif' }))

        expect(confirmReplace).toHaveBeenCalledWith('Replace custom Markdown settings with the selected predefined style?')
        expect(screen.getByRole('combobox', { name: 'Style' })).toHaveTextContent('Custom')
        expect(screen.getByRole('textbox', { name: 'Font size for Body' })).toHaveValue('1.2rem')
        confirmReplace.mockRestore()
    })

    it('loads the config draft once under StrictMode', () => {
        mockMatchMedia(false)
        configService.init()
        const loadDraft = vi.spyOn(configService, 'loadDraft')

        renderConfigPage('', true)

        expect(loadDraft).toHaveBeenCalledTimes(1)
        expect(screen.getByRole('switch', { name: 'Startup splash' })).toBeInTheDocument()
    })

    it('keeps the draft through StrictMode remount and discards it on real unmount', () => {
        vi.useFakeTimers()
        mockMatchMedia(false)
        configService.init()

        const { unmount } = renderConfigPage('', true)

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

        renderConfigPage('')
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(configService.get('react.showStartupSplash')).toBe(false)
    })

    it('reports success and closes the config page after saving', async () => {
        mockMatchMedia(false)
        configService.init()
        const reportSuccess = vi.spyOn(dialogService, 'success')

        renderConfigPage('')
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => {
            expect(reportSuccess).toHaveBeenCalledWith('Config saved')
            expect(window.location.hash).toBe('')
        })

        reportSuccess.mockRestore()
    })

    it('saves slider draft edits into active config', () => {
        mockMatchMedia(false)
        configService.init()

        renderConfigPage('')
        fireEvent.change(screen.getByRole('slider', { name: 'Auto commit delay' }), { target: { value: '5000' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(configService.get('react.autoCommitDelayMs')).toBe(5000)
    })

    it('does not save project config when only React config changed', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)
        const saveProjectConfig = vi.spyOn(dataService.projectLoading, 'saveProjectConfig').mockResolvedValue()

        renderConfigPage('')
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

        renderConfigPage('#project')
        configService.setDraftValue('project.pushMode', 'auto')
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(saveProjectConfig).toHaveBeenCalledTimes(1)
        saveProjectConfig.mockRestore()
    })

    it('shows release and archived folder project settings', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)

        renderConfigPage('#project')

        expect(screen.getByLabelText('Releases folder')).toHaveValue('history')
        expect(screen.getByLabelText('Archived folder')).toHaveValue('archived')
    })

    it('offers the allowed background shades in the Project section', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)

        renderConfigPage('#project')
        fireEvent.mouseDown(screen.getByLabelText('Background shade'))

        expect(screen.getByRole('option', { name: 'Neutral' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Blue' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Green' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Red' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Purple' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Amber' })).toBeInTheDocument()
    })

    it('warns when the card separator is changed', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig({ workingFolder: 'design' })
        const reportWarning = vi.spyOn(dialogService, 'warning')

        renderConfigPage('#project')
        fireEvent.mouseDown(screen.getByLabelText('Card separator'))
        fireEvent.click(screen.getByRole('option', { name: 'Underscore (_)' }))

        expect(reportWarning).toHaveBeenCalledWith(
            'Saving this change will rename existing card files and update their IDs.',
            { critical: true, title: 'Card files will be renamed' },
        )
        reportWarning.mockRestore()
    })

    it('renames card files before saving a changed separator', async () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig({ workingFolder: 'design' })
        const updateCardSeparator = vi.spyOn(dataService.projectLoading, 'updateCardSeparator').mockResolvedValue(2)
        const saveProjectConfig = vi.spyOn(dataService.projectLoading, 'saveProjectConfig').mockResolvedValue()

        renderConfigPage('#project')
        fireEvent.mouseDown(screen.getByLabelText('Card separator'))
        fireEvent.click(screen.getByRole('option', { name: 'Underscore (_)' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => {
            expect(updateCardSeparator).toHaveBeenCalledWith('-', '_')
            expect(saveProjectConfig).toHaveBeenCalledTimes(1)
        })
        expect(updateCardSeparator.mock.invocationCallOrder[0]).toBeLessThan(saveProjectConfig.mock.invocationCallOrder[0])
        expect(configService.get('project.cardSeparator')).toBe('_')

        updateCardSeparator.mockRestore()
        saveProjectConfig.mockRestore()
    })

    it('edits project columns as ordered JSON definitions', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)

        renderConfigPage('#project')
        const statesEditor = screen.getByRole('textbox', { name: 'Columns' })
        const states = [
            { alwaysVisible: true, state: 'backlog' },
            { alwaysVisible: false, state: 'done' },
        ]
        fireEvent.change(statesEditor, { target: { value: JSON.stringify(states) } })
        fireEvent.blur(statesEditor)

        expect(configService.getDraft()?.['project.states']).toEqual(states.map((state, index) => ({
            ...state,
            color: defaultColumnAccent(index),
        })))
    })

    it('keeps the config page visible while project config save is pending', () => {
        mockMatchMedia(false)
        configService.init()
        configService.loadProjectConfig(null)
        const saveProjectConfig = vi.spyOn(dataService.projectLoading, 'saveProjectConfig').mockReturnValue(new Promise(() => undefined))

        renderConfigPage('#project')
        configService.setDraftValue('project.pushMode', 'auto')
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

        renderConfigPage('#project')
        configService.setDraftValue('project.pushMode', 'auto')
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => {
            expect(reportError).toHaveBeenCalledWith(expect.any(Error), { fallbackMessage: 'Config save failed' })
        })
        expect(window.location.hash).toBe('#/config')

        reportError.mockRestore()
        saveProjectConfig.mockRestore()
    })

    it('cancels draft edits without changing active config', () => {
        mockMatchMedia(false)
        configService.init()

        renderConfigPage('')
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.change(screen.getByRole('slider', { name: 'Auto commit delay' }), { target: { value: '5000' } })
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(configService.get('react.showStartupSplash')).toBe(true)
        expect(configService.get('react.autoCommitDelayMs')).toBe(30000)
        expect(window.location.hash).toBe('')
    })

    it('scrolls desktop section tabs separately from the active section content', () => {
        mockMatchMedia(false)
        configService.init({
            desktopConfig: {
                agent: 'codex',
                agentProfiles: BUILTIN_AGENT_PROFILES,
                model: '',
            },
        })
        configService.loadProjectConfig(null)

        renderConfigPage('#project')

        expect(screen.getByRole('dialog', { name: 'Config' })).toBeInTheDocument()
        expect(screen.getByLabelText('Config dialog body')).toHaveStyle({ overflow: 'hidden' })
        expect(screen.getByRole('navigation', { name: 'Config section navigation' })).toHaveStyle({ overflow: 'auto' })
        expect(screen.getByRole('region', { name: 'Config section content' })).toHaveStyle({ overflow: 'auto' })
        expect(screen.getByRole('tablist', { name: 'Config sections' })).toHaveAttribute('aria-orientation', 'vertical')
        expect(screen.getByRole('tab', { name: 'Project' })).toHaveAttribute('href', '#/config/project')
        expect(screen.getByRole('tab', { name: 'Desktop' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('MuiButton-outlined')
        expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('MuiButton-contained')
    })

    it('uses horizontal section tabs on mobile', () => {
        mockMatchMedia(true)
        configService.init()

        renderConfigPage('#connection')

        expect(screen.getByRole('tablist', { name: 'Config sections' })).not.toHaveAttribute('aria-orientation', 'vertical')
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    })

    it('discards edits and closes from Escape', async () => {
        mockMatchMedia(false)
        configService.init()

        renderConfigPage('')
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.keyDown(screen.getByRole('dialog', { name: 'Config' }), { key: 'Escape' })

        await waitFor(() => expect(window.location.hash).toBe(''))
        expect(configService.get('react.showStartupSplash')).toBe(true)
    })

    it('pushes desktop config edits through the electron bridge on save', () => {
        mockMatchMedia(false)
        const setDesktopConfig = vi.fn(async (values: DesktopConfigValues) => values)
        window.md2Config = {
            getDesktopConfig: () => ({
                agent: 'codex',
                agentProfiles: BUILTIN_AGENT_PROFILES,
                model: '',
            }),
            setDesktopConfig,
        }
        initConfigFromElectronBridge()

        renderConfigPage('#desktop')
        configService.setDraftValue('desktop.agent', 'claude')
        fireEvent.change(screen.getByLabelText('Editor command'), { target: { value: 'notepad "{{file}}"' } })
        fireEvent.click(screen.getByRole('switch', { name: 'Codex web search' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(setDesktopConfig).toHaveBeenCalledWith({
            agent: 'claude',
            agentProfiles: BUILTIN_AGENT_PROFILES,
            codexSearchEnabled: false,
            editorCommand: 'notepad "{{file}}"',
            mergeConflictResolverCommand: '',
            model: '',
            permissionMode: 'ask-for-approval',
            remoteControlPort: 20877,
            thinkingLevel: 'none',
        })

        delete window.md2Config
    })

    it.each(['0', '65536', '20877.5'])('blocks saving invalid remote-control port %s', (port) => {
        mockMatchMedia(false)
        window.md2Config = {
            getDesktopConfig: () => ({ remoteControlPort: 20877 }),
            setDesktopConfig: vi.fn(async (values: DesktopConfigValues) => values),
        }
        initConfigFromElectronBridge()
        renderConfigPage('#desktop')

        fireEvent.change(screen.getByLabelText('Remote-control port'), { target: { value: port } })

        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    it('closes Config before restarting an active server on changed port', async () => {
        mockMatchMedia(false)
        const setDesktopConfig = vi.fn(async (values: DesktopConfigValues) => values)
        const stop = vi.fn(async () => {
            expect(window.location.hash).toBe('')

            return { active: false, clientCount: 0, endpoint: null }
        })
        const start = vi.fn(async () => ({ active: true, clientCount: 0, endpoint: 'ws://127.0.0.1:20878' }))
        window.md2Config = { getDesktopConfig: () => ({ remoteControlPort: 20877 }), setDesktopConfig }
        window.md2RemoteControl = {
            getStatus: vi.fn(async () => ({ active: true, clientCount: 0, endpoint: 'ws://127.0.0.1:20877' })),
            onStatusChange: vi.fn(() => () => undefined),
            start,
            stop,
        }
        initConfigFromElectronBridge()
        renderConfigPage('#desktop')

        fireEvent.change(screen.getByLabelText('Remote-control port'), { target: { value: '20878' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => expect(start).toHaveBeenCalledOnce())
        expect(stop).toHaveBeenCalledOnce()
        expect(setDesktopConfig).toHaveBeenCalledWith(expect.objectContaining({ remoteControlPort: 20878 }))
        expect(stop.mock.invocationCallOrder[0]).toBeLessThan(start.mock.invocationCallOrder[0])
    })

    it('leaves server stopped and reports a bind failure after port save', async () => {
        mockMatchMedia(false)
        const bindError = new Error('listen EADDRINUSE: address already in use')
        const error = vi.spyOn(dialogService, 'error')
        const stop = vi.fn(async () => ({ active: false, clientCount: 0, endpoint: null }))
        const start = vi.fn(async () => { throw bindError })
        window.md2Config = {
            getDesktopConfig: () => ({ remoteControlPort: 20877 }),
            setDesktopConfig: vi.fn(async (values: DesktopConfigValues) => values),
        }
        window.md2RemoteControl = {
            getStatus: vi.fn(async () => ({ active: true, clientCount: 0, endpoint: 'ws://127.0.0.1:20877' })),
            onStatusChange: vi.fn(() => () => undefined),
            start,
            stop,
        }
        initConfigFromElectronBridge()
        renderConfigPage('#desktop')

        fireEvent.change(screen.getByLabelText('Remote-control port'), { target: { value: '20878' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => expect(error).toHaveBeenCalledWith(bindError, { fallbackMessage: 'Remote-control restart failed' }))
        expect(stop).toHaveBeenCalledOnce()
        expect(start).toHaveBeenCalledOnce()
        expect(window.location.hash).toBe('')
    })

    it('does not restart when changed port is saved while server is stopped', async () => {
        mockMatchMedia(false)
        const stop = vi.fn()
        const start = vi.fn()
        window.md2Config = {
            getDesktopConfig: () => ({ remoteControlPort: 20877 }),
            setDesktopConfig: vi.fn(async (values: DesktopConfigValues) => values),
        }
        window.md2RemoteControl = {
            getStatus: vi.fn(async () => ({ active: false, clientCount: 0, endpoint: null })),
            onStatusChange: vi.fn(() => () => undefined),
            start,
            stop,
        }
        initConfigFromElectronBridge()
        renderConfigPage('#desktop')

        fireEvent.change(screen.getByLabelText('Remote-control port'), { target: { value: '20878' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => expect(window.location.hash).toBe(''))
        expect(stop).not.toHaveBeenCalled()
        expect(start).not.toHaveBeenCalled()
    })

    it('does not inspect or restart server when saved port is unchanged', async () => {
        mockMatchMedia(false)
        const getStatus = vi.fn()
        const stop = vi.fn()
        const start = vi.fn()
        window.md2Config = {
            getDesktopConfig: () => ({ remoteControlPort: 20877 }),
            setDesktopConfig: vi.fn(async (values: DesktopConfigValues) => values),
        }
        window.md2RemoteControl = { getStatus, onStatusChange: vi.fn(() => () => undefined), start, stop }
        initConfigFromElectronBridge()
        renderConfigPage('#desktop')

        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => expect(window.location.hash).toBe(''))
        expect(getStatus).not.toHaveBeenCalled()
        expect(stop).not.toHaveBeenCalled()
        expect(start).not.toHaveBeenCalled()
    })

    it('does not inspect or restart server when Config is cancelled', async () => {
        mockMatchMedia(false)
        const getStatus = vi.fn()
        const stop = vi.fn()
        const start = vi.fn()
        window.md2Config = {
            getDesktopConfig: () => ({ remoteControlPort: 20877 }),
            setDesktopConfig: vi.fn(async (values: DesktopConfigValues) => values),
        }
        window.md2RemoteControl = { getStatus, onStatusChange: vi.fn(() => () => undefined), start, stop }
        initConfigFromElectronBridge()
        renderConfigPage('#desktop')

        fireEvent.change(screen.getByLabelText('Remote-control port'), { target: { value: '20878' } })
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        await waitFor(() => expect(window.location.hash).toBe(''))
        expect(getStatus).not.toHaveBeenCalled()
        expect(stop).not.toHaveBeenCalled()
        expect(start).not.toHaveBeenCalled()
    })

    it('awaits remote persistence, applies returned config, then reloads availability', async () => {
        mockMatchMedia(false)
        const hostConfig: DesktopConfigValues = {
            agent: 'custom',
            agentProfiles: [{ command: ['custom'], models: ['host-model'], name: 'custom' }],
            codexSearchEnabled: true,
            editorCommand: 'code "{{file}}"',
            mergeConflictResolverCommand: '',
            model: 'host-model',
            permissionMode: 'ask-for-approval',
            remoteControlPort: 20877,
            thinkingLevel: 'medium',
        }
        let acknowledgeSave: (value: DesktopConfigValues) => void = () => undefined
        const saveDesktopConfig = vi.fn(() => new Promise<DesktopConfigValues>((resolve) => {
            acknowledgeSave = resolve
        }))
        setDesktopConfigTransportOverride({ loadDesktopConfig: vi.fn(async () => hostConfig), saveDesktopConfig })
        vi.spyOn(agentCapabilitiesService, 'reload').mockResolvedValue()
        configService.init()
        configService.replaceDesktopConfig(hostConfig)
        renderConfigPage('#desktop')
        configService.setDraftValue('desktop.model', 'saved-model')

        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(saveDesktopConfig).toHaveBeenCalledWith({ ...hostConfig, model: 'saved-model' })
        expect(configService.get('desktop.model')).toBe('host-model')
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

        acknowledgeSave({ ...hostConfig, model: 'normalized-model' })
        await waitFor(() => expect(configService.get('desktop.model')).toBe('normalized-model'))
        expect(agentCapabilitiesService.reload).toHaveBeenCalledOnce()
    })

    it('keeps remote desktop edits in draft when persistence fails', async () => {
        mockMatchMedia(false)
        const hostConfig: DesktopConfigValues = {
            agent: 'codex',
            agentProfiles: BUILTIN_AGENT_PROFILES,
            codexSearchEnabled: true,
            editorCommand: 'code "{{file}}"',
            mergeConflictResolverCommand: '',
            model: '',
            permissionMode: 'ask-for-approval',
            remoteControlPort: 20877,
            thinkingLevel: 'none',
        }
        const saveError = new Error('Host rejected desktop config')
        setDesktopConfigTransportOverride({
            loadDesktopConfig: vi.fn(async () => hostConfig),
            saveDesktopConfig: vi.fn(async () => { throw saveError }),
        })
        const error = vi.spyOn(dialogService, 'error')
        const success = vi.spyOn(dialogService, 'success')
        configService.init()
        configService.replaceDesktopConfig(hostConfig)
        renderConfigPage('#desktop')
        configService.setDraftValue('desktop.model', 'unsaved-model')

        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => expect(error).toHaveBeenCalledWith(saveError, { fallbackMessage: 'Config save failed' }))
        expect(configService.get('desktop.model')).toBe('')
        expect(success).not.toHaveBeenCalled()
    })

    it('adds an agent profile with fields and persists it through the desktop bridge', async () => {
        mockMatchMedia(false)
        const setDesktopConfig = vi.fn(async (values: DesktopConfigValues) => values)
        window.md2Config = {
            getDesktopConfig: () => ({
                agent: 'codex',
                agentProfiles: BUILTIN_AGENT_PROFILES,
                model: '',
            }),
            setDesktopConfig,
        }
        initConfigFromElectronBridge()

        renderConfigPage('#desktop')
        fireEvent.click(screen.getByRole('button', { name: 'Add profile' }))

        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
        expect(screen.queryByLabelText('Access levels')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Approval policies')).not.toBeInTheDocument()

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'local' } })
        fireEvent.change(screen.getByLabelText('Command'), { target: { value: '["local-agent", "{{model}}"]' } })
        fireEvent.change(screen.getByLabelText('Model argument'), { target: { value: '--model' } })
        fireEvent.change(screen.getByLabelText('Models'), { target: { value: 'gpt-5, gpt-5-mini' } })
        fireEvent.change(screen.getByLabelText('Profile default model'), { target: { value: 'gpt-5' } })
        fireEvent.change(screen.getByLabelText('Resume command'), { target: { value: '["local", "resume", "{{sessionId}}"]' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(setDesktopConfig).toHaveBeenCalledWith(expect.objectContaining({
            agentProfiles: expect.arrayContaining([
                expect.objectContaining({
                    command: ['local-agent', '{{model}}'],
                    defaultModel: 'gpt-5',
                    modelArgument: '--model',
                    models: ['gpt-5', 'gpt-5-mini'],
                    name: 'local',
                    resumeCommand: ['local', 'resume', '{{sessionId}}'],
                }),
            ]),
        }))
        await waitFor(() => expect(configService.get('desktop.agentProfiles')).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'local' }),
        ])))

        delete window.md2Config
    })

    it('edits and removes user agent profiles while built-ins stay non-removable', async () => {
        mockMatchMedia(false)
        const setDesktopConfig = vi.fn(async (values: DesktopConfigValues) => values)
        window.md2Config = {
            getDesktopConfig: () => ({
                agent: 'codex',
                agentProfiles: [...BUILTIN_AGENT_PROFILES, { command: ['local-agent'], models: ['local-model'], name: 'local' }],
                model: '',
            }),
            setDesktopConfig,
        }
        initConfigFromElectronBridge()

        renderConfigPage('#desktop')

        expect(screen.getAllByText('Built-in')).toHaveLength(2)

        fireEvent.click(screen.getByRole('button', { name: 'Edit local' }))
        fireEvent.change(screen.getByLabelText('Command'), { target: { value: '["edited-agent"]' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(setDesktopConfig).toHaveBeenLastCalledWith(expect.objectContaining({agentProfiles: expect.arrayContaining([expect.objectContaining({ command: ['edited-agent'], name: 'local' })])}))
        await waitFor(() => expect(configService.get('desktop.agentProfiles')).toEqual(expect.arrayContaining([
            expect.objectContaining({ command: ['edited-agent'], name: 'local' }),
        ])))
        renderConfigPage('#desktop')

        fireEvent.click(screen.getByRole('button', { name: 'Remove local' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => {
            const lastCall = setDesktopConfig.mock.calls.at(-1)?.[0]
            expect(lastCall).toBeDefined()
            if (!lastCall) throw new Error('Desktop config was not persisted')
            expect(lastCall.agentProfiles).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'local' })]))
        })

        delete window.md2Config
    })

    it('overrides built-in profile models', () => {
        mockMatchMedia(false)
        const setDesktopConfig = vi.fn(async (values: DesktopConfigValues) => values)
        window.md2Config = {
            getDesktopConfig: () => ({agent: 'codex', agentProfiles: BUILTIN_AGENT_PROFILES, model: ''}),
            setDesktopConfig,
        }
        initConfigFromElectronBridge()
        renderConfigPage('#desktop')

        fireEvent.click(screen.getByRole('button', { name: 'Edit codex' }))
        fireEvent.change(screen.getByLabelText('Models'), { target: { value: 'project-model, project-fast' } })
        fireEvent.change(screen.getByLabelText('Profile default model'), { target: { value: 'project-model' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(setDesktopConfig).toHaveBeenLastCalledWith(expect.objectContaining({agentProfiles: expect.arrayContaining([expect.objectContaining({models: ['project-model', 'project-fast'], name: 'codex'})])}))

        delete window.md2Config
    })

    it('reports agent profile validation errors before page save is enabled', () => {
        mockMatchMedia(false)
        window.md2Config = {
            getDesktopConfig: () => ({
                agent: 'codex',
                agentProfiles: BUILTIN_AGENT_PROFILES,
                model: '',
            }),
            setDesktopConfig: vi.fn(async (values: DesktopConfigValues) => values),
        }
        initConfigFromElectronBridge()

        renderConfigPage('#desktop')
        fireEvent.click(screen.getByRole('button', { name: 'Add profile' }))

        expect(screen.getByText(/Name is required/)).toBeInTheDocument()
        expect(screen.getByText(/Command is required/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'codex' } })
        fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'agent' } })

        expect(screen.getByText(/Duplicate agent profile: codex/u)).toBeInTheDocument()

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'local' } })
        expect(screen.queryByLabelText('Session-id pattern')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled()

        delete window.md2Config
    })

    it('renders desktop config values initialized during bootstrap', () => {
        mockMatchMedia(false)
        window.md2Config = {
            getDesktopConfig: () => ({
                agent: 'claude',
                agentProfiles: BUILTIN_AGENT_PROFILES,
                model: '',
            }),
            setDesktopConfig: vi.fn(async (values: DesktopConfigValues) => values),
        }
        initConfigFromElectronBridge()

        renderConfigPage('#desktop')

        expect(configService.get('desktop.agent')).toBe('claude')
        expect(screen.getByRole('tab', { name: 'Desktop' })).toBeInTheDocument()

        delete window.md2Config
    })

    it('shows disabled desktop config entries in web mode', () => {
        mockMatchMedia(false)
        configService.init()

        renderConfigPage('#desktop')

        expect(screen.getByRole('tab', { name: 'Desktop' })).toBeInTheDocument()
        expect(screen.getByLabelText('Default agent')).toHaveAttribute('aria-disabled', 'true')
        expect(screen.queryByLabelText('Project location')).not.toBeInTheDocument()
    })

    it('never touches the desktop bridge in web mode', () => {
        mockMatchMedia(false)
        configService.init()

        renderConfigPage('')
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(window.md2Config).toBeUndefined()
    })
})
