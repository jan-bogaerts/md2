import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionRunEvent, ActionStartRequest } from '../../../../data/action_run_types'
import { CUSTOM_PROMPT_ACTION_ID, type ActionFile } from '../../../../data/action_types'
import type { AgentConversation, Card, ProjectReference, StateConfig, StorageService, WorktreeRecord } from '../../../../data/data_types'
import type { AgentSelectionState } from '../../../../data/agent_selection'
import { actionService } from '../../../../services/actions/action_service'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { actionRunSettingsService } from '../../../../services/actions/action_run_settings_service'
import { actionPromptDraftService } from '../../../../services/actions/action_prompt_draft_service'
import { agentCapabilitiesService } from '../../../../services/agents/agent_capabilities_service'
import { agentAcknowledgementService } from '../../../../services/agents/agent_acknowledgement_service'
import { dialogService } from '../../../../services/dialog_service'
import { dataService } from '../../../../services/data/data_service'
import { remoteConnectionService } from '../../../../services/data/remote_connection_service'
import { RemoteControlConnectionError, RemoteControlStorageService } from '../../../../services/data/remote_control_storage_service'
import { worktreeService } from '../../../../services/project/worktree_service'
import { projectPersistenceService } from '../../../../services/project/project_persistence_service'
import { openFilesService } from '../../../../services/open_files_service'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import { ActionPopup, CARD_RUN_POPUP_SIZE_STORAGE_KEY, PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY } from './action_popup'
import { useMarkdownTypeaheadStackPosition } from '../../../editor/markdown_typeahead_layer_context'
import { configService } from '../../../../services/config/config_service'
import { BUILTIN_AGENT_PROFILES } from '../../../../data/agent_profiles'

const renderProbes = vi.hoisted(() => ({
    agentPrompt: vi.fn(),
    agentSelectors: vi.fn(),
    chat: vi.fn(),
    conversationPicker: vi.fn(),
    content: vi.fn(),
    logError: vi.fn(),
    phraseButtons: vi.fn(),
    popup: vi.fn(),
    selector: vi.fn(),
}))

function appRegion(element: HTMLElement) {
    return (element.style as unknown as Record<string, string>).WebkitAppRegion
}

vi.mock('../../agent/action_agent_prompt', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../agent/action_agent_prompt')>()

    return {
        ...actual,
        ActionAgentPrompt: function ActionAgentPromptRenderProbe(props: Parameters<typeof actual.ActionAgentPrompt>[0]) {
            renderProbes.agentPrompt(useMarkdownTypeaheadStackPosition())

            return actual.ActionAgentPrompt(props)
        },
    }
})

vi.mock('../../agent/action_agent_selectors', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../agent/action_agent_selectors')>()

    return {
        ...actual,
        ActionAgentSelectors: function ActionAgentSelectorsRenderProbe(props: Parameters<typeof actual.ActionAgentSelectors>[0]) {
            renderProbes.agentSelectors()

            return actual.ActionAgentSelectors(props)
        },
    }
})

vi.mock('../../conversation/action_conversation_picker', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../conversation/action_conversation_picker')>()

    return {
        ...actual,
        ActionConversationPicker: function ActionConversationPickerRenderProbe(
            props: Parameters<typeof actual.ActionConversationPicker>[0],
        ) {
            renderProbes.conversationPicker()

            return actual.ActionConversationPicker(props)
        },
    }
})

vi.mock('../../conversation/action_log_error_display', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../conversation/action_log_error_display')>()

    return {
        ...actual,
        ActionLogErrorDisplay: function ActionLogErrorDisplayRenderProbe(props: Parameters<typeof actual.ActionLogErrorDisplay>[0]) {
            renderProbes.logError()

            return actual.ActionLogErrorDisplay(props)
        },
    }
})

vi.mock('../../editor/action_phrase_buttons', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../editor/action_phrase_buttons')>()

    return {
        ...actual,
        ActionPhraseButtons: function ActionPhraseButtonsRenderProbe(props: Parameters<typeof actual.ActionPhraseButtons>[0]) {
            renderProbes.phraseButtons()

            return actual.ActionPhraseButtons(props)
        },
    }
})

vi.mock('./action_popup_content', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./action_popup_content')>()

    return {
        ...actual,
        ActionPopupContent: function ActionPopupContentRenderProbe(props: Parameters<typeof actual.ActionPopupContent>[0]) {
            renderProbes.content()

            return actual.ActionPopupContent(props)
        },
    }
})

vi.mock('./action_selector', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./action_selector')>()

    return {
        ...actual,
        ActionSelector: function ActionSelectorRenderProbe(props: Parameters<typeof actual.ActionSelector>[0]) {
            renderProbes.selector()

            return actual.ActionSelector(props)
        },
    }
})

vi.mock('../../conversation/action_conversation_chat', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../conversation/action_conversation_chat')>()

    return {
        ...actual,
        ActionConversationChat: function ActionConversationChatRenderProbe(props: Parameters<typeof actual.ActionConversationChat>[0]) {
            renderProbes.chat()

            return actual.ActionConversationChat(props)
        },
    }
})

function file(definition: { id: string }): ActionFile {
    return { content: JSON.stringify(definition), path: `actions/${definition.id}.json` }
}

function commandDefinition(id: string, overrides: Record<string, unknown> = {}) {
    return { command: 'run', description: `${id} description`, id, label: id, type: 'command', ...overrides }
}

function agentDefinition(id: string, overrides: Record<string, unknown> = {}) {
    return { description: `${id} description`, id, label: id, prompt: 'Review project', type: 'agent', ...overrides }
}

const context: ActionContext = { file: 'design/F-010.md', kind: 'card', state: 'design', type: 'feature' }
const project: ProjectReference = { branch: 'main', id: 'project', rootPath: 'C:\\project' }
const originalMatchMedia = window.matchMedia
const validWorktree: WorktreeRecord = {
    branch: 'feature', error: null, parkingBranch: 'md2/parking/feature', path: 'C:\\feature',
    status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false }, valid: true,
}

function agentConversation(overrides: Partial<AgentConversation> = {}): AgentConversation {
    return {
        actionId: 'respond',
        cardInternalId: 'card-1',
        cardPath: 'design/F-010.md',
        completedAt: null,
        entries: [],
        hasExplicitTitle: true,
        id: 'conversation-1',
        path: 'conversation-1.json',
        providerSessions: [],
        startedAt: '2026-08-01T12:00:00.000Z',
        status: 'waitingForInput',
        title: 'Waiting response',
        viewed: true,
        ...overrides,
    }
}

function deferredValue<T>() {
    let resolveValue: (value: T) => void = () => undefined
    const promise = new Promise<T>((resolve) => {
        resolveValue = resolve
    })

    return { promise, resolve: resolveValue }
}

function rejectableDeferred<T>() {
    let rejectValue: (error: unknown) => void = () => undefined
    const promise = new Promise<T>((_resolve, reject) => {
        rejectValue = reject
    })

    return { promise, reject: rejectValue }
}

function mockCodexAvailable() {
    vi.spyOn(agentCapabilitiesService, 'getSnapshot').mockReturnValue({
        availability: { error: null, loading: false, values: { codex: { available: true, error: null } } },
        models: { error: null, loading: false, values: [] },
        thinkingLevels: { error: null, loading: false, values: [] },
    })
}

function setMobileBreakpoint(matches: boolean) {
    window.matchMedia = ((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: matches && query.includes('max-width'),
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
    })) as unknown as typeof window.matchMedia
}

function worktreeStorage(): StorageService {
    return {
        onWorktreesChanged: vi.fn((callback) => {
            callback({ error: null, primaryStatus: null, project, records: [validWorktree] })
            return vi.fn()
        }),
    } as unknown as StorageService
}

function renderPopup(contextOverride: ActionContext = context, onClose = vi.fn(), stackPosition?: number) {
    function ActionPopupRenderProbe() {
        renderProbes.popup()

        return <ActionPopup anchorElement={document.body} context={contextOverride} onClose={onClose} stackPosition={stackPosition} />
    }

    render(
        <AppThemeProvider>
            <ActionPopupRenderProbe />
        </AppThemeProvider>,
    )

    return { onClose }
}

function setProjectStates(states: StateConfig[]) {
    configService.loadProjectConfig({ states })
    vi.spyOn(dataService, 'getConfig').mockImplementation(() => configService.getProjectConfig())
}

function emitActionRunEvent(listener: ((event: ActionRunEvent) => void) | null, event: ActionRunEvent) {
    if (!listener) throw new Error('Action run listener is not registered')

    listener(event)
}

function selectPromptText(textbox: HTMLTextAreaElement, start: number, end: number) {
    textbox.focus()
    textbox.setSelectionRange(start, end)
    fireEvent.select(textbox)
}

describe('ActionPopup', () => {
    beforeEach(async () => {
        projectPersistenceService.init({ actionService, dataService, openFilesService })
        remoteConnectionService.disconnect()
        configService.init({
            desktopConfig: {
                agentProfiles: BUILTIN_AGENT_PROFILES,
                agentSelection: { activeAgent: 'codex', permissionMode: 'ask-for-approval', settingsByAgent: { codex: { model: 'gpt-5.5', thinkingLevel: 'none' } } },
            },
        })
        setMobileBreakpoint(false)
        Object.values(renderProbes).forEach((probe) => probe.mockClear())
        window.md2Actions = {
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        } as unknown as typeof window.md2Actions
        actionService.loadFromFiles([
            file(commandDefinition('first', { label: 'First action' })),
            file(commandDefinition('second', { label: 'Second action' })),
        ])
        const storage = worktreeStorage()
        worktreeService.init({
            assignCardWorktree: vi.fn(),
            cardSeparatorProvider: () => '-',
            clearCardBranch: vi.fn(),
            flushPendingChanges: vi.fn(async () => undefined),
            projectFolderProvider: () => 'design',
            projectProvider: () => project,
            snapshotProvider: () => null,
            storageProvider: () => storage,
            unassignCardWorktree: vi.fn(),
        })
    })

    afterEach(() => {
        remoteConnectionService.disconnect()
        actionRunRegistry.stop()
        actionRunSettingsService.clear()
        delete window.md2Actions
        configService.clear()
        actionService.clear()
        worktreeService.clear()
        window.localStorage.clear()
        window.matchMedia = originalMatchMedia
        cleanup()
        vi.restoreAllMocks()
    })

    it('opens the universal selector popup with the first applicable action selected', () => {
        renderPopup()

        const dialog = within(screen.getByRole('dialog', { name: 'Run actions' }))
        const actionGroup = within(dialog.getByRole('group', { name: 'Actions' }))
        const scrollBody = dialog.getByTestId('action-popup-scroll-body')
        const bottomRow = dialog.getByTestId('action-popup-bottom-row')
        expect(actionGroup.getByRole('button', { name: 'First action' })).toHaveAttribute('aria-pressed', 'true')
        expect(actionGroup.getByRole('button', { name: 'Second action' })).toHaveAttribute('aria-pressed', 'false')
        expect(dialog.getByRole('button', { name: 'Run' })).toBeInTheDocument()
        expect(bottomRow).toHaveAttribute('data-embedded', 'true')
        expect(scrollBody.contains(bottomRow)).toBe(true)
    })

    it('prefills one idle command editor and preserves edited text through reopen', () => {
        const prepareActionPrompt = vi.fn(async () => ({ prompt: 'Agent default' }))
        window.md2Actions = {
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt,
        } as unknown as typeof window.md2Actions
        renderPopup()

        const promptSurface = screen.getByLabelText('Prompt')
        const prompt = within(promptSurface).getByRole('textbox')
        expect(prompt).toHaveValue('run')
        fireEvent.change(prompt, { target: { value: 'edited command' } })

        expect(prompt).toHaveValue('edited command')
        expect(within(promptSurface).getByTestId('action-popup-bottom-row')).toHaveAttribute('data-embedded', 'true')
        expect(screen.getAllByRole('button', { name: 'Run' })).toHaveLength(1)
        expect(screen.getAllByRole('button', { name: 'Schedule' })).toHaveLength(1)
        expect(screen.queryByRole('group', { name: 'Agent settings' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Attach files' })).not.toBeInTheDocument()
        expect(prepareActionPrompt).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'Close' }))
        cleanup()
        renderPopup()

        expect(within(screen.getByLabelText('Prompt')).getByRole('textbox')).toHaveValue('edited command')
        expect(prepareActionPrompt).not.toHaveBeenCalled()
    })

    it('submits the edited command and resets it only after Electron accepts the run', async () => {
        const acceptance = deferredValue<string>()
        const startAction = vi.fn(() => acceptance.promise)
        window.md2Actions = {
            onActionRun: vi.fn(() => vi.fn()),
            startAction,
        } as unknown as typeof window.md2Actions
        renderPopup()
        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')

        fireEvent.change(prompt, { target: { value: 'focus this run' } })
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        await waitFor(() => expect(startAction).toHaveBeenCalledOnce())
        expect(startAction).toHaveBeenCalledWith(expect.objectContaining({
            actionId: 'first',
            runInput: { command: 'focus this run' },
        }))
        expect(prompt).toHaveValue('focus this run')

        acceptance.resolve('run-1')

        await waitFor(() => expect(within(screen.getByLabelText('Prompt')).getByRole('textbox')).toHaveValue('run'))
        expect(startAction).toHaveBeenCalledOnce()
    })

    it('submits command input once through Ctrl+Enter', async () => {
        const startAction = vi.fn(async () => 'run-1')
        window.md2Actions = {
            onActionRun: vi.fn(() => vi.fn()),
            startAction,
        } as unknown as typeof window.md2Actions
        renderPopup()
        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')

        fireEvent.change(prompt, { target: { value: 'keyboard input' } })
        fireEvent.keyDown(prompt, { ctrlKey: true, key: 'Enter' })

        await waitFor(() => expect(startAction).toHaveBeenCalledWith(expect.objectContaining({
            actionId: 'first',
            runInput: { command: 'keyboard input' },
        })))
        expect(startAction).toHaveBeenCalledOnce()
    })

    it('retains command input and reports a start failure before Electron acceptance', async () => {
        const failure = new Error('Start rejected')
        const reportError = vi.spyOn(dialogService, 'error')
        const startAction = vi.fn(async () => {
            throw failure
        })
        window.md2Actions = {
            onActionRun: vi.fn(() => vi.fn()),
            startAction,
        } as unknown as typeof window.md2Actions
        renderPopup()
        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')

        fireEvent.change(prompt, { target: { value: 'retry input' } })
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        await waitFor(() => expect(reportError).toHaveBeenCalledWith(failure, { fallbackMessage: 'Action run failed' }))
        expect(prompt).toHaveValue('retry input')
        expect(startAction).toHaveBeenCalledOnce()
    })

    it('opens card popup on matching column default action', () => {
        setProjectStates([{ alwaysVisible: true, defaultActionId: 'second', state: 'design' }])

        renderPopup()

        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))
        expect(actionGroup.getByRole('button', { name: 'First action' })).toHaveAttribute('aria-pressed', 'false')
        expect(actionGroup.getByRole('button', { name: 'Second action' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('falls back to first applicable action when column default is context-inapplicable', () => {
        setProjectStates([{ alwaysVisible: true, defaultActionId: 'second', state: 'design' }])
        actionService.loadFromFiles([
            file(commandDefinition('first', { label: 'First action' })),
            file(commandDefinition('second', { appliesTo: { kind: 'project' }, label: 'Second action' })),
        ])

        renderPopup()

        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))
        expect(actionGroup.getByRole('button', { name: 'First action' })).toHaveAttribute('aria-pressed', 'true')
        expect(actionGroup.queryByRole('button', { name: 'Second action' })).not.toBeInTheDocument()
    })

    it.each([
        { file: 'README.md', kind: 'file', state: 'design' },
        { folder: 'design', kind: 'folder' },
        { kind: 'merge-conflict' },
        { kind: 'project' },
    ] as ActionContext[])('ignores column default for $kind popup', (popupContext) => {
        setProjectStates([{ alwaysVisible: true, defaultActionId: 'second', state: 'design' }])

        renderPopup(popupContext)

        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))
        expect(actionGroup.getByRole('button', { name: 'First action' })).toHaveAttribute('aria-pressed', 'true')
        expect(actionGroup.getByRole('button', { name: 'Second action' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('keeps column-default selection when card state and config change after open', () => {
        setProjectStates([
            { alwaysVisible: true, defaultActionId: 'second', state: 'design' },
            { alwaysVisible: true, defaultActionId: 'first', state: 'ready' },
        ])
        const { rerender } = render(
            <AppThemeProvider>
                <ActionPopup anchorElement={document.body} context={context} onClose={vi.fn()} />
            </AppThemeProvider>,
        )

        configService.loadProjectConfig({ states: [{ alwaysVisible: true, defaultActionId: 'first', state: 'ready' }] })
        rerender(
            <AppThemeProvider>
                <ActionPopup anchorElement={document.body} context={{ ...context, state: 'ready' }} onClose={vi.fn()} />
            </AppThemeProvider>,
        )

        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))
        expect(actionGroup.getByRole('button', { name: 'First action' })).toHaveAttribute('aria-pressed', 'false')
        expect(actionGroup.getByRole('button', { name: 'Second action' })).toHaveAttribute('aria-pressed', 'true')
    })

    it.each(['queued', 'running'] as const)('opens on first %s action in selector order', (status) => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            onActionRun: vi.fn((listener) => {
                runListener = listener

                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        emitActionRunEvent(runListener, {actionId: 'second', context, phase: 'main', rootActionId: 'second', runId: 'run-2', status, type: 'run'})

        renderPopup()

        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))
        expect(actionGroup.getByRole('button', { name: status === 'queued' ? /Second action.*queued/u : /Second action.*running/u }))
            .toHaveAttribute('aria-pressed', 'true')
    })

    it('opens on persisted running action without matching live run', () => {
        const cardContext = { ...context, cardInternalId: 'card-1' }
        const runningConversation = agentConversation({ actionId: 'second', status: 'running' })
        vi.spyOn(dataService.agents, 'getAgentConversations').mockReturnValue([runningConversation])

        renderPopup(cardContext)

        expect(screen.getByRole('button', { name: /Second action.*Agent is running/u })).toHaveAttribute('aria-pressed', 'true')
    })

    it('honors explicit action choice over running action', () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            onActionRun: vi.fn((listener) => {
                runListener = listener

                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        emitActionRunEvent(runListener, {actionId: 'second', context, phase: 'main', rootActionId: 'second', runId: 'run-2', status: 'running', type: 'run'})

        render(
            <AppThemeProvider>
                <ActionPopup anchorElement={document.body} context={context} initialActionId="first" onClose={vi.fn()} />
            </AppThemeProvider>,
        )

        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))
        expect(actionGroup.getByRole('button', { name: 'First action' })).toHaveAttribute('aria-pressed', 'true')
        expect(actionGroup.getByRole('button', { name: /Second action.*Agent is running/u })).toHaveAttribute('aria-pressed', 'false')
    })

    it('keeps released-card conversation history available without run controls', () => {
        actionService.loadFromFiles([file(agentDefinition('review', { label: 'Review' }))])
        vi.spyOn(dataService, 'getConfig').mockReturnValue({ releasesFolder: 'design/releases' } as never)

        renderPopup({ cardInternalId: 'card-10', file: 'design/releases/v1/F-010.md', kind: 'card' })

        const dialog = within(screen.getByRole('dialog', { name: 'Run actions' }))
        expect(dialog.getByRole('combobox', { name: 'Conversation history' })).toBeInTheDocument()
        expect(dialog.getByRole('note')).toHaveTextContent('Released cards are read-only. Create a new card for more work.')
        expect(dialog.queryByRole('textbox', { name: 'Prompt' })).not.toBeInTheDocument()
        expect(dialog.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
        expect(dialog.queryByRole('button', { name: 'Schedule' })).not.toBeInTheDocument()
        expect(dialog.queryByRole('button', { name: 'Add action' })).not.toBeInTheDocument()
        expect(dialog.queryByRole('button', { name: /^Tokens,/u })).not.toBeInTheDocument()
    })

    it('provides its stack position to Markdown typeahead menus', () => {
        const stackPosition = 4
        actionService.loadFromFiles([file(agentDefinition('review', { label: 'Review' }))])

        renderPopup(context, vi.fn(), stackPosition)

        expect(renderProbes.agentPrompt).toHaveBeenCalledWith(stackPosition)
    })

    it('renders the agent bottom row inside the prompt surface below the scrolling editor', () => {
        actionService.loadFromFiles([file(agentDefinition('review', { label: 'Review' }))])

        renderPopup()

        const scrollBody = screen.getByTestId('action-popup-scroll-body')
        const promptSurface = within(scrollBody).getByLabelText('Prompt')
        const editorRegion = within(promptSurface).getByTestId('action-prompt-editor-region')
        const bottomRow = within(promptSurface).getByTestId('action-popup-bottom-row')

        expect(bottomRow).toHaveAttribute('data-embedded', 'true')
        expect(within(bottomRow).getByRole('group', { name: 'Agent settings' })).toBeInTheDocument()
        expect(editorRegion).toHaveStyle({ overflowY: 'auto' })
        expect(within(promptSurface).getByRole('button', { name: 'Attach files' })).toBeInTheDocument()
        expect(editorRegion.contains(bottomRow)).toBe(false)
        expect(screen.getAllByTestId('action-popup-bottom-row')).toHaveLength(1)
    })

    it('renders card-agent usage in chat metadata before a conversation is selected', async () => {
        window.md2Actions = {
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        } as unknown as typeof window.md2Actions
        actionService.loadFromFiles([file(agentDefinition('review', { label: 'Review' }))])

        renderPopup({ ...context, cardInternalId: 'card-1' })

        const metadata = screen.getByLabelText('Conversation metadata')
        const bottomRow = screen.getByTestId('action-popup-bottom-row')
        const tokens = within(metadata).getByRole('button', { name: 'Tokens, Action/card scope' })
        expect(metadata).toHaveStyle({ containerType: 'inline-size' })
        expect(tokens).toHaveTextContent('tokens: 0')
        expect(within(metadata).queryByLabelText('Elapsed time')).not.toBeInTheDocument()
        expect(within(metadata).queryByRole('progressbar', { name: 'Context usage' })).not.toBeInTheDocument()
        expect(within(bottomRow).queryByRole('button', { name: /^Tokens,/u })).not.toBeInTheDocument()
        expect(within(bottomRow).queryByRole('button', { name: /^Changes,/u })).not.toBeInTheDocument()
        tokens.focus()
        expect(tokens).toHaveFocus()
        fireEvent.mouseOver(tokens)
        expect(await screen.findByText('Tokens are cumulative provider token usage.', { selector: '.MuiTooltip-tooltip *' }))
            .toBeInTheDocument()
    })

    it('keeps usage absent from project-scoped agent popups', () => {
        actionService.loadFromFiles([file(agentDefinition('review', {
            appliesTo: { kind: 'project' },
            label: 'Review project',
        }))])

        renderPopup({ kind: 'project' })

        expect(screen.queryByRole('button', { name: /^Tokens,/u })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^Changes,/u })).not.toBeInTheDocument()
    })

    it('shows Project in the project popup header and accessible title', () => {
        renderPopup({ kind: 'project' })

        const dialog = within(screen.getByRole('dialog', { name: 'Run actions for Project' }))
        expect(within(dialog.getByTestId('action-popup-toolbar')).getByText('Project')).toBeInTheDocument()
    })

    it('does not render popup content while typing or flushing a prompt', async () => {
        window.md2Actions = {
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt: vi.fn(async () => ({ prompt: 'Plan' })),
        } as unknown as typeof window.md2Actions
        actionService.loadFromFiles([file(agentDefinition('review', { label: 'Review' }))])
        renderPopup()
        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')
        await waitFor(() => expect(prompt).toHaveValue('Plan'))
        Object.values(renderProbes).forEach((probe) => probe.mockClear())

        fireEvent.change(prompt, { target: { value: 'Draft' } })
        expect(renderProbes.content).not.toHaveBeenCalled()
        expect(renderProbes.popup).not.toHaveBeenCalled()
        expect(renderProbes.selector).not.toHaveBeenCalled()
        expect(renderProbes.chat).not.toHaveBeenCalled()

        fireEvent.blur(prompt)
        await act(async () => undefined)
        expect(renderProbes.content).not.toHaveBeenCalled()
        expect(renderProbes.popup).not.toHaveBeenCalled()
        expect(renderProbes.selector).not.toHaveBeenCalled()
        expect(renderProbes.chat).not.toHaveBeenCalled()
    })

    it('does not render popup roots or leaves for another context run', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        renderPopup()
        await waitFor(() => expect(runListener).not.toBeNull())
        Object.values(renderProbes).forEach((probe) => probe.mockClear())

        act(() => runListener?.({
            actionId: 'first',
            context: { file: 'design/F-099.md', kind: 'card', state: 'design', type: 'feature' },
            phase: 'main',
            rootActionId: 'first',
            runId: 'other-run',
            status: 'running',
            type: 'run',
        }))

        Object.values(renderProbes).forEach((probe) => expect(probe).not.toHaveBeenCalled())
    })

    it('keeps selection and renders only selector boundary when another action status changes', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        renderPopup()
        await waitFor(() => expect(runListener).not.toBeNull())
        Object.values(renderProbes).forEach((probe) => probe.mockClear())

        act(() => runListener?.({actionId: 'second', context, phase: 'main', rootActionId: 'second', runId: 'run-2', status: 'running', type: 'run'}))

        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))
        expect(actionGroup.getByRole('button', { name: 'First action' })).toHaveAttribute('aria-pressed', 'true')
        expect(actionGroup.getByRole('button', { name: /Second action.*Agent is running/u })).toHaveAttribute('aria-pressed', 'false')
        expect(renderProbes.selector).toHaveBeenCalled()
        expect(renderProbes.popup).not.toHaveBeenCalled()
        expect(renderProbes.content).not.toHaveBeenCalled()
        expect(renderProbes.chat).not.toHaveBeenCalled()
    })

    it('keeps selection when acknowledgement state changes after open', () => {
        const cardContext = { ...context, cardInternalId: 'card-1' }
        const unseenConversation = agentConversation({
            actionId: 'second',
            completedAt: '2026-08-01T12:01:00.000Z',
            status: 'completed',
            viewed: false,
        })
        let conversations = [] as AgentConversation[]
        vi.spyOn(dataService.agents, 'getAgentConversations').mockImplementation(() => conversations)

        renderPopup(cardContext)
        conversations = [unseenConversation]
        act(() => agentAcknowledgementService.announceConversationsChanged('card-1', ['second']))

        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))
        expect(actionGroup.getByRole('button', { name: 'First action' })).toHaveAttribute('aria-pressed', 'true')
        expect(actionGroup.getByRole('button', { name: /Second action.*New agent result available/u }))
            .toHaveAttribute('aria-pressed', 'false')
    })

    it('does not rerender unrelated popup controls while conversation streams', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        } as unknown as typeof window.md2Actions
        actionService.loadFromFiles([file(agentDefinition('review', {label: 'Review', phrases: [{ text: 'Continue', title: '' }], streaming: true}))])
        actionRunRegistry.start()
        renderPopup()
        await waitFor(() => expect(runListener).not.toBeNull())
        const event = {actionId: 'review', context, phase: 'main' as const, rootActionId: 'review', runId: 'run-1', status: 'running' as const}
        act(() => {
            runListener?.({ ...event, type: 'run' })
            runListener?.({
                ...event,
                actionType: 'agent',
                autoFinish: null,
                interactionReady: true,
                streaming: true,
                type: 'agentState',
            })
            runListener?.({
                ...event,
                type: 'update',
                update: {
                    conversation: {
                        actionId: 'review',
                        cardInternalId: null,
                        cardPath: context.file ?? null,
                        completedAt: null,
                        entries: [],
                        hasExplicitTitle: false,
                        id: 'conversation-1',
                        path: 'conversation.json',
                        providerSessions: [],
                        startedAt: '2026-08-01T12:00:00.000Z',
                        status: 'running',
                        title: 'Review',
                        viewed: true,
                    },
                    kind: 'agentStarted',
                },
            })
        })
        await waitFor(() => expect(renderProbes.agentPrompt).toHaveBeenCalled())
        expect(renderProbes.agentPrompt).toHaveBeenCalled()
        expect(renderProbes.agentSelectors).toHaveBeenCalled()
        expect(renderProbes.conversationPicker).toHaveBeenCalled()
        expect(renderProbes.logError).toHaveBeenCalled()
        expect(renderProbes.phraseButtons).not.toHaveBeenCalled()
        Object.values(renderProbes).forEach((probe) => probe.mockClear())

        act(() => runListener?.({
            ...event,
            type: 'update',
            update: { content: 'streamed', entryIndex: 0, kind: 'agentOutput', messageId: 'assistant-1', sequence: 1 },
        }))

        expect(renderProbes.popup).not.toHaveBeenCalled()
        expect(renderProbes.content).not.toHaveBeenCalled()
        expect(renderProbes.selector).not.toHaveBeenCalled()
        expect(renderProbes.agentPrompt).not.toHaveBeenCalled()
        expect(renderProbes.agentSelectors).not.toHaveBeenCalled()
        expect(renderProbes.conversationPicker).not.toHaveBeenCalled()
        expect(renderProbes.logError).not.toHaveBeenCalled()
        expect(renderProbes.phraseButtons).not.toHaveBeenCalled()
    })

    it('owns action selection internally', () => {
        renderPopup()
        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))

        fireEvent.click(actionGroup.getByRole('button', { name: 'Second action' }))

        expect(actionGroup.getByRole('button', { name: 'First action' })).toHaveAttribute('aria-pressed', 'false')
        expect(actionGroup.getByRole('button', { name: 'Second action' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('prefills every new agent draft while switching actions', async () => {
        window.md2Actions = {
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt: vi.fn(async ({ actionId }: { actionId: string }) => ({ prompt: `${actionId} prompt` })),
        } as unknown as typeof window.md2Actions
        mockCodexAvailable()
        actionService.loadFromFiles([
            file(agentDefinition('prefill-first', { label: 'First agent' })),
            file(agentDefinition('prefill-second', { label: 'Second agent' })),
            file(agentDefinition('prefill-third', { label: 'Third agent' })),
        ])
        renderPopup()
        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))
        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')

        await waitFor(() => expect(prompt).toHaveValue('prefill-first prompt'))
        fireEvent.click(actionGroup.getByRole('button', { name: 'Second agent' }))
        await waitFor(() => expect(prompt).toHaveValue('prefill-second prompt'))
        fireEvent.click(actionGroup.getByRole('button', { name: 'Third agent' }))
        await waitFor(() => expect(prompt).toHaveValue('prefill-third prompt'))
    })

    it('selects one custom-prompt plus without conversion controls', async () => {
        renderPopup()
        const dialog = within(screen.getByRole('dialog', { name: 'Run actions' }))
        const actionGroup = within(dialog.getByRole('group', { name: 'Actions' }))
        const customPrompt = actionGroup.getByRole('button', { name: 'Custom prompt' })

        expect(customPrompt).toHaveTextContent('+')
        expect(actionGroup.getAllByText('+')).toHaveLength(1)
        expect(dialog.queryByRole('button', { name: 'Add action' })).not.toBeInTheDocument()
        fireEvent.click(customPrompt)

        expect(customPrompt).toHaveAttribute('aria-pressed', 'true')
        expect(dialog.queryByLabelText('Preset name')).not.toBeInTheDocument()
        expect(dialog.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    })

    it('uses host defaults and custom profiles in action selectors', async () => {
        configService.replaceDesktopConfig({
            agentSelection: { activeAgent: 'custom', permissionMode: 'full-access', settingsByAgent: { custom: { model: 'host-model', thinkingLevel: 'high' } } },
            agentProfiles: [{ command: ['custom'], defaultThinkingLevel: 'none', models: ['host-model'], name: 'custom' }],
            codexSearchEnabled: true,
            editorCommand: 'code "{{file}}"',
            mergeConflictResolverCommand: '',
        })
        vi.spyOn(agentCapabilitiesService, 'getSnapshot').mockReturnValue({
            availability: { error: null, loading: false, values: { custom: { available: true, error: null } } },
            models: { error: null, loading: false, values: [] },
            thinkingLevels: { error: null, loading: false, values: [] },
        })
        renderPopup()
        const dialog = within(screen.getByRole('dialog', { name: 'Run actions' }))

        fireEvent.click(dialog.getByRole('button', { name: 'Custom prompt' }))
        const model = await dialog.findByRole('button', { name: 'Model' })
        expect(model.querySelector('[data-model-label]')).toHaveTextContent('host-model')
        expect(model.querySelector('[data-full-thinking-level]')).toHaveTextContent('high')
        fireEvent.click(model)
        fireEvent.click(screen.getByRole('menuitem', { name: 'Agent' }))

        expect(screen.getByRole('menuitem', { name: 'custom' })).toHaveClass('Mui-selected')
    })

    it.each(['Send button', 'Ctrl+Enter'])('runs custom prompt directly through %s', async (submission) => {
        const startAction = vi.fn(async () => 'custom-run')
        const saveProjectFile = vi.spyOn(dataService.cards, 'saveProjectFile')
        vi.spyOn(agentCapabilitiesService, 'getSnapshot').mockReturnValue({
            availability: { error: null, loading: false, values: { codex: { available: true, error: null } } },
            models: { error: null, loading: false, values: [] },
            thinkingLevels: { error: null, loading: false, values: [] },
        })
        window.md2Actions = {
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
            startAction,
        } as unknown as typeof window.md2Actions
        renderPopup()
        const dialog = within(screen.getByRole('dialog', { name: 'Run actions' }))

        fireEvent.click(dialog.getByRole('button', { name: 'Custom prompt' }))
        const prompt = within(await dialog.findByLabelText('Prompt')).getByRole('textbox')
        fireEvent.change(prompt, { target: { value: 'Explain this change' } })
        await waitFor(() => expect(dialog.getByRole('button', { name: 'Send' })).toBeEnabled())
        if (submission === 'Send button') fireEvent.click(dialog.getByRole('button', { name: 'Send' }))
        else fireEvent.keyDown(prompt, { ctrlKey: true, key: 'Enter' })

        await waitFor(() => expect(startAction).toHaveBeenCalledWith(expect.objectContaining({
            actionId: CUSTOM_PROMPT_ACTION_ID,
            runInput: expect.objectContaining({
                agent: 'codex',
                model: 'gpt-5.5',
                permissionMode: 'ask-for-approval',
                prompt: 'Explain this change',
                thinkingLevel: 'none',
            }),
        })))
        expect(saveProjectFile).not.toHaveBeenCalled()
    })

    it('starts a prepared diagram prompt with its generated repository-relative path', async () => {
        const startAction = vi.fn(async () => 'diagram-run')
        const diagramPath = 'design/diagrams/Overview-20260831T142530123Z.json'
        mockCodexAvailable()
        window.md2Actions = {
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt: vi.fn(async () => ({ diagramPath, prompt: 'Prepared diagram prompt' })),
            startAction,
        } as unknown as typeof window.md2Actions
        actionService.loadFromFiles([file(agentDefinition('overview', {
            appliesTo: { kind: 'diagram', type: 'root' },
            label: 'Overview',
        }))])

        renderPopup({ kind: 'diagram', type: 'root' })
        const dialog = within(screen.getByRole('dialog', { name: 'Run actions' }))
        fireEvent.click(dialog.getByRole('button', { name: 'Overview' }))
        const prompt = within(await dialog.findByLabelText('Prompt')).getByRole('textbox')
        await waitFor(() => expect(prompt).toHaveValue('Prepared diagram prompt'))
        fireEvent.click(dialog.getByRole('button', { name: 'Send' }))

        await waitFor(() => expect(startAction).toHaveBeenCalledWith(expect.objectContaining({
            actionId: 'overview',
            context: { kind: 'diagram', type: 'root' },
            runInput: expect.objectContaining({ diagramPath, prompt: 'Prepared diagram prompt' }),
        })))
    })

    it('omits retained shared permission mode when custom agent runs', async () => {
        const startAction = vi.fn(async (request: ActionStartRequest) => {
            void request

            return 'custom-run'
        })
        configService.replaceDesktopConfig({
            agentSelection: {
                activeAgent: 'custom',
                permissionMode: 'full-access',
                settingsByAgent: { custom: { model: 'host-model', thinkingLevel: 'none' } },
            },
            agentProfiles: [{ command: ['custom'], defaultThinkingLevel: 'none', models: ['host-model'], name: 'custom' }],
        })
        vi.spyOn(agentCapabilitiesService, 'getSnapshot').mockReturnValue({
            availability: { error: null, loading: false, values: { custom: { available: true, error: null } } },
            models: { error: null, loading: false, values: [] },
            thinkingLevels: { error: null, loading: false, values: [] },
        })
        window.md2Actions = {
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
            startAction,
        } as unknown as typeof window.md2Actions
        renderPopup()
        const dialog = within(screen.getByRole('dialog', { name: 'Run actions' }))

        fireEvent.click(dialog.getByRole('button', { name: 'Custom prompt' }))
        const prompt = within(await dialog.findByLabelText('Prompt')).getByRole('textbox')
        fireEvent.change(prompt, { target: { value: 'Run custom agent' } })
        await waitFor(() => expect(dialog.getByRole('button', { name: 'Send' })).toBeEnabled())
        fireEvent.click(dialog.getByRole('button', { name: 'Send' }))

        await waitFor(() => expect(startAction).toHaveBeenCalledOnce())
        const request = startAction.mock.calls[0][0]
        expect(request.runInput).toMatchObject({ agent: 'custom', model: 'host-model', thinkingLevel: 'none' })
        expect(request.runInput).not.toHaveProperty('permissionMode')
        expect(configService.get('desktop.agentSelection').permissionMode).toBe('full-access')
    })

    it('filters the internal action list by context', () => {
        actionService.loadFromFiles([
            file(commandDefinition('card', { appliesTo: { kind: 'card' }, label: 'Card action' })),
            file(commandDefinition('project', { appliesTo: { kind: 'project' }, label: 'Project action' })),
        ])

        renderPopup()

        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))
        expect(actionGroup.getByRole('button', { name: 'Card action' })).toBeInTheDocument()
        expect(actionGroup.queryByRole('button', { name: 'Project action' })).not.toBeInTheDocument()
    })

    it('keeps the selected running action when its run changes the card context', () => {
        actionService.loadFromFiles([
            file(commandDefinition('design', { appliesTo: { state: 'design' }, label: 'Design action' })),
        ])
        const running: ActionContext = { ...context, state: 'design' }
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            onActionRun: vi.fn((listener) => {
                runListener = listener

                return vi.fn()
            }),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        emitActionRunEvent(runListener, {actionId: 'design', context: running, phase: 'main', rootActionId: 'design', runId: 'run-1', status: 'running', type: 'run'})
        const { rerender } = render(
            <AppThemeProvider>
                <ActionPopup anchorElement={document.body} context={running} onClose={vi.fn()} />
            </AppThemeProvider>,
        )
        expect(within(screen.getByRole('group', { name: 'Actions' })).getByRole('button', { name: /Design action/u }))
            .toHaveAttribute('aria-pressed', 'true')

        rerender(
            <AppThemeProvider>
                <ActionPopup anchorElement={document.body} context={{ ...running, state: 'ready' }} onClose={vi.fn()} />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('dialog', { name: 'Run actions' })).toBeInTheDocument()
        expect(within(screen.getByRole('group', { name: 'Actions' })).getByRole('button', { name: /Design action/u }))
            .toHaveAttribute('aria-pressed', 'true')
    })

    it('does not render legacy related-action sections', () => {
        actionService.loadFromFiles([
            file(commandDefinition('before', { label: 'Before action' })),
            file(commandDefinition('main', { label: 'Main action', onBefore: ['before'] })),
        ])

        renderPopup()

        expect(screen.queryByText('Before')).not.toBeInTheDocument()
        expect(screen.queryByText('After')).not.toBeInTheDocument()
    })

    it('shows waiting action state through popup reopen, resume, and completion', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: 'Plan' })),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        actionService.loadFromFiles([file(agentDefinition('stream', { label: 'Stream', streaming: true }))])
        renderPopup()
        await waitFor(() => expect(runListener).not.toBeNull())
        const eventBase = {
            actionId: 'stream',
            actionType: 'agent' as const,
            autoFinish: null,
            context,
            runId: 'run-1',
            interactionReady: true,
            phase: 'main' as const,
            rootActionId: 'stream',
            streaming: true,
        }

        act(() => {
            runListener?.({ ...eventBase, status: 'running', type: 'run' })
            runListener?.({ ...eventBase, status: 'waitingForInput', type: 'agentState' })
            runListener?.({
                ...eventBase,
                status: 'running',
                type: 'update',
                update: {
                    entry: { content: 'Accepted queue entry', dispatchState: 'queued', id: 'prompt-1', revision: 0 },
                    kind: 'agentPromptQueued',
                },
            })
        })
        const waitingButton = screen.getByRole('button', { name: /Stream.*Agent is waiting for input/u })
        expect(waitingButton).toBeInTheDocument()
        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')
        fireEvent.change(prompt, { target: { value: 'Editable draft' } })
        expect(screen.getByText('Accepted queue entry')).toBeInTheDocument()
        fireEvent.mouseOver(waitingButton)
        expect(await screen.findByRole('tooltip', { name: 'Agent is waiting for input' })).toBeInTheDocument()

        cleanup()
        renderPopup()
        expect(screen.getByRole('button', { name: /Stream.*Agent is waiting for input/u })).toBeInTheDocument()
        expect(within(screen.getByLabelText('Prompt')).getByRole('textbox')).toHaveValue('Editable draft')
        expect(screen.getByText('Accepted queue entry')).toBeInTheDocument()

        act(() => runListener?.({ ...eventBase, status: 'running', type: 'agentState' }))
        expect(screen.getByRole('button', { name: /Stream.*Agent is running/u })).toBeInTheDocument()

        act(() => runListener?.({ ...eventBase, status: 'completed', type: 'run' }))
        expect(screen.getByRole('button', { name: 'Stream' })).toBeInTheDocument()
    })

    it('starts a second run from New conversation instead of queueing into the live run', async () => {
        actionRunRegistry.stop()
        const projectContext: ActionContext = { kind: 'project' }
        let runListener: ((event: ActionRunEvent) => void) | null = null
        const enqueueActionPrompt = vi.fn()
        const startAction = vi.fn(async (request: ActionStartRequest) => {
            void request

            return 'run-2'
        })
        window.md2Actions = {
            enqueueActionPrompt,
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener

                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
            startAction,
        } as unknown as typeof window.md2Actions
        mockCodexAvailable()
        actionRunRegistry.start()
        actionService.loadFromFiles([file(agentDefinition('stream', { label: 'Stream', streaming: true }))])
        if (!runListener) throw new Error('Missing action run listener')
        const firstConversation = agentConversation({ actionId: 'stream', cardInternalId: null, cardPath: null, path: 'first.json' })
        const firstRun = {
            actionId: 'stream', actionType: 'agent' as const, autoFinish: null, context: projectContext,
            interactionReady: true, phase: 'main' as const, rootActionId: 'stream', runId: 'run-1', streaming: true,
        }
        act(() => {
            runListener?.({ ...firstRun, status: 'running', type: 'run' })
            runListener?.({
                ...firstRun,
                status: 'running',
                type: 'update',
                update: { continued: false, conversation: firstConversation, kind: 'agentStarted' },
            })
            runListener?.({ ...firstRun, status: 'running', type: 'agentState' })
        })
        renderPopup(projectContext)

        const conversationPicker = await screen.findByRole('combobox', { name: 'Conversation history' })
        fireEvent.mouseDown(conversationPicker)
        fireEvent.click(await screen.findByRole('option', { name: 'New conversation' }))
        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')
        await waitFor(() => expect(prompt).not.toHaveAttribute('readonly'))
        fireEvent.change(prompt, { target: { value: 'Independent request' } })
        fireEvent.click(screen.getByRole('button', { name: 'Send' }))

        await waitFor(() => expect(startAction).toHaveBeenCalledWith(expect.objectContaining({
            actionId: 'stream',
            runInput: expect.objectContaining({ prompt: 'Independent request' }),
        })))
        const startRequest = startAction.mock.calls[0]?.[0]
        if (!startRequest) throw new Error('Missing second action start request')
        expect(startRequest.runInput).not.toHaveProperty('continueFrom')
        expect(enqueueActionPrompt).not.toHaveBeenCalled()

        act(() => runListener?.({ ...firstRun, runId: 'run-2', status: 'running', type: 'run' }))
        expect(actionRunRegistry.getActionRunStores('stream', projectContext)).toHaveLength(2)
    })

    it('keeps a post-start streaming draft editable when the bottom row reacquires it first', async () => {
        actionRunRegistry.stop()
        const streamingContext: ActionContext = { kind: 'project' }
        let runListener: ((event: ActionRunEvent) => void) | null = null
        const firstStart = deferredValue<string>()
        const secondStart = deferredValue<string>()
        const startAction = vi.fn()
            .mockImplementationOnce(() => firstStart.promise)
            .mockImplementationOnce(() => secondStart.promise)
        const cancelActionRun = vi.fn(async () => undefined)
        window.md2Actions = {
            cancelActionRun,
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener

                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
            startAction,
        } as unknown as typeof window.md2Actions
        mockCodexAvailable()
        actionRunRegistry.start()
        actionService.loadFromFiles([file(agentDefinition('stream', { label: 'Stream', streaming: true }))])
        renderPopup(streamingContext)
        await waitFor(() => expect(runListener).not.toBeNull())
        const firstRun = {
            actionId: 'stream', actionType: 'agent' as const, autoFinish: null, context: streamingContext,
            interactionReady: true, phase: 'main' as const, rootActionId: 'stream', runId: 'run-1', streaming: true,
        }
        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')

        fireEvent.change(prompt, { target: { value: 'Start first run' } })
        fireEvent.click(screen.getByRole('button', { name: 'Send' }))
        await waitFor(() => expect(startAction).toHaveBeenCalledTimes(1))
        act(() => {
            runListener?.({ ...firstRun, status: 'running', type: 'run' })
            runListener?.({ ...firstRun, status: 'running', type: 'agentState' })
        })
        await act(async () => firstStart.resolve('run-1'))

        fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
        await waitFor(() => expect(cancelActionRun).toHaveBeenCalledWith('run-1'))
        act(() => runListener?.({ ...firstRun, status: 'cancelled', type: 'run' }))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument())

        fireEvent.change(prompt, { target: { value: 'Start second run' } })
        fireEvent.click(screen.getByRole('button', { name: 'Send' }))
        await waitFor(() => expect(startAction).toHaveBeenCalledTimes(2))
        const secondRun = { ...firstRun, runId: 'run-2' }
        act(() => {
            runListener?.({ ...secondRun, status: 'running', type: 'run' })
            runListener?.({ ...secondRun, status: 'running', type: 'agentState' })
        })
        await act(async () => secondStart.resolve('run-2'))

        await waitFor(() => expect(prompt).not.toHaveAttribute('readonly'))
        fireEvent.change(prompt, { target: { value: 'Type while running' } })
        expect(prompt).toHaveValue('Type while running')

        act(() => runListener?.({ ...secondRun, status: 'waitingForInput', type: 'agentState' }))
        fireEvent.change(prompt, { target: { value: 'Type while waiting' } })
        expect(prompt).not.toHaveAttribute('readonly')
        expect(prompt).toHaveValue('Type while waiting')
    })

    it('keeps the prompt empty after completion without preparing another stored prompt', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        const prepareActionPrompt = vi.fn(async () => ({ prompt: 'Stored prompt' }))
        window.md2Actions = {
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener

                return vi.fn()
            }),
            prepareActionPrompt,
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        actionService.loadFromFiles([file(agentDefinition('stream', { label: 'Stream', streaming: true }))])
        renderPopup()
        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')
        await waitFor(() => expect(prompt).toHaveValue('Stored prompt'))
        expect(prepareActionPrompt).toHaveBeenCalledOnce()
        await waitFor(() => expect(runListener).not.toBeNull())

        act(() => actionPromptDraftService.clearDraft('stream', context, null))
        act(() => {
            runListener?.({
                actionId: 'stream', context, runId: 'run-1', phase: 'main', rootActionId: 'stream',
                status: 'running', type: 'run',
            })
        })
        expect(prompt).toHaveValue('')

        act(() => {
            runListener?.({
                actionId: 'stream', context, runId: 'run-1', phase: 'main', rootActionId: 'stream',
                status: 'completed', type: 'run',
            })
        })

        await waitFor(() => expect(prompt).toHaveValue(''))
        expect(prepareActionPrompt).toHaveBeenCalledOnce()
    })

    it('prefills the stored prompt for a new empty conversation', async () => {
        const prepareActionPrompt = vi.fn(async () => ({ prompt: 'Stored prompt' }))
        window.md2Actions = {
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt,
        } as unknown as typeof window.md2Actions
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([])
        actionService.loadFromFiles([file(agentDefinition('review', { label: 'Review' }))])

        renderPopup({ ...context, cardInternalId: 'card-1' })

        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')
        await waitFor(() => expect(prompt).toHaveValue('Stored prompt'))
        expect(prepareActionPrompt).toHaveBeenCalledOnce()
    })

    it('keeps prompt preparation loading until remote backend becomes ready', async () => {
        const connectionReady = deferredValue<void>()
        const storage = new RemoteControlStorageService()
        storage.init({ endpoint: 'ws://desktop:1234' })
        vi.spyOn(storage, 'connect').mockReturnValue(connectionReady.promise)
        vi.spyOn(storage, 'loadDesktopConfig').mockResolvedValue(configService.getDesktopValues())
        vi.spyOn(storage, 'loadAgentAvailability').mockResolvedValue({})
        vi.spyOn(storage, 'getCodexRateLimits').mockResolvedValue(null)
        vi.spyOn(storage, 'loadActionRunRecoverySnapshot')
            .mockResolvedValue({ activeRunEvents: [], terminalResults: [] })
        vi.spyOn(storage, 'onActionRun').mockReturnValue(() => undefined)
        vi.spyOn(storage, 'onCodexRateLimits').mockReturnValue(() => undefined)
        const prepareActionPrompt = vi.spyOn(storage, 'prepareActionPrompt').mockResolvedValue({ prompt: 'Remote prompt' })
        delete window.md2Actions
        const connection = remoteConnectionService.connectExisting(storage)
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([])
        actionService.loadFromFiles([file(agentDefinition('review', { label: 'Review' }))])

        renderPopup({ ...context, cardInternalId: 'card-1' })

        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')
        const promptDraft = actionPromptDraftService.getDraft(
            'review',
            { ...context, cardInternalId: 'card-1' },
            null,
            { prepare: true },
        )
        expect(promptDraft.getEditorSnapshot().preparationStatus).toBe('loading')
        expect(prepareActionPrompt).not.toHaveBeenCalled()
        connectionReady.resolve(undefined)
        await connection

        await waitFor(() => expect(prompt).toHaveValue('Remote prompt'))
        expect(prepareActionPrompt).toHaveBeenCalledOnce()
    })

    it('retries prompt preparation through replacement bridge after remote close', async () => {
        const firstPreparation = rejectableDeferred<never>()
        const connectionListeners: Array<(connected: boolean) => void> = []
        vi.spyOn(RemoteControlStorageService.prototype, 'connect').mockResolvedValue()
        vi.spyOn(RemoteControlStorageService.prototype, 'loadDesktopConfig').mockResolvedValue(configService.getDesktopValues())
        vi.spyOn(RemoteControlStorageService.prototype, 'loadAgentAvailability').mockResolvedValue({})
        vi.spyOn(RemoteControlStorageService.prototype, 'getCodexRateLimits').mockResolvedValue(null)
        vi.spyOn(RemoteControlStorageService.prototype, 'loadActionRunRecoverySnapshot')
            .mockResolvedValue({ activeRunEvents: [], terminalResults: [] })
        vi.spyOn(RemoteControlStorageService.prototype, 'onActionRun').mockReturnValue(() => undefined)
        vi.spyOn(RemoteControlStorageService.prototype, 'onCodexRateLimits').mockReturnValue(() => undefined)
        const prepareActionPrompt = vi.spyOn(RemoteControlStorageService.prototype, 'prepareActionPrompt')
            .mockReturnValueOnce(firstPreparation.promise)
            .mockResolvedValueOnce({ prompt: 'Reconnected prompt' })
        const firstStorage = new RemoteControlStorageService()
        firstStorage.init({ endpoint: 'ws://desktop:1234' })
        vi.spyOn(firstStorage, 'onConnectionChanged').mockImplementation((listener) => {
            connectionListeners.push(listener)

            return () => true
        })
        delete window.md2Actions
        await remoteConnectionService.connectExisting(firstStorage)
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([])
        actionService.loadFromFiles([file(agentDefinition('review', { label: 'Review' }))])
        renderPopup({ ...context, cardInternalId: 'card-1' })
        await waitFor(() => expect(prepareActionPrompt).toHaveBeenCalledOnce())

        connectionListeners.forEach((listener) => listener(false))
        firstPreparation.reject(new RemoteControlConnectionError('Remote-control connection closed'))

        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')
        await waitFor(() => expect(prompt).toHaveValue('Reconnected prompt'))
        expect(prepareActionPrompt).toHaveBeenCalledTimes(2)
    })

    it('keeps the prompt empty after automatically selecting the newest unseen conversation', async () => {
        const historicalContext = { ...context, cardInternalId: 'card-1' }
        const olderUnseenConversation = agentConversation({
            actionId: 'review',
            completedAt: '2026-08-01T12:01:00.000Z',
            id: 'conversation-older',
            path: 'conversation-older.json',
            startedAt: '2026-08-01T12:00:00.000Z',
            status: 'completed',
            title: 'Older unseen review',
            viewed: false,
        })
        const newestUnseenConversation = agentConversation({
            actionId: 'review',
            completedAt: '2026-08-02T12:01:00.000Z',
            id: 'conversation-newest',
            path: 'conversation-newest.json',
            startedAt: '2026-08-02T12:00:00.000Z',
            status: 'completed',
            title: 'Newest unseen review',
            viewed: false,
        })
        const preparedPrompt = deferredValue<{ prompt: string }>()
        const prepareActionPrompt = vi.fn(() => preparedPrompt.promise)
        window.md2Actions = {
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt,
        } as unknown as typeof window.md2Actions
        vi.spyOn(dataService.agents, 'getAgentConversations').mockReturnValue([
            olderUnseenConversation,
            newestUnseenConversation,
        ])
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([
            olderUnseenConversation,
            newestUnseenConversation,
        ])
        const loadConversation = vi.spyOn(dataService, 'loadAgentConversation').mockResolvedValue(newestUnseenConversation)
        actionService.loadFromFiles([file(agentDefinition('review', { label: 'Review' }))])

        renderPopup(historicalContext)

        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')
        await waitFor(() => expect(loadConversation).toHaveBeenCalledWith(newestUnseenConversation.path))
        await act(async () => {
            preparedPrompt.resolve({ prompt: 'Stored prompt' })
            await preparedPrompt.promise
        })

        expect(prompt).toHaveValue('')
        expect(prepareActionPrompt).toHaveBeenCalledOnce()
    })

    it('clears the prompt for history and restores the stored prompt for New conversation', async () => {
        const historicalContext = { ...context, cardInternalId: 'card-1' }
        const historicalConversation: AgentConversation = {
            actionId: 'review',
            cardInternalId: 'card-1',
            cardPath: context.file ?? null,
            completedAt: '2026-08-01T12:01:00.000Z',
            entries: [],
            hasExplicitTitle: true,
            id: 'conversation-1',
            path: 'conversation-1.json',
            providerSessions: [],
            startedAt: '2026-08-01T12:00:00.000Z',
            status: 'completed',
            title: 'Historical review',
            viewed: true,
        }
        const prepareActionPrompt = vi.fn(async () => ({ prompt: 'Stored prompt' }))
        window.md2Actions = {
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt,
        } as unknown as typeof window.md2Actions
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([historicalConversation])
        vi.spyOn(dataService, 'loadAgentConversation').mockResolvedValue(historicalConversation)
        actionService.loadFromFiles([file(agentDefinition('review', { label: 'Review' }))])
        renderPopup(historicalContext)
        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')
        await waitFor(() => expect(prompt).toHaveValue('Stored prompt'))

        const conversationPicker = await screen.findByRole('combobox', { name: 'Conversation history' })
        await waitFor(() => expect(conversationPicker).toBeEnabled())
        fireEvent.mouseDown(conversationPicker)
        fireEvent.click(screen.getByRole('option', { name: /Historical review/u }))

        await waitFor(() => expect(prompt).toHaveValue(''))
        fireEvent.mouseDown(conversationPicker)
        fireEvent.click(await screen.findByRole('option', { name: 'New conversation' }))

        await waitFor(() => expect(prompt).toHaveValue('Stored prompt'))
        expect(prepareActionPrompt).toHaveBeenCalledTimes(2)
    })

    it('clears stored prefill when switching to an active action and restores its draft after reopen', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener

                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async ({ actionId }: { actionId: string }) => ({ prompt: `${actionId} stored prompt` })),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        actionService.loadFromFiles([
            file(agentDefinition('idle', { label: 'Idle action' })),
            file(agentDefinition('active', { label: 'Active action' })),
        ])
        renderPopup()
        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))
        await waitFor(() => expect(within(screen.getByLabelText('Prompt')).getByRole('textbox')).toHaveValue('idle stored prompt'))
        await waitFor(() => expect(runListener).not.toBeNull())

        act(() => {
            runListener?.({
                actionId: 'active', context, runId: 'run-1', phase: 'main',
                rootActionId: 'active', status: 'running', type: 'run',
            })
            runListener?.({
                actionId: 'active',
                actionType: 'agent',
                autoFinish: null,
                context,
                runId: 'run-1',
                interactionReady: false,
                phase: 'main',
                rootActionId: 'active',
                status: 'waitingForInput',
                streaming: true,
                type: 'agentState',
            })
        })
        fireEvent.click(actionGroup.getByRole('button', { name: /Active action/u }))

        await waitFor(() => expect(within(screen.getByLabelText('Prompt')).getByRole('textbox')).toHaveValue(''))
        const activeRun = actionRunRegistry.getActionRunStore('active', context)?.getSnapshot()
        if (!activeRun) throw new Error('Missing active run')
        act(() => actionPromptDraftService.getDraft('active', context, activeRun.runId, { prepare: false }).edit('Keep active draft'))
        cleanup()
        renderPopup()
        fireEvent.click(within(screen.getByRole('group', { name: 'Actions' })).getByRole('button', { name: /Active action/u }))

        await waitFor(() => expect(within(screen.getByLabelText('Prompt')).getByRole('textbox')).toHaveValue('Keep active draft'))
    })

    it('closes from the popup header and deletes only empty prompt drafts', () => {
        const emptyDraft = actionPromptDraftService.getDraft('empty', context, null, { prepare: false })
        const preservedDraft = actionPromptDraftService.getDraft('preserved', context, null, { prepare: false })
        preservedDraft.edit('Keep')
        const { onClose } = renderPopup()

        fireEvent.click(screen.getByRole('button', { name: 'Close' }))

        expect(onClose).toHaveBeenCalledOnce()
        expect(actionPromptDraftService.getDraft('empty', context, null, { prepare: false })).not.toBe(emptyDraft)
        expect(actionPromptDraftService.getDraft('preserved', context, null, { prepare: false })).toBe(preservedDraft)
    })

    it('places accessible worktree and window controls above the action selector', () => {
        renderPopup({ ...context, cardInternalId: 'card-1' })

        const toolbar = screen.getByTestId('action-popup-toolbar')
        expect(within(toolbar).getByRole('button', { name: 'Primary worktree' })).toBeInTheDocument()
        expect(within(toolbar).getByRole('button', { name: 'Expand upward' })).toBeInTheDocument()
        expect(within(toolbar).getByRole('button', { name: 'Close' })).toBeInTheDocument()
        expect(within(toolbar).queryByRole('group', { name: 'Actions' })).not.toBeInTheDocument()
        expect(screen.getByRole('group', { name: 'Actions' })).toBeInTheDocument()
    })

    it('delegates card assignment to the worktree preparation workflow', async () => {
        const setCardWorktree = vi.spyOn(worktreeService, 'setCardWorktree').mockResolvedValue(undefined)
        renderPopup({ ...context, cardInternalId: 'card-1' })

        fireEvent.click(screen.getByRole('button', { name: 'Primary worktree' }))
        fireEvent.click(screen.getByRole('menuitem', { name: /1 — C:\\feature/u }))

        await waitFor(() => expect(setCardWorktree).toHaveBeenCalledWith('design/F-010.md', 1))
    })

    it('keeps card selection and reports the error when worktree preparation fails', async () => {
        vi.spyOn(worktreeService, 'setCardWorktree').mockRejectedValue(new Error('preparation failed'))
        const reportError = vi.spyOn(dialogService, 'error')
        renderPopup({ ...context, cardInternalId: 'card-1' })

        fireEvent.click(screen.getByRole('button', { name: 'Primary worktree' }))
        fireEvent.click(screen.getByRole('menuitem', { name: /1 — C:\\feature/u }))

        expect(screen.getByRole('button', { name: 'Primary worktree' })).toBeInTheDocument()
        await waitFor(() => expect(reportError).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'preparation failed' }),
            { fallbackMessage: 'Could not update worktree assignment' },
        ))
    })

    it('uses project session assignment for action filtering and resets it on project load', async () => {
        actionService.loadFromFiles([
            file(commandDefinition('assigned', { appliesTo: { kind: 'project', worktree: '1' }, label: 'Assigned action' })),
        ])
        renderPopup({ kind: 'project' })

        expect(screen.queryByRole('button', { name: 'Assigned action' })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Primary worktree' }))
        fireEvent.click(screen.getByRole('menuitem', { name: /1 — C:\\feature/u }))
        expect(screen.getByRole('button', { name: 'Assigned action' })).toBeInTheDocument()

        worktreeService.clear()
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Assigned action' })).not.toBeInTheDocument())
    })

    it('prepares project action prompts with the session assignment', async () => {
        actionService.loadFromFiles([file(agentDefinition('review', { appliesTo: { kind: 'project' }, label: 'Review project' }))])
        worktreeService.setProjectActionWorktree(1)

        renderPopup({ kind: 'project' })

        await waitFor(() => expect(window.md2Actions?.prepareActionPrompt).toHaveBeenCalledWith({
            actionId: 'review',
            context: { kind: 'project', worktree: '1' },
        }))
    })

    it('shows Finish, Schedule, and Send while waiting with input, and normal Finish completes conversation', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        const finishActionRun = vi.fn(async () => undefined)
        window.md2Actions = {
            finishActionRun,
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: 'Plan' })),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        actionService.loadFromFiles([file(agentDefinition('stream', { label: 'Stream', streaming: true }))])
        renderPopup()
        await waitFor(() => expect(runListener).not.toBeNull())
        const eventBase = {
            actionId: 'stream',
            actionType: 'agent' as const,
            autoFinish: null,
            context,
            runId: 'run-1',
            interactionReady: true,
            phase: 'main' as const,
            rootActionId: 'stream',
            streaming: true,
        }

        act(() => {
            runListener?.({ ...eventBase, status: 'running', type: 'run' })
            runListener?.({ ...eventBase, status: 'waitingForInput', type: 'agentState' })
        })

        expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Schedule' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()

        const activeRun = actionRunRegistry.getActionRunStore('stream', context)?.getSnapshot()
        if (!activeRun) throw new Error('Expected active stream run')
        act(() => actionPromptDraftService.getDraft('stream', context, activeRun.runId, { prepare: false }).edit('Continue'))
        expect(screen.getByRole('button', { name: 'Schedule' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
        await waitFor(() => expect(finishActionRun).toHaveBeenCalledWith('run-1'))
    })

    it('keeps typed prompt text through every status the finishing agent passes', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener

                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: 'Prepared default' })),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        actionService.loadFromFiles([file(agentDefinition('stream', { label: 'Stream', streaming: true }))])
        renderPopup()
        await waitFor(() => expect(runListener).not.toBeNull())
        const eventBase = {
            actionId: 'stream',
            actionType: 'agent' as const,
            autoFinish: null,
            context,
            interactionReady: true,
            phase: 'main' as const,
            rootActionId: 'stream',
            runId: 'run-1',
            streaming: true,
        }
        act(() => {
            runListener?.({ ...eventBase, status: 'running', type: 'run' })
            runListener?.({ ...eventBase, status: 'running', type: 'action' })
        })
        const typedPrompt = 'Typed while the agent was finishing'
        const promptBox = within(screen.getByLabelText('Prompt')).getByRole('textbox')
        fireEvent.change(promptBox, { target: { value: typedPrompt } })
        const draft = actionPromptDraftService.getDraft('stream', context, 'run-1', { prepare: false })
        expect(draft.getSnapshot()).toBe(typedPrompt)

        act(() => runListener?.({ ...eventBase, interactionReady: false, status: 'waitingForInput', type: 'action' }))
        expect(draft.getSnapshot()).toBe(typedPrompt)
        expect(within(screen.getByLabelText('Prompt')).getByRole('textbox')).toHaveValue(typedPrompt)

        act(() => runListener?.({ ...eventBase, status: 'completed', type: 'run' }))

        expect(within(screen.getByLabelText('Prompt')).getByRole('textbox')).toHaveValue(typedPrompt)
        expect(actionPromptDraftService.getDraft('stream', context, 'run-1', { prepare: false })).toBe(draft)
    })

    it('accepts Send while running and Ctrl+Enter while waiting through the same live run', async () => {
        actionRunRegistry.stop()
        const waitingContext: ActionContext = { kind: 'project' }
        let runListener: ((event: ActionRunEvent) => void) | null = null
        const enqueueActionPrompt = vi.fn(async (_runId, content) => ({content, dispatchState: 'queued' as const, id: 'prompt-1', revision: 0}))
        window.md2Actions = {
            enqueueActionPrompt,
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        } as unknown as typeof window.md2Actions
        mockCodexAvailable()
        actionRunRegistry.start()
        actionService.loadFromFiles([file(agentDefinition('stream', { label: 'Stream', streaming: true }))])
        renderPopup(waitingContext)
        await waitFor(() => expect(runListener).not.toBeNull())
        const eventBase = {
            actionId: 'stream', actionType: 'agent' as const, autoFinish: null, context: waitingContext, interactionReady: true,
            phase: 'main' as const, rootActionId: 'stream', runId: 'run-1', streaming: true,
        }

        act(() => {
            runListener?.({ ...eventBase, status: 'running', type: 'run' })
            runListener?.({ ...eventBase, status: 'running', type: 'agentState' })
        })
        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')
        expect(prompt).not.toHaveAttribute('readonly')
        expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()

        fireEvent.change(prompt, { target: { value: 'Steer while running' } })
        const sendButton = screen.getByRole('button', { name: 'Send' })
        expect(sendButton).toBeEnabled()
        fireEvent.click(sendButton)
        await waitFor(() => expect(enqueueActionPrompt).toHaveBeenCalledWith('run-1', 'Steer while running'))
        await waitFor(() => expect(prompt).toHaveValue(''))

        act(() => runListener?.({ ...eventBase, status: 'waitingForInput', type: 'agentState' }))
        fireEvent.change(prompt, { target: { value: 'Continue manually' } })
        fireEvent.keyDown(prompt, { ctrlKey: true, key: 'Enter' })

        await waitFor(() => expect(enqueueActionPrompt).toHaveBeenCalledWith('run-1', 'Continue manually'))
        await waitFor(() => expect(prompt).toHaveValue(''))
    })

    it('retains manually typed waiting input and reports a failed live send', async () => {
        actionRunRegistry.stop()
        const waitingContext: ActionContext = { kind: 'project' }
        let runListener: ((event: ActionRunEvent) => void) | null = null
        const sendError = new Error('live send failed')
        window.md2Actions = {
            enqueueActionPrompt: vi.fn(async () => {
                throw sendError
            }),
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        } as unknown as typeof window.md2Actions
        const reportError = vi.spyOn(dialogService, 'error')
        mockCodexAvailable()
        actionRunRegistry.start()
        actionService.loadFromFiles([file(agentDefinition('stream', { label: 'Stream', streaming: true }))])
        renderPopup(waitingContext)
        await waitFor(() => expect(runListener).not.toBeNull())
        const eventBase = {
            actionId: 'stream', actionType: 'agent' as const, autoFinish: null, context: waitingContext, interactionReady: true,
            phase: 'main' as const, rootActionId: 'stream', runId: 'run-1', streaming: true,
        }
        act(() => {
            runListener?.({ ...eventBase, status: 'running', type: 'run' })
            runListener?.({ ...eventBase, status: 'waitingForInput', type: 'agentState' })
        })
        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')

        fireEvent.change(prompt, { target: { value: 'Keep this draft' } })
        fireEvent.click(screen.getByRole('button', { name: 'Send' }))

        await waitFor(() => expect(reportError).toHaveBeenCalledWith(sendError, { fallbackMessage: 'Could not send agent message' }))
        expect(prompt).toHaveValue('Keep this draft')
        expect(prompt).not.toHaveAttribute('readonly')
    })

    it('keeps prepared waiting input editable while backend or interaction channel blocks Send', async () => {
        actionRunRegistry.stop()
        const waitingContext: ActionContext = { kind: 'project' }
        let runListener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        } as unknown as typeof window.md2Actions
        mockCodexAvailable()
        actionRunRegistry.start()
        actionService.loadFromFiles([file(agentDefinition('stream', { label: 'Stream', streaming: true }))])
        renderPopup(waitingContext)
        await waitFor(() => expect(runListener).not.toBeNull())
        const eventBase = {
            actionId: 'stream', actionType: 'agent' as const, autoFinish: null, context: waitingContext,
            phase: 'main' as const, rootActionId: 'stream', runId: 'run-1', streaming: true,
        }
        act(() => {
            runListener?.({ ...eventBase, status: 'running', type: 'run' })
            runListener?.({ ...eventBase, interactionReady: false, status: 'waitingForInput', type: 'agentState' })
        })
        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')

        fireEvent.change(prompt, { target: { value: 'Draft while blocked' } })
        expect(prompt).not.toHaveAttribute('readonly')
        expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()

        act(() => runListener?.({ ...eventBase, interactionReady: true, status: 'waitingForInput', type: 'agentState' }))
        expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()

        delete window.md2Actions
        fireEvent.change(prompt, { target: { value: 'Draft without backend' } })
        expect(prompt).not.toHaveAttribute('readonly')
        expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    })

    it('allows queue submission while question and approval remain pending', async () => {
        actionRunRegistry.stop()
        const waitingContext: ActionContext = { kind: 'project' }
        let runListener: ((event: ActionRunEvent) => void) | null = null
        const enqueueActionPrompt = vi.fn(async (_runId, content) => ({content, dispatchState: 'queued' as const, id: 'prompt-1', revision: 0}))
        window.md2Actions = {
            enqueueActionPrompt,
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        } as unknown as typeof window.md2Actions
        mockCodexAvailable()
        actionRunRegistry.start()
        actionService.loadFromFiles([file(agentDefinition('stream', { label: 'Stream', streaming: true }))])
        renderPopup(waitingContext)
        await waitFor(() => expect(runListener).not.toBeNull())
        const eventBase = {
            actionId: 'stream', actionType: 'agent' as const, autoFinish: null, context: waitingContext, interactionReady: true,
            phase: 'main' as const, rootActionId: 'stream', runId: 'run-1', streaming: true,
        }
        const conversation = agentConversation({
            actionId: 'stream', cardInternalId: null, cardPath: null,
            id: 'stream-conversation', path: 'stream.json',
        })
        const approval = {
            command: 'npm test', filePaths: [], itemId: 'command-1', kind: 'commandExecution' as const,
            reason: 'Run related test', requestId: 41, startedAtMs: 1, threadId: 'thread-1', turnId: 'turn-1',
        }
        act(() => {
            runListener?.({ ...eventBase, status: 'running', type: 'run' })
            runListener?.({
                ...eventBase, status: 'running', type: 'update',
                update: { continued: false, conversation, kind: 'agentStarted' },
            })
            runListener?.({ ...eventBase, status: 'waitingForInput', type: 'agentState' })
        })
        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')
        fireEvent.change(prompt, { target: { value: 'Draft before decisions' } })

        act(() => {
            runListener?.({
                ...eventBase, status: 'waitingForInput', type: 'update',
                update: { kind: 'agentQuestion', questions: [{ header: 'Confirm', id: 'confirm', question: 'Proceed?' }], requestId: 7 },
            })
            runListener?.({
                ...eventBase, status: 'waitingForInput', type: 'update',
                update: { approval, kind: 'agentApproval' },
            })
        })
        expect(prompt).not.toHaveAttribute('readonly')
        expect(prompt).toHaveValue('Draft before decisions')
        expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
        fireEvent.click(screen.getByRole('button', { name: 'Send' }))
        await waitFor(() => expect(enqueueActionPrompt).toHaveBeenCalledWith('run-1', 'Draft before decisions'))
        await waitFor(() => expect(prompt).toHaveValue(''))

        act(() => runListener?.({
            ...eventBase, status: 'waitingForInput', type: 'update',
            update: {
                kind: 'agentQuestionAnswer',
                requestId: 7,
                userMessage: { content: 'Yes', id: 'answer-1', kind: 'message', role: 'user', timestamp: 'now' },
            },
        }))
        expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()

        act(() => runListener?.({
            ...eventBase, status: 'waitingForInput', type: 'update',
            update: { kind: 'agentApprovalResolved', requestId: 41 },
        }))
        expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
    })

    it('shows response prompts only while scoped run waits and keeps them inside prompt surface', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        const enqueueActionPrompt = vi.fn(async (_runId, content) => ({content, dispatchState: 'queued' as const, id: 'prompt-1', revision: 0}))
        window.md2Actions = {
            enqueueActionPrompt,
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        actionService.loadFromFiles([
            file(agentDefinition('respond', {
                label: 'Respond',
                phrases: [{ text: 'Continue with tests', title: 'Continue' }],
                streaming: true,
            })),
        ])
        renderPopup()
        await waitFor(() => expect(runListener).not.toBeNull())
        const eventBase = {
            actionId: 'respond', actionType: 'agent' as const, autoFinish: null, context, interactionReady: true,
            phase: 'main' as const, rootActionId: 'respond', runId: 'run-1', streaming: true,
        }

        expect(screen.queryByRole('group', { name: 'Predefined phrases' })).not.toBeInTheDocument()
        act(() => runListener?.({ ...eventBase, status: 'queued', type: 'action' }))
        expect(screen.queryByRole('group', { name: 'Predefined phrases' })).not.toBeInTheDocument()
        act(() => runListener?.({ ...eventBase, status: 'running', type: 'agentState' }))
        expect(screen.queryByRole('group', { name: 'Predefined phrases' })).not.toBeInTheDocument()

        act(() => runListener?.({ ...eventBase, status: 'waitingForInput', type: 'agentState' }))
        const promptSurface = screen.getByLabelText('Prompt')
        const phraseGroup = await within(promptSurface).findByRole('group', { name: 'Predefined phrases' })
        const bottomRow = within(promptSurface).getByTestId('action-popup-bottom-row')
        const phraseButton = within(phraseGroup).getByRole('button', { name: 'Continue' })
        const user = userEvent.setup()
        expect(promptSurface.lastElementChild).toBe(bottomRow)

        await user.dblClick(phraseButton)
        await waitFor(() => expect(enqueueActionPrompt).toHaveBeenCalledWith('run-1', 'Continue with tests'))
        expect(enqueueActionPrompt).toHaveBeenCalledTimes(1)

        act(() => runListener?.({ ...eventBase, status: 'completed', type: 'run' }))
        expect(screen.getByRole('group', { name: 'Predefined phrases' })).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByRole('group', { name: 'Predefined phrases' })).not.toBeInTheDocument())
    })

    it('inserts response phrases verbatim at editor selection or document end', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        actionService.loadFromFiles([
            file(agentDefinition('respond', {
                label: 'Respond',
                phrases: [{ text: 'Continue with tests', title: 'Continue' }],
                streaming: true,
            })),
        ])
        renderPopup()
        await waitFor(() => expect(runListener).not.toBeNull())
        const eventBase = {
            actionId: 'respond', actionType: 'agent' as const, autoFinish: null, context, interactionReady: true,
            phase: 'main' as const, rootActionId: 'respond', runId: 'run-1', streaming: true,
        }
        act(() => runListener?.({ ...eventBase, status: 'waitingForInput', type: 'agentState' }))
        const promptSurface = screen.getByLabelText('Prompt')
        const textbox = within(promptSurface).getByRole('textbox') as HTMLTextAreaElement
        const phraseButton = await within(promptSurface).findByRole('button', { name: 'Continue' })
        const promptDraft = actionPromptDraftService.getDraft('respond', context, 'run-1', { prepare: false })

        act(() => promptDraft.replace('Existing prompt'))
        fireEvent.click(phraseButton)
        await waitFor(() => expect(textbox).toHaveValue('Existing promptContinue with tests'))

        act(() => promptDraft.replace(''))
        fireEvent.click(phraseButton)
        await waitFor(() => expect(textbox).toHaveValue('Continue with tests'))

        act(() => promptDraft.replace('AlphaOmega'))
        selectPromptText(textbox, 5, 5)
        fireEvent.click(phraseButton)
        await waitFor(() => expect(textbox).toHaveValue('AlphaContinue with testsOmega'))

        act(() => promptDraft.replace('AlphaREMOVEOmega'))
        selectPromptText(textbox, 5, 11)
        fireEvent.click(phraseButton)
        await waitFor(() => expect(textbox).toHaveValue('AlphaContinue with testsOmega'))
    })

    it('reports phrase insertion failure without discarding typed prompt', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        actionService.loadFromFiles([
            file(agentDefinition('respond', {
                label: 'Respond',
                phrases: [{ text: 'Continue with tests', title: 'Continue' }],
                streaming: true,
            })),
        ])
        renderPopup()
        await waitFor(() => expect(runListener).not.toBeNull())
        const eventBase = {
            actionId: 'respond', actionType: 'agent' as const, autoFinish: null, context, interactionReady: true,
            phase: 'main' as const, rootActionId: 'respond', runId: 'run-1', streaming: true,
        }
        act(() => runListener?.({ ...eventBase, status: 'waitingForInput', type: 'agentState' }))
        const promptSurface = screen.getByLabelText('Prompt')
        const textbox = within(promptSurface).getByRole('textbox') as HTMLTextAreaElement
        const phraseButton = await within(promptSurface).findByRole('button', { name: 'Continue' })
        const promptDraft = actionPromptDraftService.getDraft('respond', context, 'run-1', { prepare: false })
        const insertionError = new Error('Insertion failed')
        const reportError = vi.spyOn(dialogService, 'error')
        act(() => promptDraft.replace('Keep typed prompt'))
        vi.spyOn(promptDraft, 'requestInsertion').mockRejectedValue(insertionError)

        fireEvent.click(phraseButton)

        await waitFor(() => expect(reportError).toHaveBeenCalledWith(
            insertionError,
            { fallbackMessage: 'Predefined phrase could not be selected' },
        ))
        expect(textbox).toHaveValue('Keep typed prompt')
        expect(promptDraft.getSnapshot()).toBe('Keep typed prompt')
    })

    it('hides response prompts until all scoped approvals resolve', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        const answerActionApproval = vi.fn(async () => undefined)
        window.md2Actions = {
            answerActionApproval,
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        actionService.loadFromFiles([file(agentDefinition('respond', {
            label: 'Respond',
            phrases: [{ text: 'Continue with tests', title: 'Continue' }],
            streaming: true,
        }))])
        renderPopup()
        await waitFor(() => expect(runListener).not.toBeNull())
        const eventBase = {
            actionId: 'respond', actionType: 'agent' as const, autoFinish: null, context, interactionReady: true,
            phase: 'main' as const, rootActionId: 'respond', runId: 'run-1', streaming: true,
        }
        const firstApproval = {
            command: 'npm test', filePaths: [], itemId: 'command-1', kind: 'commandExecution' as const,
            reason: 'Run related tests', requestId: 41, startedAtMs: 1, threadId: 'thread-1', turnId: 'turn-1',
        }
        const secondApproval = {
            command: 'npm run lint', filePaths: [], itemId: 'command-2', kind: 'commandExecution' as const,
            reason: 'Lint changed files', requestId: 42, startedAtMs: 2, threadId: 'thread-1', turnId: 'turn-1',
        }

        act(() => runListener?.({ ...eventBase, status: 'waitingForInput', type: 'agentState' }))
        expect(await screen.findByRole('group', { name: 'Predefined phrases' })).toBeInTheDocument()

        act(() => runListener?.({
            ...eventBase,
            status: 'waitingForInput',
            type: 'update',
            update: { approval: firstApproval, kind: 'agentApproval' },
        }))
        await waitFor(() => expect(screen.queryByRole('group', { name: 'Predefined phrases' })).not.toBeInTheDocument())
        const firstApprovalControls = screen.getByLabelText('Agent approval')
        expect(firstApprovalControls).toHaveTextContent('Run related tests')
        fireEvent.click(within(firstApprovalControls).getByRole('button', { name: 'Allow once' }))
        await waitFor(() => expect(answerActionApproval).toHaveBeenCalledWith('run-1', 41, 'accept'))

        act(() => {
            runListener?.({
                ...eventBase,
                status: 'waitingForInput',
                type: 'update',
                update: { kind: 'agentApprovalSubmitted', requestId: 41 },
            })
            runListener?.({
                ...eventBase,
                status: 'waitingForInput',
                type: 'update',
                update: { approval: secondApproval, kind: 'agentApproval' },
            })
        })
        expect(screen.queryByRole('group', { name: 'Predefined phrases' })).not.toBeInTheDocument()
        expect(screen.getAllByLabelText('Agent approval')).toHaveLength(2)

        act(() => runListener?.({
            ...eventBase,
            status: 'waitingForInput',
            type: 'update',
            update: { kind: 'agentApprovalResolved', requestId: 41 },
        }))
        expect(screen.queryByRole('group', { name: 'Predefined phrases' })).not.toBeInTheDocument()
        expect(screen.getAllByLabelText('Agent approval')).toHaveLength(1)
        expect(screen.getByLabelText('Agent approval')).toHaveTextContent('Lint changed files')

        act(() => runListener?.({
            ...eventBase,
            status: 'waitingForInput',
            type: 'update',
            update: { kind: 'agentApprovalResolved', requestId: 42 },
        }))
        expect(await screen.findByRole('group', { name: 'Predefined phrases' })).toBeInTheDocument()
    })

    it('restores response prompts from a scoped persisted waiting conversation after restart', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        const conversations = deferredValue<AgentConversation[]>()
        const startAction = vi.fn(async () => 'continued-run')
        window.md2Actions = {
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
            startAction,
        } as unknown as typeof window.md2Actions
        vi.spyOn(dataService, 'listAgentConversations').mockReturnValue(conversations.promise)
        actionRunRegistry.start()
        actionService.loadFromFiles([file(agentDefinition('respond', {
            label: 'Respond',
            phrases: [{ text: 'Continue with tests', title: 'Continue' }],
            streaming: true,
        }))])
        const persistedContext = { ...context, cardInternalId: 'card-1' }
        renderPopup(persistedContext)
        await waitFor(() => expect(runListener).not.toBeNull())

        expect(screen.queryByRole('group', { name: 'Predefined phrases' })).not.toBeInTheDocument()
        conversations.resolve([
            agentConversation({ actionId: 'other-action', id: 'other-action', path: 'other-action.json' }),
            agentConversation({ cardInternalId: 'card-2', id: 'other-context', path: 'other-context.json' }),
            agentConversation({ id: 'completed', path: 'completed.json', status: 'completed' }),
            agentConversation(),
        ])

        const promptSurface = screen.getByLabelText('Prompt')
        const phraseGroup = await within(promptSurface).findByRole('group', { name: 'Predefined phrases' })
        const phraseButton = within(phraseGroup).getByRole('button', { name: 'Continue' })
        fireEvent.click(phraseButton)
        await waitFor(() => expect(within(promptSurface).getByRole('textbox')).toHaveValue('Continue with tests'))

        fireEvent.doubleClick(phraseButton)
        await waitFor(() => expect(startAction).toHaveBeenCalledWith({
            actionId: 'respond',
            context: persistedContext,
            runInput: expect.objectContaining({ continueFrom: 'conversation-1.json', prompt: 'Continue with tests' }),
        }))

        const eventBase = {
            actionId: 'respond', context: persistedContext, phase: 'main' as const,
            rootActionId: 'respond', runId: 'continued-run',
        }
        act(() => runListener?.({ ...eventBase, status: 'queued', type: 'run' }))
        await waitFor(() => expect(screen.queryByRole('group', { name: 'Predefined phrases' })).not.toBeInTheDocument())
        act(() => runListener?.({ ...eventBase, status: 'running', type: 'run' }))
        expect(screen.queryByRole('group', { name: 'Predefined phrases' })).not.toBeInTheDocument()
        act(() => runListener?.({ ...eventBase, status: 'waitingForInput', type: 'run' }))
        expect(await screen.findByRole('group', { name: 'Predefined phrases' })).toBeInTheDocument()
    })

    it('allows manual input for a persisted waiting conversation and starts its continuation', async () => {
        const persistedContext: ActionContext = { kind: 'project' }
        const waitingConversation = agentConversation({actionId: 'respond', cardInternalId: null, cardPath: null, path: 'persisted-waiting.json'})
        const startAction = vi.fn(async () => 'continued-run')
        window.md2Actions = {
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
            startAction,
        } as unknown as typeof window.md2Actions
        mockCodexAvailable()
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([waitingConversation])
        vi.spyOn(dataService, 'loadAgentConversation').mockResolvedValue(waitingConversation)
        actionService.loadFromFiles([file(agentDefinition('respond', { label: 'Respond', streaming: true }))])

        renderPopup(persistedContext)
        const conversationPicker = await screen.findByRole('combobox', { name: 'Conversation history' })
        await waitFor(() => expect(conversationPicker).toBeEnabled())
        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')
        expect(prompt).not.toHaveAttribute('readonly')

        fireEvent.change(prompt, { target: { value: 'Continue persisted work' } })
        const sendButton = screen.getByRole('button', { name: 'Send' })
        expect(sendButton).toBeEnabled()
        fireEvent.click(sendButton)

        await waitFor(() => expect(startAction).toHaveBeenCalledWith({
            actionId: 'respond',
            context: persistedContext,
            runInput: expect.objectContaining({ continueFrom: 'persisted-waiting.json', prompt: 'Continue persisted work' }),
        }))
    })

    it('does not restore response prompts from mismatched or non-waiting persisted conversations', async () => {
        const persistedContext = { ...context, cardInternalId: 'card-1' }
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([
            agentConversation({ actionId: 'other-action', id: 'other-action', path: 'other-action.json' }),
            agentConversation({ cardInternalId: 'card-2', id: 'other-context', path: 'other-context.json' }),
            agentConversation({ id: 'running', path: 'running.json', status: 'running' }),
            agentConversation({ id: 'completed', path: 'completed.json', status: 'completed' }),
            agentConversation({ id: 'cancelled', path: 'cancelled.json', status: 'cancelled' }),
            agentConversation({ id: 'failed', path: 'failed.json', status: 'failed' }),
        ])
        actionService.loadFromFiles([file(agentDefinition('respond', {
            label: 'Respond',
            phrases: [{ text: 'Continue', title: 'Continue' }],
            streaming: true,
        }))])

        renderPopup(persistedContext)
        const conversationPicker = await screen.findByRole('combobox', { name: 'Conversation history' })
        await waitFor(() => expect(conversationPicker).toBeEnabled())

        expect(screen.queryByRole('group', { name: 'Predefined phrases' })).not.toBeInTheDocument()
    })

    it.each([
        ['agent action without phrases', agentDefinition('guarded', { label: 'Guarded', phrases: [], streaming: true }), 'agent'],
        ['non-agent action with phrases', commandDefinition('guarded', {label: 'Guarded', phrases: [{text: 'Unexpected', title: 'Unexpected'}]}), 'command'],
    ])('does not show response prompts for %s', async (_case, definition, actionType) => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        actionService.loadFromFiles([file(definition)])
        renderPopup()
        await waitFor(() => expect(runListener).not.toBeNull())

        act(() => runListener?.({
            actionId: 'guarded',
            actionType: actionType as 'agent' | 'command',
            context,
            phase: 'main',
            rootActionId: 'guarded',
            runId: 'run-1',
            status: 'waitingForInput',
            type: 'action',
        }))

        expect(screen.queryByRole('group', { name: 'Predefined phrases' })).not.toBeInTheDocument()
    })

    it('enables agent selectors only while waiting for input', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: 'Plan' })),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        actionService.loadFromFiles([file(agentDefinition('stream', { label: 'Stream', streaming: true }))])
        renderPopup()
        await waitFor(() => expect(runListener).not.toBeNull())
        const eventBase = {
            actionId: 'stream', actionType: 'agent' as const, autoFinish: null, context, interactionReady: true,
            phase: 'main' as const, rootActionId: 'stream', runId: 'run-1', streaming: true,
        }
        const model = screen.getByLabelText('Model')

        act(() => runListener?.({ ...eventBase, status: 'queued', type: 'action' }))
        expect(model).toBeDisabled()
        act(() => runListener?.({ ...eventBase, status: 'running', type: 'agentState' }))
        expect(model).toBeDisabled()
        act(() => runListener?.({ ...eventBase, status: 'waitingForInput', type: 'agentState' }))
        expect(model).toBeEnabled()
    })

    it('switches agent through restart while keeping one rendered conversation', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        const projectContext: ActionContext = { kind: 'project' }
        const earlierConversation = agentConversation({
            actionId: 'stream',
            cardInternalId: null,
            entries: [
                { content: 'Original request', id: 'user-1', kind: 'message', role: 'user', timestamp: '2026-08-01T12:00:00.000Z' },
                { agent: 'codex', content: 'Original answer', id: 'assistant-1', kind: 'message', role: 'assistant', timestamp: '2026-08-01T12:01:00.000Z' },
            ],
            path: 'design/activity/project.json#conversation=conversation-1',
        })
        const switchedConversation = {
            ...earlierConversation,
            completedAt: '2026-08-01T12:03:00.000Z',
            entries: [
                ...earlierConversation.entries,
                { content: 'Continue with Claude', id: 'user-2', kind: 'message' as const, role: 'user' as const, timestamp: '2026-08-01T12:02:00.000Z' },
                { agent: 'claude', content: 'Claude answer', id: 'assistant-2', kind: 'message' as const, role: 'assistant' as const, timestamp: '2026-08-01T12:03:00.000Z' },
            ],
            providerSessions: [
                { agent: 'codex', conversationId: 'codex-session', createdAt: '2026-08-01T12:00:00.000Z', lastUsedAt: '2026-08-01T12:01:00.000Z', synchronizedThroughMessageId: 'assistant-1' },
                { agent: 'claude', conversationId: 'claude-session', createdAt: '2026-08-01T12:02:00.000Z', lastUsedAt: '2026-08-01T12:03:00.000Z', synchronizedThroughMessageId: 'assistant-2' },
            ],
            status: 'completed' as const,
        }
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([switchedConversation])
        vi.spyOn(dataService, 'loadAgentConversation').mockResolvedValue(earlierConversation)
        vi.spyOn(agentCapabilitiesService, 'getSnapshot').mockReturnValue({
            availability: {
                error: null,
                loading: false,
                values: {
                    claude: { available: true, error: null },
                    codex: { available: true, error: null },
                },
            },
            models: { error: null, loading: false, values: [] },
            thinkingLevels: { error: null, loading: false, values: [] },
        })
        const restartActionRun = vi.fn(async () => {
            const oldEvent = {
                actionId: 'stream', actionType: 'agent' as const, autoFinish: null, context: projectContext,
                interactionReady: true, phase: 'main' as const, rootActionId: 'stream', runId: 'run-1', streaming: true,
            }
            const newEvent = { ...oldEvent, runId: 'run-2' }
            runListener?.({ ...oldEvent, status: 'completed', type: 'run' })
            runListener?.({ ...newEvent, status: 'running', type: 'run' })
            runListener?.({
                ...newEvent,
                status: 'running',
                type: 'update',
                update: { continued: true, conversation: switchedConversation, kind: 'agentStarted' },
            })
            runListener?.({
                ...newEvent,
                status: 'completed',
                type: 'update',
                update: { conversation: switchedConversation, kind: 'agentClosed' },
            })
            runListener?.({ ...newEvent, status: 'completed', type: 'run' })

            return 'run-2'
        })
        window.md2Actions = {
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
            restartActionRun,
            startAction: vi.fn(async () => 'unused'),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        actionService.loadFromFiles([file(agentDefinition('stream', { agent: 'codex', label: 'Stream', streaming: true }))])
        renderPopup(projectContext)
        await waitFor(() => expect(runListener).not.toBeNull())
        const eventBase = {
            actionId: 'stream', actionType: 'agent' as const, autoFinish: null, context: projectContext,
            interactionReady: true, phase: 'main' as const, rootActionId: 'stream', runId: 'run-1', streaming: true,
        }
        act(() => {
            runListener?.({ ...eventBase, status: 'running', type: 'run' })
            runListener?.({
                ...eventBase,
                status: 'running',
                type: 'update',
                update: { continued: false, conversation: earlierConversation, kind: 'agentStarted' },
            })
            runListener?.({ ...eventBase, status: 'waitingForInput', type: 'agentState' })
        })
        await waitFor(() => expect(screen.getByText('Original answer')).toBeInTheDocument())

        fireEvent.click(screen.getByLabelText('Model'))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Agent' }))
        fireEvent.click(await screen.findByRole('menuitem', { name: 'claude' }))
        const activeRun = actionRunRegistry.getActionRunStore('stream', projectContext)?.getSnapshot()
        if (!activeRun) throw new Error('Expected active stream run')
        act(() => actionPromptDraftService.getDraft('stream', projectContext, activeRun.runId, { prepare: false }).edit('Continue with Claude'))
        fireEvent.click(screen.getByRole('button', { name: 'Send' }))

        await waitFor(() => expect(restartActionRun).toHaveBeenCalledWith(
            'run-1',
            expect.objectContaining({
                actionId: 'stream',
                runInput: expect.objectContaining({
                    agent: 'claude',
                    continueFrom: earlierConversation.path,
                    prompt: 'Continue with Claude',
                }),
            }),
        ))
        await waitFor(() => expect(screen.getByText('Claude answer')).toBeInTheDocument())
        expect(screen.getAllByText('Original request')).toHaveLength(1)
        expect(screen.getAllByText('Original answer')).toHaveLength(1)
        expect(screen.getAllByText('Continue with Claude')).toHaveLength(1)
        expect(screen.getAllByText('Claude answer')).toHaveLength(1)
    })

    it('disables selectors during saved-settings load', async () => {
        const cardContext = { ...context, cardInternalId: 'card-1' }
        const activity = deferredValue<{
            actionSettings: Record<string, never>
            conversations: []
            origin: { cardInternalId: string; kind: 'card' }
            records: []
            version: 5
        }>()
        window.md2Actions = {
            loadCardActivity: vi.fn(() => activity.promise),
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt: vi.fn(async () => ({ prompt: 'Plan' })),
        } as unknown as typeof window.md2Actions
        vi.spyOn(agentCapabilitiesService, 'getSnapshot').mockReturnValue({
            availability: { error: null, loading: false, values: { codex: { available: true, error: null } } },
            models: { error: null, loading: false, values: [] },
            thinkingLevels: { error: null, loading: false, values: [] },
        })
        actionService.loadFromFiles([file(agentDefinition('review', { agent: 'codex', label: 'Review' }))])

        renderPopup(cardContext)
        expect(screen.getByLabelText('Model')).toBeDisabled()

        activity.resolve({actionSettings: {}, conversations: [], origin: { cardInternalId: 'card-1', kind: 'card' }, records: [], version: 5})
        await waitFor(() => expect(screen.getByLabelText('Model')).toBeEnabled())
    })

    it('persists complete settings across close and renderer-store restart without rendering popup roots', async () => {
        const cardContext = { ...context, cardInternalId: 'card-1' }
        let savedSettings: AgentSelectionState | null = null
        const updateCardActionSettings = vi.fn(async (request) => {
            savedSettings = request.settings
        })
        const loadCardActivity = vi.fn(async () => ({
            actionSettings: savedSettings ? { review: savedSettings } : {},
            conversations: [],
            origin: { cardInternalId: 'card-1', kind: 'card' as const },
            records: [],
            version: 5 as const,
        }))
        window.md2Actions = {
            loadCardActivity,
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt: vi.fn(async () => ({ prompt: 'Plan' })),
            updateCardActionSettings,
        } as unknown as typeof window.md2Actions
        vi.spyOn(agentCapabilitiesService, 'getSnapshot').mockReturnValue({
            availability: { error: null, loading: false, values: { codex: { available: true, error: null } } },
            models: { error: null, loading: false, values: [] },
            thinkingLevels: { error: null, loading: false, values: [] },
        })
        actionService.loadFromFiles([file(agentDefinition('review', { agent: 'codex', label: 'Review' }))])
        renderPopup(cardContext)
        await waitFor(() => expect(screen.getByLabelText('Model')).toBeEnabled())
        Object.values(renderProbes).forEach((probe) => probe.mockClear())

        fireEvent.click(screen.getByLabelText('Model'))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Model' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'gpt-5.6-sol' }))
        await waitFor(() => expect(updateCardActionSettings).toHaveBeenCalledWith({
            actionId: 'review',
            cardInternalId: 'card-1',
            settings: {
                activeAgent: 'codex', permissionMode: 'ask-for-approval',
                settingsByAgent: { codex: { model: 'gpt-5.6-sol', thinkingLevel: 'none' } },
            },
        }))
        expect(renderProbes.content).not.toHaveBeenCalled()
        expect(renderProbes.popup).not.toHaveBeenCalled()
        expect(renderProbes.selector).not.toHaveBeenCalled()
        expect(renderProbes.chat).not.toHaveBeenCalled()

        cleanup()
        renderPopup(cardContext)
        expect(screen.getByLabelText('Model')).toHaveTextContent('gpt-5.6-sol')

        cleanup()
        actionRunSettingsService.clear()
        renderPopup(cardContext)
        await waitFor(() => expect(screen.getByLabelText('Model')).toHaveTextContent('gpt-5.6-sol'))
        expect(loadCardActivity).toHaveBeenCalledTimes(2)
    })

    it('restores non-card settings after popup reopen and drops them after project-store clear', async () => {
        const fileContext: ActionContext = { file: 'README.md', kind: 'file' }
        vi.spyOn(agentCapabilitiesService, 'getSnapshot').mockReturnValue({
            availability: { error: null, loading: false, values: { codex: { available: true, error: null } } },
            models: { error: null, loading: false, values: [] },
            thinkingLevels: { error: null, loading: false, values: [] },
        })
        actionService.loadFromFiles([file(agentDefinition('review', { agent: 'codex', label: 'Review' }))])
        renderPopup(fileContext)

        fireEvent.click(screen.getByLabelText('Model'))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Model' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'gpt-5.6-sol' }))
        cleanup()
        renderPopup(fileContext)
        expect(screen.getByLabelText('Model')).toHaveTextContent('gpt-5.6-sol')

        cleanup()
        actionRunSettingsService.clear()
        renderPopup(fileContext)
        expect(screen.getByLabelText('Model')).toHaveTextContent('gpt-5.5')
    })

    it('keeps settings independent while switching actions in one card popup', async () => {
        const cardContext = { ...context, cardInternalId: 'card-1' }
        const updateCardActionSettings = vi.fn(async (request: { actionId: string }) => {
            void request
        })
        window.md2Actions = {
            loadCardActivity: vi.fn(async () => ({actionSettings: {}, conversations: [], origin: { cardInternalId: 'card-1', kind: 'card' }, records: [], version: 5})),
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt: vi.fn(async () => ({ prompt: 'Plan' })),
            updateCardActionSettings,
        } as unknown as typeof window.md2Actions
        vi.spyOn(agentCapabilitiesService, 'getSnapshot').mockReturnValue({
            availability: { error: null, loading: false, values: { codex: { available: true, error: null } } },
            models: { error: null, loading: false, values: [] },
            thinkingLevels: { error: null, loading: false, values: [] },
        })
        actionService.loadFromFiles([
            file(agentDefinition('first-agent', { agent: 'codex', label: 'First agent' })),
            file(agentDefinition('second-agent', { agent: 'codex', label: 'Second agent' })),
        ])
        renderPopup(cardContext)
        await waitFor(() => expect(screen.getByLabelText('Model')).toBeEnabled())

        fireEvent.click(screen.getByLabelText('Model'))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Model' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'gpt-5.6-sol' }))
        fireEvent.click(screen.getByRole('button', { name: 'Second agent' }))
        await waitFor(() => expect(screen.getByLabelText('Model')).toHaveTextContent('gpt-5.5'))
        fireEvent.click(screen.getByLabelText('Model'))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Model' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'gpt-5.6-terra' }))

        fireEvent.click(screen.getByRole('button', { name: 'First agent' }))
        await waitFor(() => expect(screen.getByLabelText('Model')).toHaveTextContent('gpt-5.6-sol'))
        expect(updateCardActionSettings.mock.calls.map(([request]) => request.actionId)).toEqual(['first-agent', 'second-agent'])
    })

    it('keeps unavailable saved configuration visible without overwriting persistence', async () => {
        const cardContext = { ...context, cardInternalId: 'card-1' }
        const unavailableSettings: AgentSelectionState = {
            activeAgent: 'removed-agent', permissionMode: 'ask-for-approval',
            settingsByAgent: { 'removed-agent': { model: 'removed-model', thinkingLevel: 'high' } },
        }
        const updateCardActionSettings = vi.fn(async () => undefined)
        window.md2Actions = {
            loadCardActivity: vi.fn(async () => ({
                actionSettings: { review: unavailableSettings }, conversations: [],
                origin: { cardInternalId: 'card-1', kind: 'card' }, records: [], version: 5,
            })),
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt: vi.fn(async () => ({ prompt: 'Plan' })),
            updateCardActionSettings,
        } as unknown as typeof window.md2Actions
        vi.spyOn(agentCapabilitiesService, 'getSnapshot').mockReturnValue({
            availability: { error: null, loading: false, values: { 'removed-agent': { available: false, error: 'Executable removed' } } },
            models: { error: null, loading: false, values: [] },
            thinkingLevels: { error: null, loading: false, values: [] },
        })
        actionService.loadFromFiles([file(agentDefinition('review', { agent: 'codex', label: 'Review' }))])

        renderPopup(cardContext)

        await waitFor(() => {
            const model = screen.getByLabelText('Model')
            expect(model.querySelector('[data-model-label]')).toHaveTextContent('removed-model')
            expect(model.querySelector('[data-full-thinking-level]')).toHaveTextContent('high')
        })
        expect(screen.getByText('Unknown agent profile in action run settings: removed-agent')).toBeInTheDocument()

        fireEvent.click(screen.getByLabelText('Model'))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Agent' }))
        expect(screen.getByRole('menuitem', { name: /removed-agent — unavailable/u })).toHaveClass('Mui-selected')
        fireEvent.keyDown(screen.getByRole('menu', { name: 'Agent choices' }), { key: 'ArrowLeft' })
        fireEvent.click(screen.getByRole('menuitem', { name: 'Model' }))
        expect(screen.getByRole('menuitem', { name: 'removed-model — unavailable' })).toHaveClass('Mui-selected')
        fireEvent.keyDown(screen.getByRole('menu', { name: 'Model choices' }), { key: 'ArrowLeft' })
        fireEvent.click(screen.getByRole('menuitem', { name: 'Thinking level' }))
        expect(screen.getByRole('menuitem', { name: 'high — unavailable' })).toHaveClass('Mui-selected')
        expect(updateCardActionSettings).not.toHaveBeenCalled()
    })

    it('uses active one-shot child controls and omits Finish', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: 'Plan' })),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        actionService.loadFromFiles([file(agentDefinition('one-shot', { label: 'One shot' }))])
        renderPopup()
        await waitFor(() => expect(runListener).not.toBeNull())

        act(() => {
            runListener?.({
                actionId: 'one-shot',
                actionType: 'agent',
                autoFinish: null,
                context,
                runId: 'run-1',
                interactionReady: true,
                phase: 'main',
                rootActionId: 'one-shot',
                status: 'running',
                streaming: false,
                type: 'agentState',
            })
        })

        expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Schedule' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Finish' })).not.toBeInTheDocument()
    })

    it('hides agent Send controls while an agent root runs a command child', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        const cancelActionRun = vi.fn(async () => undefined)
        window.md2Actions = {
            cancelActionRun,
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: 'Plan' })),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        actionService.loadFromFiles([file(agentDefinition('root-agent', { label: 'Root agent' }))])
        renderPopup()
        await waitFor(() => expect(runListener).not.toBeNull())

        act(() => {
            runListener?.({
                actionId: 'root-agent', context, runId: 'run-1', phase: 'main', rootActionId: 'root-agent',
                status: 'running', type: 'run',
            })
            runListener?.({
                actionId: 'command-child', actionType: 'command', context, runId: 'run-1', phase: 'after',
                rootActionId: 'root-agent', status: 'running', streaming: false, type: 'action',
            })
        })

        expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
        await waitFor(() => expect(cancelActionRun).toHaveBeenCalledWith('run-1'))
    })

    it('shows queued state and allows cancelling before the agent starts', async () => {
        actionRunRegistry.stop()
        const queuedContext = { ...context, cardInternalId: 'card-1' }
        let runListener: ((event: ActionRunEvent) => void) | null = null
        const cancelActionRun = vi.fn(async () => undefined)
        const historicalConversation = agentConversation({
            actionId: 'queued-agent', completedAt: '2026-08-01T12:05:00.000Z', id: 'history',
            entries: [{
                content: 'Historical answer', id: 'history-message', kind: 'message', role: 'assistant',
                timestamp: '2026-08-01T12:04:00.000Z',
            }],
            path: 'history.json', status: 'completed', title: 'Historical run',
        })
        window.md2Actions = {
            cancelActionRun,
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener

                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: 'Plan' })),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        vi.spyOn(dataService, 'listAgentConversations').mockResolvedValue([historicalConversation])
        vi.spyOn(dataService, 'loadAgentConversation').mockResolvedValue(historicalConversation)
        actionService.loadFromFiles([file(agentDefinition('queued-agent', { label: 'Queued agent' }))])
        renderPopup(queuedContext)
        await waitFor(() => expect(runListener).not.toBeNull())

        act(() => {
            runListener?.({
                actionId: 'queued-agent', context: queuedContext, runId: 'run-1', phase: 'main',
                rootActionId: 'queued-agent', status: 'running', type: 'run',
            })
            runListener?.({
                actionId: 'queued-agent', actionType: 'agent', context: queuedContext, runId: 'run-1',
                interactionReady: false, phase: 'main', rootActionId: 'queued-agent', status: 'queued',
                streaming: false, type: 'action',
            })
        })

        expect(screen.getByRole('status')).toHaveTextContent('queued')
        expect(screen.getByRole('button', { name: /Queued agent.*Action is queued/u })).toBeInTheDocument()
        const conversationPicker = screen.getByRole('combobox', { name: 'Conversation history' })
        await waitFor(() => expect(conversationPicker).toBeEnabled())
        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')
        fireEvent.change(prompt, { target: { value: 'Queued draft' } })
        expect(prompt).toHaveValue('Queued draft')
        const stopButton = screen.getByRole('button', { name: 'Stop' })
        expect(stopButton).toBeEnabled()
        fireEvent.mouseOver(stopButton)
        expect(await screen.findByText('Stop', { selector: '.MuiTooltip-tooltip' })).toBeInTheDocument()
        fireEvent.click(stopButton)
        await waitFor(() => expect(cancelActionRun).toHaveBeenCalledWith('run-1'))
    })

    it('shows agent controls for a streaming child of a command root', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
        } as unknown as typeof window.md2Actions
        actionRunRegistry.start()
        actionService.loadFromFiles([file(commandDefinition('root-command', { label: 'Root command' }))])
        renderPopup()
        await waitFor(() => expect(runListener).not.toBeNull())

        act(() => {
            runListener?.({
                actionId: 'root-command', context, runId: 'run-1', phase: 'main', rootActionId: 'root-command',
                status: 'running', type: 'run',
            })
            runListener?.({
                actionId: 'stream-child',
                actionType: 'agent',
                autoFinish: null,
                context,
                runId: 'run-1',
                interactionReady: true,
                phase: 'after',
                rootActionId: 'root-command',
                status: 'waitingForInput',
                streaming: true,
                type: 'agentState',
            })
        })

        expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Schedule' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
        const promptSurface = screen.getByLabelText('Prompt')
        expect(within(promptSurface).getByTestId('action-popup-bottom-row')).toHaveAttribute('data-embedded', 'true')
        expect(screen.getAllByTestId('action-popup-bottom-row')).toHaveLength(1)
    })

    it('blocks a needsWorkTree action without assignment and reports the reason', async () => {
        actionService.loadFromFiles([
            file(commandDefinition('assigned', { appliesTo: { kind: 'project' }, label: 'Assigned action', needsWorkTree: true })),
        ])
        const reportError = vi.spyOn(dialogService, 'error')
        renderPopup({ kind: 'project' })

        expect(screen.getByRole('alert')).toHaveTextContent('Action "Assigned action" requires a worktree assignment')
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        await waitFor(() => expect(reportError).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Action "Assigned action" requires a worktree assignment' }),
            { fallbackMessage: 'Action run failed' },
        ))
        expect(window.md2Actions?.startAction).toBeUndefined()
    })

    it('stores card and project popup sizes separately', () => {
        const { unmount } = render(
            <AppThemeProvider><ActionPopup anchorElement={document.body} context={context} onClose={vi.fn()} /></AppThemeProvider>,
        )
        expect(screen.getByRole('dialog')).toHaveStyle({ height: '450px', width: '400px' })
        unmount()

        render(
            <AppThemeProvider><ActionPopup anchorElement={document.body} context={{ kind: 'project' }} onClose={vi.fn()} /></AppThemeProvider>,
        )
        expect(CARD_RUN_POPUP_SIZE_STORAGE_KEY).not.toBe(PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY)
        expect(screen.getByRole('dialog')).toHaveStyle({ height: '450px', width: '400px' })
    })

    it('keeps desktop popup controls outside the window drag region and reaches the bottom edge', () => {
        renderPopup()

        const dialog = screen.getByRole('dialog')
        expect(appRegion(dialog)).toBe('no-drag')
        expect(dialog).toHaveStyle({ maxHeight: 'calc(100vh - 16px)' })
        expect(screen.getByRole('button', { name: 'Expand upward' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    })

    it('uses a full-screen mobile card layout without desktop controls or size persistence', () => {
        setMobileBreakpoint(true)
        const storedSize = JSON.stringify({ height: 640, width: 720 })
        window.localStorage.setItem(CARD_RUN_POPUP_SIZE_STORAGE_KEY, storedSize)
        const getStoredValue = vi.spyOn(Storage.prototype, 'getItem')
        const setStoredValue = vi.spyOn(Storage.prototype, 'setItem')
        const { onClose } = renderPopup()
        const dialog = screen.getByRole('dialog')

        expect(dialog).toHaveStyle({
            borderRadius: '0px', height: '100dvh', left: '0px', margin: '0px', maxHeight: 'none', maxWidth: 'none',
            top: '0px', width: '100vw',
        })
        expect(screen.queryByRole('separator', { name: /Resize action popup/u })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Expand upward|Collapse downward/u })).not.toBeInTheDocument()
        expect(screen.getByTestId('action-popup-scroll-body')).toHaveStyle({ minHeight: '0', overflow: 'auto' })
        expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument()

        const actionGroup = screen.getByRole('group', { name: 'Actions' })
        fireEvent.click(within(actionGroup).getByRole('button', { name: 'Second action' }))
        expect(within(actionGroup).getByRole('button', { name: 'Second action' })).toHaveAttribute('aria-pressed', 'true')
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))

        expect(onClose).toHaveBeenCalledOnce()
        expect(getStoredValue).not.toHaveBeenCalledWith(CARD_RUN_POPUP_SIZE_STORAGE_KEY)
        expect(setStoredValue).not.toHaveBeenCalledWith(CARD_RUN_POPUP_SIZE_STORAGE_KEY, expect.any(String))
        expect(window.localStorage.getItem(CARD_RUN_POPUP_SIZE_STORAGE_KEY)).toBe(storedSize)
    })

    it('keeps project conversation controls usable in the mobile layout', () => {
        setMobileBreakpoint(true)
        actionService.loadFromFiles([
            file(agentDefinition('review', { appliesTo: { kind: 'project' }, label: 'Review project' })),
        ])

        renderPopup({ kind: 'project' })

        expect(screen.getByRole('dialog')).toHaveStyle({ height: '100dvh', left: '0px', top: '0px', width: '100vw' })
        expect(screen.getByRole('combobox', { name: 'Conversation history' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
        expect(screen.queryByRole('separator', { name: /Resize action popup/u })).not.toBeInTheDocument()
    })

    it('expands upward and restores the anchored size after collapse', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const { onClose } = renderPopup()
        const dialog = screen.getByRole('dialog')

        fireEvent.click(screen.getByRole('button', { name: 'Expand upward' }))
        expect(dialog).toHaveStyle({ height: '100vh', top: '0px' })
        expect(appRegion(dialog)).toBe('no-drag')
        const leftResizeHandle = screen.getByRole('separator', { name: 'Resize action popup from left' })
        const rightResizeHandle = screen.getByRole('separator', { name: 'Resize action popup from right' })
        expect(leftResizeHandle).toHaveStyle({ cursor: 'ew-resize' })
        expect(rightResizeHandle).toHaveStyle({ cursor: 'ew-resize' })
        expect(screen.getAllByRole('separator', { name: /Resize action popup from/u })).toHaveLength(2)
        expect(screen.queryByRole('separator', { name: 'Resize action popup from top' })).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Collapse downward' }))
        expect(dialog.style.height).toBe('450px')
        expect(screen.getAllByRole('separator', { name: /Resize action popup from/u })).toHaveLength(8)

        fireEvent.click(screen.getByRole('button', { name: 'Expand upward' }))
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))

        expect(onClose).toHaveBeenCalledOnce()
        expect(consoleError).not.toHaveBeenCalled()
    })

    describe('ActionPopup card id badge tooltip', () => {
        function snapshotCard(id: string, internalId: string, title: string): Card {
            return {
                agentConversationErrors: [],
                agentConversations: [],
                content: '',
                header: {
                    affects: [], after: null, agentLogReferences: [], author: null, changedFiles: [], id, internalId,
                    owner: null, policy: {}, references: [], status: 'design', title,
                },
                hasFrontmatter: true,
                isActive: true,
                path: `design/${id}.md`,
            }
        }

        function mockSnapshotCards(cards: Card[]) {
            vi.spyOn(dataService, 'getState').mockReturnValue({
                project,
                runningAgents: [],
                snapshot: { activeCards: cards, backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
            })
        }

        function renderDraggablePopup(contextOverride: ActionContext) {
            render(
                <AppThemeProvider>
                    <ActionPopup anchorElement={document.body} context={contextOverride} draggable onClose={vi.fn()} />
                </AppThemeProvider>,
            )
        }

        function badge(id: string) {
            return within(screen.getByTestId('action-popup-toolbar')).getByText(id)
        }

        it('shows the card title in a tooltip when the id badge is hovered', async () => {
            mockSnapshotCards([snapshotCard('F-010', 'card-1', 'Improve the popup')])

            renderPopup({ ...context, cardInternalId: 'card-1' })
            fireEvent.mouseOver(badge('F-010'))

            expect(await screen.findByText('Improve the popup', { selector: '.MuiTooltip-tooltip' })).toBeInTheDocument()
        })

        // jsdom never reports :focus-visible for a focused span, so MUI's focus trigger cannot open the

        // tooltip here. What is testable is the part this feature added: the badge is keyboard reachable

        // and carries the Tooltip's focus handler, which is what makes the tooltip open in a browser.

        it('makes the badge keyboard reachable so the tooltip has a focus trigger', async () => {

            mockSnapshotCards([snapshotCard('F-010', 'card-1', 'Improve the popup')])


            renderPopup({ ...context, cardInternalId: 'card-1' })

            const element = badge('F-010')

            expect(element).toHaveAttribute('tabindex', '0')


            await userEvent.tab()


            expect(element).toHaveFocus()

        })

        it('follows a title changed in the snapshot while the popup stays open', async () => {
            mockSnapshotCards([snapshotCard('F-010', 'card-1', 'Original title')])

            renderPopup({ ...context, cardInternalId: 'card-1' })
            fireEvent.mouseOver(badge('F-010'))
            expect(await screen.findByText('Original title', { selector: '.MuiTooltip-tooltip' })).toBeInTheDocument()

            mockSnapshotCards([snapshotCard('F-010', 'card-1', 'Renamed by the run')])
            act(() => {
                dataService.dispatchEvent(new CustomEvent('changed', { detail: dataService.getState() }))
            })

            expect(await screen.findByText('Renamed by the run', { selector: '.MuiTooltip-tooltip' })).toBeInTheDocument()
            expect(screen.queryByText('Original title', { selector: '.MuiTooltip-tooltip' })).not.toBeInTheDocument()
        })

        it('still drags the popup when the pointer press starts on the id badge', () => {
            mockSnapshotCards([snapshotCard('F-010', 'card-1', 'Improve the popup')])

            renderDraggablePopup({ ...context, cardInternalId: 'card-1' })
            const dialog = screen.getByRole('dialog')
            expect(dialog.style.position).not.toBe('fixed')

            fireEvent.pointerDown(badge('F-010'), { clientX: 100, clientY: 100 })
            fireEvent.pointerMove(window, { clientX: 140, clientY: 130 })

            expect(dialog.style.position).toBe('fixed')
            expect(dialog.style.left).toBe('40px')
            expect(dialog.style.top).toBe('30px')
            fireEvent.pointerUp(window)
        })

        it('shows no tooltip for the Project badge', async () => {
            renderPopup({ kind: 'project' })
            fireEvent.mouseOver(badge('Project'))

            await waitFor(() => expect(document.querySelectorAll('.MuiTooltip-tooltip')).toHaveLength(0))
        })

        it('shows no tooltip for a card with an empty title or absent from the snapshot', async () => {
            mockSnapshotCards([snapshotCard('F-010', 'card-1', '')])

            renderPopup({ ...context, cardInternalId: 'card-1' })
            fireEvent.mouseOver(badge('F-010'))
            await waitFor(() => expect(document.querySelectorAll('.MuiTooltip-tooltip')).toHaveLength(0))

            cleanup()
            mockSnapshotCards([snapshotCard('F-020', 'card-2', 'Another card')])
            renderPopup({ ...context, cardInternalId: 'card-1' })

            expect(within(screen.getByTestId('action-popup-toolbar')).queryByText('F-010')).not.toBeInTheDocument()
        })
    })
})
