import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionRunEvent } from '../../../../data/action_run_types'
import type { ActionFile } from '../../../../data/action_types'
import type { AgentConversation, ProjectReference, StorageService, WorktreeRecord } from '../../../../data/data_types'
import { actionService } from '../../../../services/actions/action_service'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { actionRunSettingsService } from '../../../../services/actions/action_run_settings_service'
import { actionPromptDraftService } from '../../../../services/actions/action_prompt_draft_service'
import { agentCapabilitiesService } from '../../../../services/agents/agent_capabilities_service'
import { dialogService } from '../../../../services/dialog_service'
import { dataService } from '../../../../services/data/data_service'
import { worktreeService } from '../../../../services/project/worktree_service'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import { ActionPopup, CARD_RUN_POPUP_SIZE_STORAGE_KEY, PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY } from './action_popup'
import { useMarkdownTypeaheadStackPosition } from '../../../editor/markdown_typeahead_layer_context'

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

describe('ActionPopup', () => {
    beforeEach(async () => {
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
        actionRunRegistry.stop()
        actionRunSettingsService.clear()
        delete window.md2Actions
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
        expect(actionGroup.getByRole('button', { name: 'First action' })).toHaveAttribute('aria-pressed', 'true')
        expect(actionGroup.getByRole('button', { name: 'Second action' })).toHaveAttribute('aria-pressed', 'false')
        expect(dialog.getByRole('button', { name: 'Run' })).toBeInTheDocument()
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
    })

    it('provides its stack position to Markdown typeahead menus', () => {
        const stackPosition = 4
        actionService.loadFromFiles([file(agentDefinition('review', { label: 'Review' }))])

        renderPopup(context, vi.fn(), stackPosition)

        expect(renderProbes.agentPrompt).toHaveBeenCalledWith(stackPosition)
    })

    it('shows Project in the project popup header and accessible title', () => {
        renderPopup({ kind: 'project' })

        const dialog = within(screen.getByRole('dialog', { name: 'Run actions for Project' }))
        expect(within(dialog.getByTestId('action-popup-toolbar')).getByText('Project')).toBeInTheDocument()
    })

    it('does not render popup content while typing or flushing a prompt', async () => {
        const loadActionRunHistory = vi.fn(async () => [])
        window.md2Actions = {
            loadActionRunHistory,
            onActionRun: vi.fn(() => vi.fn()),
            prepareActionPrompt: vi.fn(async () => ({ prompt: 'Plan' })),
        } as unknown as typeof window.md2Actions
        actionService.loadFromFiles([file(agentDefinition('review', { label: 'Review' }))])
        renderPopup()
        const prompt = within(screen.getByLabelText('Prompt')).getByRole('textbox')
        await waitFor(() => expect(prompt).toHaveValue('Plan'))
        await waitFor(() => expect(loadActionRunHistory).toHaveBeenCalled())
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

    it('renders only selector boundary when another action status changes', async () => {
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

        expect(renderProbes.selector).toHaveBeenCalled()
        expect(renderProbes.popup).not.toHaveBeenCalled()
        expect(renderProbes.content).not.toHaveBeenCalled()
        expect(renderProbes.chat).not.toHaveBeenCalled()
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
            update: { content: 'streamed', kind: 'output', messageId: 'assistant-1', sequence: 1 },
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

    it('owns add mode internally and selects the custom prompt', async () => {
        renderPopup()
        const dialog = within(screen.getByRole('dialog', { name: 'Run actions' }))

        fireEvent.click(dialog.getByRole('button', { name: 'Add action' }))

        expect(dialog.getByRole('button', { name: 'Custom prompt' })).toHaveAttribute('aria-pressed', 'true')
        expect(await dialog.findByLabelText('Preset name')).toBeInTheDocument()
        expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled()
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

    it('keeps the selected action when a run changes the card context', () => {
        actionService.loadFromFiles([
            file(commandDefinition('design', { appliesTo: { state: 'design' }, label: 'Design action' })),
        ])
        const running: ActionContext = { ...context, state: 'design' }
        const { rerender } = render(
            <AppThemeProvider>
                <ActionPopup anchorElement={document.body} context={running} onClose={vi.fn()} />
            </AppThemeProvider>,
        )
        expect(within(screen.getByRole('group', { name: 'Actions' })).getByRole('button', { name: 'Design action' }))
            .toHaveAttribute('aria-pressed', 'true')

        rerender(
            <AppThemeProvider>
                <ActionPopup anchorElement={document.body} context={{ ...running, state: 'ready' }} onClose={vi.fn()} />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('dialog', { name: 'Run actions' })).toBeInTheDocument()
        expect(within(screen.getByRole('group', { name: 'Actions' })).getByRole('button', { name: 'Design action' }))
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
        })
        const waitingButton = screen.getByRole('button', { name: /Stream.*Agent is waiting for input/u })
        expect(waitingButton).toBeInTheDocument()
        fireEvent.mouseOver(waitingButton)
        expect(await screen.findByRole('tooltip', { name: 'Agent is waiting for input' })).toBeInTheDocument()

        cleanup()
        renderPopup()
        expect(screen.getByRole('button', { name: /Stream.*Agent is waiting for input/u })).toBeInTheDocument()

        act(() => runListener?.({ ...eventBase, status: 'running', type: 'agentState' }))
        expect(screen.getByRole('button', { name: /Stream.*Agent is running/u })).toBeInTheDocument()

        act(() => runListener?.({ ...eventBase, status: 'completed', type: 'run' }))
        expect(screen.getByRole('button', { name: 'Stream' })).toBeInTheDocument()
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

    it('keeps the prompt empty when selecting a completed historical conversation', async () => {
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
        expect(prepareActionPrompt).toHaveBeenCalledOnce()
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
        act(() => actionPromptDraftService.getDraft('active', context, activeRun, { prepare: false }).edit('Keep active draft'))
        cleanup()
        renderPopup()
        fireEvent.click(within(screen.getByRole('group', { name: 'Actions' })).getByRole('button', { name: /Active action/u }))

        await waitFor(() => expect(within(screen.getByLabelText('Prompt')).getByRole('textbox')).toHaveValue('Keep active draft'))
    })

    it('closes from the popup header', () => {
        const { onClose } = renderPopup()

        fireEvent.click(screen.getByRole('button', { name: 'Close' }))

        expect(onClose).toHaveBeenCalledOnce()
    })

    it('places accessible worktree and window controls above the action selector', () => {
        renderPopup()

        const toolbar = screen.getByTestId('action-popup-toolbar')
        expect(within(toolbar).getByRole('button', { name: 'Primary worktree' })).toBeInTheDocument()
        expect(within(toolbar).getByRole('button', { name: 'Expand upward' })).toBeInTheDocument()
        expect(within(toolbar).getByRole('button', { name: 'Close' })).toBeInTheDocument()
        expect(within(toolbar).queryByRole('group', { name: 'Actions' })).not.toBeInTheDocument()
        expect(screen.getByRole('group', { name: 'Actions' })).toBeInTheDocument()
    })

    it('delegates card assignment to the worktree preparation workflow', async () => {
        const setCardWorktree = vi.spyOn(worktreeService, 'setCardWorktree').mockResolvedValue(undefined)
        renderPopup()

        fireEvent.click(screen.getByRole('button', { name: 'Primary worktree' }))
        fireEvent.click(screen.getByRole('menuitem', { name: /1 — C:\\feature/u }))

        await waitFor(() => expect(setCardWorktree).toHaveBeenCalledWith('design/F-010.md', 1))
    })

    it('keeps card selection and reports the error when worktree preparation fails', async () => {
        vi.spyOn(worktreeService, 'setCardWorktree').mockRejectedValue(new Error('preparation failed'))
        const reportError = vi.spyOn(dialogService, 'error')
        renderPopup()

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

    it('shows uniform icon-only Send, Finish, and Stop controls while waiting', async () => {
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

        expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
        await waitFor(() => expect(finishActionRun).toHaveBeenCalledWith('run-1'))
    })

    it('shows response prompts only while scoped run waits and keeps them inside prompt surface', async () => {
        actionRunRegistry.stop()
        let runListener: ((event: ActionRunEvent) => void) | null = null
        const sendActionQueuedMessage = vi.fn(async () => ({ sent: true }))
        const setActionQueuedMessage = vi.fn(async () => ({ accepted: true }))
        window.md2Actions = {
            beginActionPromptDraft: vi.fn(async () => 1),
            loadActionRunHistory: vi.fn(async () => []),
            onActionRun: vi.fn((listener) => {
                runListener = listener
                return vi.fn()
            }),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
            sendActionQueuedMessage,
            setActionQueuedMessage,
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
        const phraseButton = within(phraseGroup).getByRole('button', { name: 'Continue' })

        fireEvent.click(phraseButton)
        await waitFor(() => expect(within(promptSurface).getByRole('textbox')).toHaveValue('Continue with tests'))
        await waitFor(() => expect(setActionQueuedMessage).toHaveBeenCalled())
        expect(sendActionQueuedMessage).not.toHaveBeenCalled()

        fireEvent.doubleClick(phraseButton)
        await waitFor(() => expect(sendActionQueuedMessage).toHaveBeenCalled())

        act(() => runListener?.({ ...eventBase, status: 'completed', type: 'run' }))
        expect(screen.getByRole('group', { name: 'Predefined phrases' })).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByRole('group', { name: 'Predefined phrases' })).not.toBeInTheDocument())
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

    it('disables selectors during saved-settings load', async () => {
        const cardContext = { ...context, cardInternalId: 'card-1' }
        const activity = deferredValue<{
            actionSettings: Record<string, never>
            conversations: []
            origin: { cardInternalId: string; kind: 'card' }
            records: []
            version: 3
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
        expect(screen.getByLabelText('Model')).toHaveAttribute('aria-disabled', 'true')

        activity.resolve({actionSettings: {}, conversations: [], origin: { cardInternalId: 'card-1', kind: 'card' }, records: [], version: 3})
        await waitFor(() => expect(screen.getByLabelText('Model')).not.toHaveAttribute('aria-disabled', 'true'))
    })

    it('persists complete settings across close and renderer-store restart without rendering popup roots', async () => {
        const cardContext = { ...context, cardInternalId: 'card-1' }
        let savedSettings: {
            accessLevel: string
            agent: string
            approvalPolicy: string
            model: string
            thinkingLevel: string
        } | null = null
        const updateCardActionSettings = vi.fn(async (request) => {
            savedSettings = request.settings
        })
        const loadCardActivity = vi.fn(async () => ({
            actionSettings: savedSettings ? { review: savedSettings } : {},
            conversations: [],
            origin: { cardInternalId: 'card-1', kind: 'card' as const },
            records: [],
            version: 3 as const,
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
        await waitFor(() => expect(screen.getByLabelText('Model')).not.toHaveAttribute('aria-disabled', 'true'))
        Object.values(renderProbes).forEach((probe) => probe.mockClear())

        fireEvent.mouseDown(screen.getByLabelText('Model'))
        fireEvent.click(screen.getByRole('option', { name: 'gpt-5.6-sol' }))
        await waitFor(() => expect(updateCardActionSettings).toHaveBeenCalledWith({
            actionId: 'review',
            cardInternalId: 'card-1',
            settings: {
                accessLevel: '', agent: 'codex', approvalPolicy: '',
                model: 'gpt-5.6-sol', thinkingLevel: 'none',
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

    it('keeps settings independent while switching actions in one card popup', async () => {
        const cardContext = { ...context, cardInternalId: 'card-1' }
        const updateCardActionSettings = vi.fn(async (request: { actionId: string }) => {
            void request
        })
        window.md2Actions = {
            loadCardActivity: vi.fn(async () => ({actionSettings: {}, conversations: [], origin: { cardInternalId: 'card-1', kind: 'card' }, records: [], version: 3})),
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
        await waitFor(() => expect(screen.getByLabelText('Model')).not.toHaveAttribute('aria-disabled', 'true'))

        fireEvent.mouseDown(screen.getByLabelText('Model'))
        fireEvent.click(screen.getByRole('option', { name: 'gpt-5.6-sol' }))
        fireEvent.click(screen.getByRole('button', { name: 'Second agent' }))
        await waitFor(() => expect(screen.getByLabelText('Model')).toHaveTextContent('gpt-5.5'))
        fireEvent.mouseDown(screen.getByLabelText('Model'))
        fireEvent.click(screen.getByRole('option', { name: 'gpt-5.6-terra' }))

        fireEvent.click(screen.getByRole('button', { name: 'First agent' }))
        await waitFor(() => expect(screen.getByLabelText('Model')).toHaveTextContent('gpt-5.6-sol'))
        expect(updateCardActionSettings.mock.calls.map(([request]) => request.actionId)).toEqual(['first-agent', 'second-agent'])
    })

    it('uses current defaults for unavailable saved configuration without overwriting persistence', async () => {
        const cardContext = { ...context, cardInternalId: 'card-1' }
        const unavailableSettings = {accessLevel: '', agent: 'removed-agent', approvalPolicy: '', model: 'removed-model', thinkingLevel: 'high'}
        const updateCardActionSettings = vi.fn(async () => undefined)
        window.md2Actions = {
            loadCardActivity: vi.fn(async () => ({
                actionSettings: { review: unavailableSettings }, conversations: [],
                origin: { cardInternalId: 'card-1', kind: 'card' }, records: [], version: 3,
            })),
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

        await waitFor(() => expect(screen.getByLabelText('Agent')).toHaveTextContent('codex'))
        expect(screen.getByLabelText('Model')).toHaveTextContent('gpt-5.5')
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

        expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
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
        actionService.loadFromFiles([file(agentDefinition('queued-agent', { label: 'Queued agent' }))])
        renderPopup()
        await waitFor(() => expect(runListener).not.toBeNull())

        act(() => {
            runListener?.({
                actionId: 'queued-agent', context, runId: 'run-1', phase: 'main',
                rootActionId: 'queued-agent', status: 'running', type: 'run',
            })
            runListener?.({
                actionId: 'queued-agent', actionType: 'agent', context, runId: 'run-1',
                interactionReady: false, phase: 'main', rootActionId: 'queued-agent', status: 'queued',
                streaming: false, type: 'action',
            })
        })

        expect(screen.getByRole('status')).toHaveTextContent('queued')
        expect(screen.getByRole('button', { name: /Queued agent.*Action is queued/u })).toBeInTheDocument()
        const stopButton = screen.getByRole('button', { name: 'Stop' })
        expect(stopButton).toBeEnabled()
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

        expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
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

    it('uses a full-screen mobile card layout without desktop controls or size persistence', () => {
        setMobileBreakpoint(true)
        const storedSize = JSON.stringify({ height: 640, width: 720 })
        window.localStorage.setItem(CARD_RUN_POPUP_SIZE_STORAGE_KEY, storedSize)
        const getStoredValue = vi.spyOn(Storage.prototype, 'getItem')
        const setStoredValue = vi.spyOn(Storage.prototype, 'setItem')
        const { onClose } = renderPopup()
        const dialog = screen.getByRole('dialog')

        expect(dialog).toHaveStyle({
            borderRadius: '0px', height: '100vh', left: '0px', margin: '0px', maxHeight: 'none', maxWidth: 'none',
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

        expect(screen.getByRole('dialog')).toHaveStyle({ height: '100vh', left: '0px', top: '0px', width: '100vw' })
        expect(screen.getByRole('combobox', { name: 'Conversation history' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
        expect(screen.queryByRole('separator', { name: /Resize action popup/u })).not.toBeInTheDocument()
    })

    it('expands upward and restores the anchored size after collapse', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const { onClose } = renderPopup()
        const dialog = screen.getByRole('dialog')

        fireEvent.click(screen.getByRole('button', { name: 'Expand upward' }))
        expect(dialog.style.height).toBe('100vh')

        fireEvent.click(screen.getByRole('button', { name: 'Collapse downward' }))
        expect(dialog.style.height).toBe('450px')

        fireEvent.click(screen.getByRole('button', { name: 'Expand upward' }))
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))

        expect(onClose).toHaveBeenCalledOnce()
        expect(consoleError).not.toHaveBeenCalled()
    })
})
