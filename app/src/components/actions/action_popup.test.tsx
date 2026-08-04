import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../../data/action_context'
import type { ActionRunEvent } from '../../data/action_run_types'
import type { ActionFile } from '../../data/action_types'
import type { ProjectReference, StorageService, WorktreeRecord } from '../../data/data_types'
import { actionService } from '../../services/actions/action_service'
import { actionRunRegistry } from '../../services/actions/action_run_registry'
import { actionPromptDraftService } from '../../services/actions/action_prompt_draft_service'
import { dialogService } from '../../services/dialog_service'
import { worktreeService } from '../../services/project/worktree_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ActionPopup, CARD_RUN_POPUP_SIZE_STORAGE_KEY, PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY } from './action_popup'

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

vi.mock('./action_agent_prompt', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./action_agent_prompt')>()

    return {
        ...actual,
        ActionAgentPrompt: function ActionAgentPromptRenderProbe(props: Parameters<typeof actual.ActionAgentPrompt>[0]) {
            renderProbes.agentPrompt()

            return actual.ActionAgentPrompt(props)
        },
    }
})

vi.mock('./action_agent_selectors', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./action_agent_selectors')>()

    return {
        ...actual,
        ActionAgentSelectors: function ActionAgentSelectorsRenderProbe(props: Parameters<typeof actual.ActionAgentSelectors>[0]) {
            renderProbes.agentSelectors()

            return actual.ActionAgentSelectors(props)
        },
    }
})

vi.mock('./action_conversation_picker', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./action_conversation_picker')>()

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

vi.mock('./action_log_error_display', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./action_log_error_display')>()

    return {
        ...actual,
        ActionLogErrorDisplay: function ActionLogErrorDisplayRenderProbe(props: Parameters<typeof actual.ActionLogErrorDisplay>[0]) {
            renderProbes.logError()

            return actual.ActionLogErrorDisplay(props)
        },
    }
})

vi.mock('./action_phrase_buttons', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./action_phrase_buttons')>()

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

vi.mock('./action_conversation_chat', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./action_conversation_chat')>()

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
const validWorktree: WorktreeRecord = {
    branch: 'feature', error: null, parkingBranch: 'md2/parking/feature', path: 'C:\\feature',
    status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false }, valid: true,
}

function worktreeStorage(): StorageService {
    return {
        onWorktreesChanged: vi.fn((callback) => {
            callback({ error: null, primaryStatus: null, project, records: [validWorktree] })
            return vi.fn()
        }),
    } as unknown as StorageService
}

function renderPopup(contextOverride: ActionContext = context, onClose = vi.fn()) {
    function ActionPopupRenderProbe() {
        renderProbes.popup()

        return <ActionPopup anchorElement={document.body} context={contextOverride} onClose={onClose} />
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
            flushPendingChanges: vi.fn(async () => undefined),
            projectFolderProvider: () => 'design',
            projectProvider: () => project,
            snapshotProvider: () => null,
            storageProvider: () => storage,
        })
    })

    afterEach(() => {
        actionRunRegistry.stop()
        delete window.md2Actions
        actionService.clear()
        worktreeService.clear()
        window.localStorage.clear()
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
                    },
                    kind: 'agentStarted',
                },
            })
        })
        await waitFor(() => expect(renderProbes.phraseButtons).toHaveBeenCalled())
        expect(renderProbes.agentPrompt).toHaveBeenCalled()
        expect(renderProbes.agentSelectors).toHaveBeenCalled()
        expect(renderProbes.conversationPicker).toHaveBeenCalled()
        expect(renderProbes.logError).toHaveBeenCalled()
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
