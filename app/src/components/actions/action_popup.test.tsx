import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionPopup, CARD_RUN_POPUP_SIZE_STORAGE_KEY, PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY } from './action_popup'
import { CUSTOM_PROMPT_ACTION_ID, type ActionDefinition } from '../../data/action_types'
import type { ActionContext } from '../../data/action_context'
import type { ActionRunResult } from '../../data/action_run_types'
import { configService } from '../../services/config/config_service'
import { actionExecutionService } from '../../services/actions/action_execution_service'
import { agentCapabilitiesService } from '../../services/agents/agent_capabilities_service'
import type { ActionExecutionEvent } from '../../data/action_run_types'
import type { AgentConversation } from '../../data/data_types'
import { dialogService } from '../../services/dialog_service'
import { AppThemeProvider } from '../../theme/theme_provider'

function action(name: string, overrides: Partial<ActionDefinition> = {}): ActionDefinition {
    return {
        agent: null,
        appliesTo: null,
        builtin: false,
        command: 'run',
        description: `${name} description`,
        icon: null,
        id: `action-${name.toLowerCase().replaceAll(' ', '-')}`,
        label: name,
        model: null,
        needsWorkTree: false,
        on: [],
        onAfter: [],
        onBefore: [],
        onState: null,
        phrases: [],
        prompt: null,
        sourcePath: `actions/${name}.json`,
        thinkingLevel: null,
        trackFileChanges: false,
        type: 'command',
        ...overrides,
    }
}

const context: ActionContext = { file: 'design/F-010.md', kind: 'card', state: 'design', type: 'feature' }
const completedResult: ActionRunResult = {
    logs: [{ actionName: 'Implement', command: 'run', message: 'Implement completed', phase: 'main', status: 'completed', stderr: '', stdout: 'ok' }],
    status: 'completed',
}

function conversation(id: string, overrides: Partial<AgentConversation> = {}): AgentConversation {
    return {
        actionId: 'action-implement',
        cardPath: context.file ?? null,
        completedAt: '2026-07-15T10:01:00.000Z',
        events: [],
        hasExplicitTitle: true,
        id,
        messages: [],
        path: `.md2-agent-logs/${id}.json`,
        providerSessions: [],
        startedAt: '2026-07-15T10:00:00.000Z',
        status: 'completed',
        title: id,
        ...overrides,
    }
}

function deferred<T>() {
    let resolve: (value: T) => void = () => undefined
    const promise = new Promise<T>((promiseResolve) => {
        resolve = promiseResolve
    })

    return { promise, resolve }
}

function selectThinkingLevel(level: string) {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Thinking level' }))
    fireEvent.click(screen.getByRole('option', { name: level }))
}

function selectAgent(agent: string) {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Agent' }))
    fireEvent.click(screen.getByRole('option', { name: agent }))
}

/** The card popup renders the prompt as a markdown editor whose textbox lives inside the labelled region. */
function cardPromptTextbox() {
    return within(screen.getByLabelText('Prompt')).getByRole('textbox')
}

function renderPopup(overrides: Partial<Parameters<typeof ActionPopup>[0]> = {}) {
    const onNavigate = vi.fn()
    const onClose = vi.fn()
    const loadHistory = vi.fn(async () => [])
    const preparePrompt = vi.fn(async (selectedAction: ActionDefinition) => selectedAction.prompt ?? '')
    const runAction = vi.fn(async () => completedResult)
    const scheduleAction = vi.fn(async () => {})
    const rendered = render(
        <AppThemeProvider>
            <ActionPopup
                action={action('Implement')}
                anchorElement={document.body}
                context={context}
                loadHistory={loadHistory}
                onClose={onClose}
                onNavigate={onNavigate}
                preparePrompt={preparePrompt}
                runAction={runAction}
                scheduleAction={scheduleAction}
                {...overrides}
            />
        </AppThemeProvider>,
    )

    const rerenderPopup = (nextOverrides: Partial<Parameters<typeof ActionPopup>[0]>) => {
        rendered.rerender(
            <AppThemeProvider>
                <ActionPopup
                    action={action('Implement')}
                    anchorElement={document.body}
                    context={context}
                    loadHistory={loadHistory}
                    onClose={onClose}
                    onNavigate={onNavigate}
                    preparePrompt={preparePrompt}
                    runAction={runAction}
                    scheduleAction={scheduleAction}
                    {...overrides}
                    {...nextOverrides}
                />
            </AppThemeProvider>,
        )
    }

    return { loadHistory, onClose, onNavigate, preparePrompt, rerenderPopup, runAction, scheduleAction }
}

describe('ActionPopup', () => {
    afterEach(cleanup)
    afterEach(() => vi.restoreAllMocks())
    afterEach(() => {
        actionExecutionService.stop()
        delete window.md2Actions
        configService.clear()
    })

    it('shows the action label, description and Schedule before Run', () => {
        renderPopup()

        expect(screen.getByText('Implement')).toBeInTheDocument()
        expect(screen.getByText('Implement description')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Schedule' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Schedule' }).compareDocumentPosition(screen.getByRole('button', { name: 'Run' })))
            .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })

    it('loads the complete prepared prompt and disables Run while loading', async () => {
        const preparation = deferred<string>()
        const selectedAction = action('Implement', { prompt: 'Renderer copy', type: 'agent' })
        const preparePrompt = vi.fn(() => preparation.promise)
        renderPopup({ action: selectedAction, preparePrompt })

        expect(screen.getByLabelText('Prompt')).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
        expect(screen.getByPlaceholderText('Preparing prompt…')).toBeInTheDocument()

        await act(async () => preparation.resolve('Prepared design/F-010.md'))

        expect(screen.getByLabelText('Prompt')).toHaveValue('Prepared design/F-010.md')
        expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled()
        expect(preparePrompt).toHaveBeenCalledWith(selectedAction, context)
    })

    it('ignores stale preparation and preserves edits for the current action', async () => {
        const firstPreparation = deferred<string>()
        const secondPreparation = deferred<string>()
        const firstAction = action('First', { prompt: 'First renderer copy', type: 'agent' })
        const secondAction = action('Second', { prompt: 'Second renderer copy', type: 'agent' })
        const preparePrompt = vi.fn((selectedAction: ActionDefinition) => (
            selectedAction.id === firstAction.id ? firstPreparation.promise : secondPreparation.promise
        ))
        const { rerenderPopup } = renderPopup({ action: firstAction, preparePrompt })

        rerenderPopup({ action: secondAction, preparePrompt })
        await act(async () => secondPreparation.resolve('Second prepared'))
        fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Second edited' } })
        await act(async () => firstPreparation.resolve('First stale'))

        expect(screen.getByLabelText('Prompt')).toHaveValue('Second edited')
    })

    it('reports prompt preparation errors and keeps Run disabled', async () => {
        const error = new Error('Prompt preparation failed')
        const reportError = vi.spyOn(dialogService, 'error')
        renderPopup({
            action: action('Implement', { prompt: 'Renderer copy', type: 'agent' }),
            preparePrompt: vi.fn(async () => { throw error }),
        })

        await waitFor(() => expect(reportError).toHaveBeenCalledWith(error, { fallbackMessage: 'Could not prepare action prompt' }))
        expect(screen.getByLabelText('Prompt')).toBeDisabled()
        expect(screen.getByPlaceholderText('Prompt unavailable')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
    })

    it('fills a predefined phrase on click and continues with it on double click', async () => {
        const selectedAction = action('Implement', {
            command: null,
            phrases: [
                { text: '**Run tests**', title: 'Run tests' },
                { text: 'Show the current diff\nwith context', title: '' },
            ],
            prompt: 'Implement this',
            type: 'agent',
        })
        const { runAction } = renderPopup({ action: selectedAction, continueFrom: '.md2-agent-logs/conversation.json' })

        fireEvent.click(screen.getByRole('button', { name: 'Run tests' }))
        expect(screen.getByLabelText('Prompt')).toHaveValue('**Run tests**')
        expect(runAction).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Show the current diff' })).toBeInTheDocument()

        fireEvent.doubleClick(screen.getByRole('button', { name: 'Run tests' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(
            selectedAction,
            context,
            {
                continueFrom: '.md2-agent-logs/conversation.json',
                prompt: '**Run tests**',
                thinkingLevel: 'none',
            },
            expect.any(Function),
        ))
    })

    it('hides predefined phrases before an agent response is available', () => {
        renderPopup({
            action: action('Implement', {
                command: null,
                phrases: [{ text: 'Run tests', title: 'Run tests' }],
                prompt: 'Implement this',
                type: 'agent',
            }),
        })

        expect(screen.queryByRole('group', { name: 'Predefined phrases' })).not.toBeInTheDocument()
    })

    it('fills and runs predefined phrases from the card action popup', async () => {
        const selectedAction = action('Implement', {
            command: null,
            phrases: [{ text: 'Run card tests', title: 'Card tests' }],
            prompt: 'Implement this',
            type: 'agent',
        })
        const continuedConversation = conversation('continued')
        const { runAction } = renderPopup({
            action: selectedAction,
            actions: [selectedAction],
            continueFrom: continuedConversation.path,
            loadConversation: vi.fn(async () => continuedConversation),
            loadConversations: vi.fn(async () => [continuedConversation]),
            onAddAction: vi.fn(),
            onSelectAction: vi.fn(),
        })

        fireEvent.click(screen.getByRole('button', { name: 'Card tests' }))
        expect(cardPromptTextbox()).toHaveValue('Run card tests')
        expect(runAction).not.toHaveBeenCalled()

        fireEvent.doubleClick(screen.getByRole('button', { name: 'Card tests' }))
        await waitFor(() => expect(runAction).toHaveBeenCalledWith(
            selectedAction,
            context,
            expect.objectContaining({ continueFrom: continuedConversation.path, prompt: 'Run card tests' }),
            expect.any(Function),
        ))
    })

    it('shows card action descriptions as selector tooltips and uses one close button', async () => {
        const selectedAction = action('Implement', { description: 'Implement the selected card', type: 'agent' })
        renderPopup({
            action: selectedAction,
            actions: [selectedAction],
            onAddAction: vi.fn(),
            onSelectAction: vi.fn(),
        })

        expect(screen.queryByText('Implement the selected card')).not.toBeInTheDocument()
        expect(await screen.findByLabelText('Prompt')).toBeEnabled()
        expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1)

        fireEvent.mouseOver(screen.getByRole('button', { name: 'Implement' }))
        expect(await screen.findByText('Implement the selected card')).toBeInTheDocument()
    })

    it('disables execution controls with an explanation in web mode', () => {
        render(
            <ActionPopup
                action={action('Build')}
                anchorElement={document.body}
                context={context}
                onClose={vi.fn()}
                onNavigate={vi.fn()}
            />,
        )

        expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Schedule' })).toBeDisabled()
        expect(screen.getByText('Action execution requires the Electron desktop app')).toBeInTheDocument()
    })

    it('disables an unavailable selected agent and shows its executable error', () => {
        window.md2Actions = { onActionExecution: () => vi.fn() } as unknown as typeof window.md2Actions
        vi.spyOn(agentCapabilitiesService, 'getSnapshot').mockReturnValue({
            availability: { error: null, loading: false, values: { codex: { available: false, error: 'codex not found' } } },
            models: { error: null, loading: false, values: [] },
            thinkingLevels: { error: null, loading: false, values: [] },
        })
        render(
            <ActionPopup
                action={action('Agent', { agent: 'codex', command: null, model: 'gpt-5.5', prompt: 'Run', type: 'agent' })}
                anchorElement={document.body}
                context={context}
                onClose={vi.fn()}
                onNavigate={vi.fn()}
            />,
        )

        expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
        expect(screen.getByText('codex not found')).toBeInTheDocument()
    })

    it('reattaches after reopen and renders live output from shared execution state', () => {
        let listener: ((event: ActionExecutionEvent) => void) | null = null
        window.md2Actions = {
            onActionExecution: (nextListener: (event: ActionExecutionEvent) => void) => {
                listener = nextListener

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        renderPopup()
        if (!listener) throw new Error('Missing action execution listener')
        const emit = listener as (event: ActionExecutionEvent) => void
        act(() => emit({actionId: 'action-implement', context, executionId: 'execution-1', phase: 'main', rootActionId: 'action-implement', status: 'running', type: 'execution'}))
        act(() => emit({
            actionId: 'action-implement', context, executionId: 'execution-1', phase: 'main', rootActionId: 'action-implement',
            status: 'running', stdout: 'live output', type: 'action',
        }))

        expect(screen.getByText(/live output/u)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
        cleanup()
        renderPopup()

        expect(screen.getByText(/live output/u)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('disables conversation input while running and starts a selected-provider follow-up turn', async () => {
        let listener: ((event: ActionExecutionEvent) => void) | null = null
        window.md2Actions = {
            onActionExecution: (nextListener: (event: ActionExecutionEvent) => void) => {
                listener = nextListener

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        configService.init({
            desktopConfig: {
                agent: 'codex',
                agentProfiles: [
                    { command: ['codex'], models: ['gpt-5'], name: 'codex' },
                    { command: ['claude'], models: ['sonnet'], name: 'claude' },
                ],
                model: 'gpt-5',
            },
        })
        const selectedAction = action('Implement', { agent: 'codex', model: 'gpt-5', type: 'agent' })
        const { runAction } = renderPopup({ action: selectedAction })
        if (!listener) throw new Error('Missing action execution listener')
        const emit = listener as (event: ActionExecutionEvent) => void

        act(() => emit({
            actionId: selectedAction.id, context, executionId: 'execution-1', phase: 'main',
            rootActionId: selectedAction.id, status: 'running', type: 'execution',
        }))
        act(() => emit({
            actionId: selectedAction.id, context, executionId: 'execution-1', phase: 'main',
            rootActionId: selectedAction.id, status: 'running', type: 'action',
        }))
        expect(screen.getByLabelText('Prompt')).toBeDisabled()
        expect(screen.getByRole('combobox', { name: 'Agent' })).toHaveAttribute('aria-disabled', 'true')

        act(() => emit({
            actionId: selectedAction.id,
            context,
            conversation: {
                cardPath: context.file ?? null,
                completedAt: '2026-01-01T00:01:00.000Z',
                events: [],
                hasExplicitTitle: true,
                id: 'conversation-1',
                messages: [],
                path: '.md2-agent-logs/conversation.json',
                providerSessions: [],
                startedAt: '2026-01-01T00:00:00.000Z',
                status: 'completed',
                title: 'Implement',
            },
            executionId: 'execution-1',
            phase: 'main',
            reference: '.md2-agent-logs/conversation.json',
            rootActionId: selectedAction.id,
            status: 'completed',
            type: 'action',
        }))
        act(() => emit({
            actionId: selectedAction.id, context, executionId: 'execution-1', phase: 'main',
            rootActionId: selectedAction.id, status: 'completed', type: 'execution',
        }))

        expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'follow up' } })
        selectAgent('claude')
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(selectedAction, context, {
            agent: 'claude',
            continueFrom: '.md2-agent-logs/conversation.json',
            prompt: 'follow up',
            model: 'sonnet',
            thinkingLevel: 'none',
        }, expect.any(Function)))
    })

    it('opens a persisted conversation directly with prompt and continuation reference', async () => {
        const selectedAction = action('Implement', { agent: 'codex', model: 'gpt-5.5', type: 'agent' })
        const { runAction } = renderPopup({
            action: selectedAction,
            continueFrom: '.md2-agent-logs/persisted.json',
            initialPrompt: 'follow persisted turn',
        })

        expect(screen.getByLabelText('Prompt')).toHaveValue('follow persisted turn')
        selectAgent('claude')
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(selectedAction, context, {
            agent: 'claude',
            continueFrom: '.md2-agent-logs/persisted.json',
            prompt: 'follow persisted turn',
            model: 'default',
            thinkingLevel: 'none',
        }, expect.any(Function)))
    })

    it('registers a schedule for the selected date and time', async () => {
        const { runAction, scheduleAction } = renderPopup()
        const timestampInput = '2099-07-07T10:30'

        fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
        fireEvent.change(screen.getByLabelText(/Date and time/u), { target: { value: timestampInput } })
        fireEvent.click(screen.getByRole('button', { name: 'Schedule action' }))

        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Schedule registered'))
        expect(scheduleAction).toHaveBeenCalledWith(
            expect.objectContaining({ label: 'Implement' }),
            context,
            { timestamp: new Date(timestampInput).toISOString(), type: 'at' },
        )
        expect(runAction).not.toHaveBeenCalled()
    })

    it('shows schedule registration errors', async () => {
        const scheduleAction = vi.fn(async () => {
            throw new Error('Desktop scheduler unavailable')
        })
        renderPopup({ scheduleAction })

        fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
        fireEvent.change(screen.getByLabelText(/Date and time/u), { target: { value: '2099-07-07T10:30' } })
        fireEvent.click(screen.getByRole('button', { name: 'Schedule action' }))

        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Desktop scheduler unavailable'))
    })

    it('reports running and completed states when Run is pressed', async () => {
        const { runAction } = renderPopup()

        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        expect(screen.getByRole('status')).toHaveTextContent('running')
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('completed'))
        expect(screen.getByRole('status')).toHaveTextContent('main: Implement completed')
        expect(runAction).toHaveBeenCalledWith(expect.objectContaining({ label: 'Implement' }), context, { extraPrompt: '' }, expect.any(Function))
    })

    it('shows failed agent run details from the run log', async () => {
        const failedResult: ActionRunResult = {
            logs: [{
                actionName: 'Implement',
                command: 'missing-agent',
                message: 'Implement failed with exit code 1: spawn missing-agent ENOENT',
                phase: 'main',
                status: 'failed',
                stderr: 'spawn missing-agent ENOENT',
                stdout: '',
                thinkingLevel: 'high',
            }],
            status: 'failed',
        }
        const runAction = vi.fn(async () => failedResult)
        renderPopup({ action: action('Implement', { type: 'agent' }), runAction })

        await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled())
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('failed'))
        expect(screen.getByRole('status')).toHaveTextContent('main: Implement failed with exit code 1: spawn missing-agent ENOENT')
        expect(screen.getByRole('status')).toHaveTextContent('thinking: high')
    })

    it('passes prepared prompt input when running an agent action', async () => {
        const { runAction } = renderPopup({ action: action('Implement', { type: 'agent' }) })

        fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'focus tests' } })
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        const expectedInput = { prompt: 'focus tests', thinkingLevel: 'none' }
        await waitFor(() => expect(runAction).toHaveBeenCalledWith(expect.objectContaining({ label: 'Implement' }), context, expectedInput, expect.any(Function)))
    })

    it('runs the card popup with Control+Enter from the prompt', async () => {
        const selectedAction = action('Implement', { type: 'agent' })
        const { runAction } = renderPopup({
            action: selectedAction,
            actions: [selectedAction],
            onAddAction: vi.fn(),
            onSelectAction: vi.fn(),
        })

        const promptTextbox = cardPromptTextbox()
        fireEvent.change(promptTextbox, { target: { value: 'focus tests' } })
        fireEvent.keyDown(promptTextbox, { ctrlKey: true, key: 'Enter' })

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(selectedAction, context, { prompt: 'focus tests', thinkingLevel: 'none' }, expect.any(Function)))
    })

    it('passes selected agent and model when running an agent action', async () => {
        configService.init({
            desktopConfig: {
                agent: 'codex',
                agentProfiles: [{ command: ['codex'], modelArgument: '--model', models: ['gpt-5', 'gpt-5-mini'], name: 'codex' }],
                model: 'gpt-5',
            },
        })
        const { runAction } = renderPopup({ action: action('Implement', { model: 'gpt-5-mini', type: 'agent' }) })

        fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'focus tests' } })
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        const expectedInput = { agent: 'codex', model: 'gpt-5-mini', prompt: 'focus tests', thinkingLevel: 'none' }
        await waitFor(() => expect(runAction).toHaveBeenCalledWith(expect.objectContaining({ label: 'Implement' }), context, expectedInput, expect.any(Function)))
    })

    it('preselects definition thinking level without changing definition for a run override', async () => {
        const selectedAction = action('Implement', { thinkingLevel: 'high', type: 'agent' })
        const { runAction } = renderPopup({ action: selectedAction })

        expect(screen.getByRole('combobox', { name: 'Thinking level' })).toBeEnabled()
        expect(screen.getByRole('combobox', { name: 'Thinking level' })).toHaveTextContent('high')
        selectThinkingLevel('low')
        await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled())
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(
            selectedAction,
            context,
            { prompt: '', thinkingLevel: 'low' },
            expect.any(Function),
        ))
        expect(selectedAction.thinkingLevel).toBe('high')
    })

    it('preselects the configured default thinking level when the action does not override it', () => {
        configService.init({ desktopConfig: { thinkingLevel: 'high' } })

        renderPopup({ action: action('Implement', { type: 'agent' }) })

        expect(screen.getByRole('combobox', { name: 'Thinking level' })).toHaveTextContent('high')
    })

    it('resets thinking level when agent changes', async () => {
        configService.init({
            desktopConfig: {
                agent: 'codex',
                agentProfiles: [
                    { command: ['codex'], models: ['gpt-5'], name: 'codex' },
                    { command: ['claude'], models: ['sonnet'], name: 'claude' },
                ],
                model: 'gpt-5',
            },
        })
        const { runAction } = renderPopup({ action: action('Implement', { agent: 'codex', model: 'gpt-5', thinkingLevel: 'high', type: 'agent' }) })

        selectAgent('claude')
        await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled())
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(
            expect.objectContaining({ label: 'Implement' }),
            context,
            { agent: 'claude', model: 'sonnet', prompt: '', thinkingLevel: 'none' },
            expect.any(Function),
        ))
    })

    it('keeps agent fields out of command run input', async () => {
        configService.init({
            desktopConfig: {
                agent: 'codex',
                agentProfiles: [{ command: ['codex'], models: ['gpt-5'], name: 'codex' }],
                model: 'gpt-5',
            },
        })
        const { runAction } = renderPopup()

        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(
            expect.objectContaining({ label: 'Implement' }),
            context,
            { extraPrompt: '' },
            expect.any(Function),
        ))
    })

    it('shows thinking adapter errors returned before execution', async () => {
        const runAction = vi.fn(async () => {
            throw new Error('Agent profile claude does not support thinking levels')
        })
        renderPopup({ action: action('Implement', { type: 'agent' }), runAction })

        await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled())
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Agent profile claude does not support thinking levels'))
    })

    it('shows previous run history for an agent action', async () => {
        renderPopup({
            action: action('Implement', { type: 'agent' }),
            loadHistory: vi.fn(async () => [{
                agent: 'codex',
                completedAt: '2026-07-05T10:00:00.000Z',
                model: 'gpt-5',
                output: 'done',
                prompt: 'run',
                status: 'completed' as const,
            }]),
        })

        await waitFor(() => expect(screen.getByText('completed (codex / gpt-5): done')).toBeInTheDocument())
        expect(screen.getByText('Run history')).toBeInTheDocument()
    })

    it('shows and hides a diff view for a commit history entry', async () => {
        const commitEntry = {
            command: 'git commit',
            commits: [{
                actionId: 'action-commit',
                actionName: 'Commit',
                branch: 'main',
                commit: 'abc1234def5678901234567890123456789012ab',
                committedAt: '2026-07-05T10:00:00.000Z',
                deletions: 2,
                filePaths: ['design/F-010.md'],
                filesChanged: 1,
                insertions: 4,
                repositoryRoot: 'C:/repo',
            }],
            completedAt: '2026-07-05T10:00:00.000Z',
            output: 'committed',
            prompt: '',
            status: 'completed' as const,
        }
        renderPopup({ action: action('Commit'), loadHistory: vi.fn(async () => [commitEntry]) })

        const toggle = await screen.findByRole('button', { name: 'Show diff' })
        fireEvent.click(toggle)
        expect(screen.getByRole('button', { name: 'Hide diff' })).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Hide diff' }))
        expect(screen.getByRole('button', { name: 'Show diff' })).toBeInTheDocument()
    })

    it('does not offer a diff view for a history entry without commit metadata', async () => {
        renderPopup({
            action: action('Implement'),
            loadHistory: vi.fn(async () => [{ completedAt: '2026-07-05T10:00:00.000Z', output: 'done', prompt: 'run', status: 'completed' as const }]),
        })

        await waitFor(() => expect(screen.getByText('completed: done')).toBeInTheDocument())
        expect(screen.queryByRole('button', { name: 'Show diff' })).not.toBeInTheDocument()
    })

    it('converts extra prompt input to an action file', async () => {
        const convertPromptToAction = vi.fn(async () => ({ path: 'actions/custom-review.json' }))
        renderPopup({ action: action('Custom prompt', { command: null, prompt: '{{card-prompt}}', type: 'agent' }), convertPromptToAction })

        fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'review this file' } })
        fireEvent.change(screen.getByLabelText('Action label'), { target: { value: 'Custom review' } })
        fireEvent.click(screen.getByRole('button', { name: 'Convert to action' }))

        await waitFor(() => expect(screen.getByText('Saved actions/custom-review.json')).toBeInTheDocument())
        expect(convertPromptToAction).toHaveBeenCalledWith({ context, label: 'Custom review', prompt: 'review this file' })
    })

    it('saves and runs a named custom action', async () => {
        const convertPromptToAction = vi.fn(async () => ({ path: 'actions/custom-review.json' }))
        const { runAction } = renderPopup({
            action: action('Custom prompt', { command: null, prompt: '{{card-prompt}}', type: 'agent' }),
            convertPromptToAction,
            showSaveControls: true,
        })

        fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'review this file' } })
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Custom review' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save and run' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(
            expect.objectContaining({ label: 'Custom prompt' }),
            context,
            { prompt: 'review this file', thinkingLevel: 'none' },
            expect.any(Function),
        ))
        expect(convertPromptToAction).toHaveBeenCalledWith({ context, label: 'Custom review', prompt: 'review this file' })
    })

    it('saves selected agent settings when Run creates a card popup preset', async () => {
        configService.init({
            desktopConfig: {
                agent: 'codex',
                agentProfiles: [{ command: ['codex'], modelArgument: '--model', models: ['gpt-5'], name: 'codex' }],
                model: 'gpt-5',
            },
        })
        const customPrompt = action('Custom prompt', { command: null, id: CUSTOM_PROMPT_ACTION_ID, prompt: '{{card-prompt}}', type: 'agent' })
        const convertPromptToAction = vi.fn(async () => ({ path: 'actions/custom-review.json' }))
        const { runAction } = renderPopup({
            action: customPrompt,
            actions: [customPrompt],
            convertPromptToAction,
            onAddAction: vi.fn(),
            onSelectAction: vi.fn(),
            showSaveControls: true,
        })

        fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'Custom review' } })
        fireEvent.change(cardPromptTextbox(), { target: { value: 'Review this card' } })
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(
            customPrompt,
            context,
            { agent: 'codex', model: 'gpt-5', prompt: 'Review this card', thinkingLevel: 'none' },
            expect.any(Function),
        ))
        expect(convertPromptToAction).toHaveBeenCalledWith({
            agent: 'codex',
            context,
            label: 'Custom review',
            model: 'gpt-5',
            prompt: 'Review this card',
        })
    })

    it('shows loaded action-card token and line totals in the card agent popup', async () => {
        const agentAction = action('Implement', { type: 'agent' })
        const matchingConversation = conversation('matching', {usage: { cachedInputTokens: 2, inputTokens: 10, outputTokens: 3, reasoningTokens: 1, totalTokens: 16 }})
        const otherConversation = conversation('other', {
            actionId: 'action-review',
            usage: { cachedInputTokens: 0, inputTokens: 100, outputTokens: 0, reasoningTokens: 0, totalTokens: 100 },
        })
        renderPopup({
            action: agentAction,
            actions: [agentAction],
            loadConversations: vi.fn(async () => [matchingConversation, otherConversation]),
            loadHistory: vi.fn(async () => [{
                commits: [{
                    actionId: 'action-linked', actionName: 'Linked', branch: 'main',
                    commit: 'abc1234def5678901234567890123456789012ab', committedAt: 'now', deletions: 3,
                    filePaths: ['design/F-010.md'], filesChanged: 1, insertions: 5, repositoryRoot: 'C:/repo',
                }],
                completedAt: 'now', output: '', prompt: '', status: 'failed' as const,
            }]),
            onAddAction: vi.fn(),
            onSelectAction: vi.fn(),
        })

        expect(await screen.findByText('tokens: 16')).toBeInTheDocument()
        expect(screen.getByText('lines: 8')).toBeInTheDocument()
    })

    it('omits combined usage summary for project-context actions', async () => {
        renderPopup({ action: action('Implement', { type: 'agent' }), context: { kind: 'project' } })

        await screen.findByLabelText('Prompt')
        expect(screen.queryByText(/tokens:/u)).not.toBeInTheDocument()
        expect(screen.queryByText(/lines:/u)).not.toBeInTheDocument()
    })

    it('shows the custom prompt as required and keeps unlabeled agent controls accessible', async () => {
        configService.init({
            desktopConfig: {
                agent: 'codex',
                agentProfiles: [{ command: ['codex'], modelArgument: '--model', models: ['gpt-5'], name: 'codex' }],
                model: 'gpt-5',
            },
        })
        const customPrompt = action('Custom prompt', { command: null, id: CUSTOM_PROMPT_ACTION_ID, prompt: '{{card-prompt}}', type: 'agent' })
        renderPopup({
            action: customPrompt,
            actions: [customPrompt],
            onAddAction: vi.fn(),
            onSelectAction: vi.fn(),
        })

        expect(screen.queryByText('Prompt')).not.toBeInTheDocument()
        expect(screen.queryByText('required')).not.toBeInTheDocument()
        expect(screen.queryByText('optional')).not.toBeInTheDocument()
        await screen.findByLabelText('Prompt')
        expect(screen.queryByText('Agent')).not.toBeInTheDocument()
        expect(screen.queryByText('Model')).not.toBeInTheDocument()
        expect(screen.queryByText('Thinking')).not.toBeInTheDocument()
        expect(screen.getByRole('combobox', { name: 'Agent' })).toBeInTheDocument()
        expect(screen.getByRole('combobox', { name: 'Model' })).toBeInTheDocument()
        expect(screen.getByRole('combobox', { name: 'Thinking level' })).toBeInTheDocument()
    })

    it('does not run a named custom action when saving fails', async () => {
        const convertPromptToAction = vi.fn(async () => {
            throw new Error('Could not save action')
        })
        const { runAction } = renderPopup({
            action: action('Custom prompt', { command: null, prompt: '{{card-prompt}}', type: 'agent' }),
            convertPromptToAction,
            showSaveControls: true,
        })

        fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'review this file' } })
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Custom review' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save and run' }))

        await waitFor(() => expect(screen.getByText('Could not save action')).toBeInTheDocument())
        expect(runAction).not.toHaveBeenCalled()
    })

    it('shows before and after shortcuts and navigates to them with the same context', () => {
        const before = action('Create branch')
        const after = action('Run tests')
        const { onNavigate } = renderPopup({ action: action('Implement', { onAfter: [after], onBefore: [before] }) })

        fireEvent.click(screen.getByRole('button', { name: 'Create branch' }))
        expect(onNavigate).toHaveBeenCalledWith(before)

        fireEvent.click(screen.getByRole('button', { name: 'Run tests' }))
        expect(onNavigate).toHaveBeenCalledWith(after)
    })

    it('resizes the popup from every side', () => {
        renderPopup()
        const handle = screen.getByRole('separator', { name: 'Resize action popup from top-left' })
        const paper = screen.getByRole('dialog')

        expect(screen.getAllByRole('separator', { name: /Resize action popup from/u })).toHaveLength(8)
        fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 50, clientY: 40, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })

        expect(paper.style.width).toBe('470px')
        expect(paper.style.height).toBe('380px')
    })

    it('stores card Run and project-agent popup sizes separately', () => {
        window.localStorage.removeItem(CARD_RUN_POPUP_SIZE_STORAGE_KEY)
        window.localStorage.removeItem(PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY)
        const selectedAction = action('Implement', { type: 'agent' })
        const popupProps = {
            action: selectedAction,
            actions: [selectedAction],
            onAddAction: vi.fn(),
            onSelectAction: vi.fn(),
        }
        renderPopup(popupProps)
        const cardHandle = screen.getByRole('separator', { name: 'Resize action popup from bottom-right' })

        fireEvent.pointerDown(cardHandle, { clientX: 0, clientY: 0, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 100, clientY: 60, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })

        expect(JSON.parse(window.localStorage.getItem(CARD_RUN_POPUP_SIZE_STORAGE_KEY) ?? '{}')).toEqual({ height: 510, width: 500 })
        expect(window.localStorage.getItem(PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY)).toBeNull()

        cleanup()
        renderPopup({ ...popupProps, context: { kind: 'project' } })
        const projectDialog = screen.getByRole('dialog', { name: 'Run actions' })

        expect(projectDialog.style.height).toBe('450px')
        expect(projectDialog.style.width).toBe('400px')
        expect(JSON.parse(window.localStorage.getItem(PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY) ?? '{}')).toEqual({ height: 450, width: 400 })
    })

    it('orders agent controls, chat, resize splitter, and prompt without inline run history', async () => {
        const selectedAction = action('Implement', { type: 'agent' })
        renderPopup({
            action: selectedAction,
            actions: [selectedAction],
            loadConversations: vi.fn(async () => []),
            onAddAction: vi.fn(),
            onSelectAction: vi.fn(),
        })

        const agentControl = screen.getByRole('combobox', { name: 'Agent' })
        const picker = screen.getByRole('combobox', { name: 'Conversation history' })
        const chat = screen.getByLabelText('Conversation chat')
        const splitter = screen.getByRole('separator', { name: 'Resize prompt' })
        const prompt = screen.getByLabelText('Prompt')

        expect(agentControl.compareDocumentPosition(picker)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
        expect(picker.compareDocumentPosition(chat)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
        expect(chat.compareDocumentPosition(splitter)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
        expect(splitter.compareDocumentPosition(prompt)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
        expect(chat.parentElement?.nextElementSibling).toBe(splitter)
        expect(screen.queryByText('Run history')).not.toBeInTheDocument()
        expect(screen.queryByText('No previous runs')).not.toBeInTheDocument()
    })

    it('persists the prompt height after dragging the resize splitter', async () => {
        window.localStorage.removeItem('md2.actionPromptHeight')
        const selectedAction = action('Implement', { type: 'agent' })
        renderPopup({
            action: selectedAction,
            actions: [selectedAction],
            loadConversations: vi.fn(async () => []),
            onAddAction: vi.fn(),
            onSelectAction: vi.fn(),
        })

        const splitter = await screen.findByRole('separator', { name: 'Resize prompt' })
        fireEvent.pointerDown(splitter, { clientY: 300, pointerId: 1 })
        fireEvent.pointerMove(splitter, { clientY: 240, pointerId: 1 })
        fireEvent.pointerUp(splitter, { pointerId: 1 })

        expect(window.localStorage.getItem('md2.actionPromptHeight')).not.toBeNull()
    })

    it('shows only conversations created by the selected action', async () => {
        const selectedAction = action('Implement', { type: 'agent' })
        const matching = conversation('matching', { title: 'Implement chat' })
        const otherAction = conversation('other-action', { actionId: 'action-review', title: 'Review chat' })
        renderPopup({
            action: selectedAction,
            actions: [selectedAction],
            loadConversations: vi.fn(async () => [matching, otherAction]),
            onAddAction: vi.fn(),
            onSelectAction: vi.fn(),
        })

        const picker = await screen.findByRole('combobox', { name: 'Conversation history' })
        await waitFor(() => expect(picker).toBeEnabled())
        fireEvent.mouseDown(picker)

        expect(screen.getByRole('option', { name: /Implement chat/u })).toBeInTheDocument()
        expect(screen.queryByRole('option', { name: /Review chat/u })).not.toBeInTheDocument()
    })

    it('loads selected conversation and continues its exact reference', async () => {
        const selectedAction = action('Implement', { type: 'agent' })
        const onConversationViewed = vi.fn()
        const persisted = conversation('selected', {
            messages: [
                { content: 'Question', id: 'm1', role: 'user', timestamp: '2026-07-15T10:00:00.000Z' },
                { agent: 'codex', content: 'Answer', id: 'm2', role: 'assistant', timestamp: '2026-07-15T10:01:00.000Z' },
            ],
            title: 'Selected chat',
        })
        const { runAction } = renderPopup({
            action: selectedAction,
            actions: [selectedAction],
            loadConversation: vi.fn(async () => persisted),
            loadConversations: vi.fn(async () => [persisted]),
            onAddAction: vi.fn(),
            onConversationViewed,
            onSelectAction: vi.fn(),
        })

        const picker = await screen.findByRole('combobox', { name: 'Conversation history' })
        await waitFor(() => expect(picker).toBeEnabled())
        expect(onConversationViewed).not.toHaveBeenCalled()
        fireEvent.mouseDown(picker)
        fireEvent.click(screen.getByRole('option', { name: /Selected chat/u }))

        expect(await screen.findByText('Question')).toBeInTheDocument()
        expect(screen.getByText('Answer')).toBeInTheDocument()
        expect(onConversationViewed).toHaveBeenCalledWith(persisted)
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(
            selectedAction,
            context,
            expect.objectContaining({ continueFrom: persisted.path }),
            expect.any(Function),
        ))
    })

    it('keeps selected conversation visible when parent recreates the same context', async () => {
        const selectedAction = action('Implement', { type: 'agent' })
        const persisted = conversation('selected', {
            messages: [{ agent: 'codex', content: 'Answer remains visible', id: 'm1', role: 'assistant', timestamp: '2026-07-15T10:01:00.000Z' }],
            title: 'Selected chat',
        })
        const loadConversation = vi.fn(async () => persisted)
        const loadConversations = vi.fn(async () => [persisted])
        const popupProps = {
            action: selectedAction,
            actions: [selectedAction],
            anchorElement: document.body,
            loadConversation,
            loadConversations,
            loadHistory: vi.fn(async () => []),
            onAddAction: vi.fn(),
            onClose: vi.fn(),
            onConversationViewed: vi.fn(),
            onNavigate: vi.fn(),
            onSelectAction: vi.fn(),
            runAction: vi.fn(async () => completedResult),
        }
        const { rerender } = render(
            <AppThemeProvider><ActionPopup {...popupProps} context={{ ...context }} /></AppThemeProvider>,
        )
        const picker = await screen.findByRole('combobox', { name: 'Conversation history' })
        await waitFor(() => expect(picker).toBeEnabled())
        fireEvent.mouseDown(picker)
        fireEvent.click(screen.getByRole('option', { name: /Selected chat/u }))
        await screen.findByText('Answer remains visible')

        await act(async () => {
            rerender(<AppThemeProvider><ActionPopup {...popupProps} context={{ ...context }} /></AppThemeProvider>)
            await Promise.resolve()
        })

        expect(screen.getByText('Answer remains visible')).toBeInTheDocument()
        expect(loadConversations).toHaveBeenCalledTimes(1)
    })

    it('ignores late selection responses', async () => {
        const selectedAction = action('Implement', { type: 'agent' })
        const first = conversation('first', { title: 'First' })
        const second = conversation('second', { title: 'Second' })
        const firstRequest = deferred<AgentConversation>()
        const secondRequest = deferred<AgentConversation>()
        const loadConversation = vi.fn((path: string) => path === first.path ? firstRequest.promise : secondRequest.promise)
        renderPopup({
            action: selectedAction,
            actions: [selectedAction],
            loadConversation,
            loadConversations: vi.fn(async () => [first, second]),
            onAddAction: vi.fn(),
            onSelectAction: vi.fn(),
        })

        const picker = await screen.findByRole('combobox', { name: 'Conversation history' })
        await waitFor(() => expect(picker).toBeEnabled())
        fireEvent.mouseDown(picker)
        fireEvent.click(screen.getByRole('option', { name: /First/u }))
        fireEvent.mouseDown(picker)
        fireEvent.click(screen.getByRole('option', { name: /Second/u }))
        secondRequest.resolve(conversation('second', { messages: [{ content: 'Second answer', id: 'm2', role: 'assistant', timestamp: 'now' }], title: 'Second' }))
        await screen.findByText('Second answer')
        firstRequest.resolve(conversation('first', { messages: [{ content: 'Late first answer', id: 'm1', role: 'assistant', timestamp: 'now' }], title: 'First' }))

        await waitFor(() => expect(screen.queryByText('Late first answer')).not.toBeInTheDocument())
        expect(screen.getByText('Second answer')).toBeInTheDocument()
    })

    it('reports selection errors and keeps previous conversation visible', async () => {
        const selectedAction = action('Implement', { type: 'agent' })
        const good = conversation('good', { messages: [{ content: 'Keep me', id: 'm1', role: 'assistant', timestamp: 'now' }], title: 'Good' })
        const bad = conversation('bad', { title: 'Bad' })
        const reportError = vi.spyOn(dialogService, 'error')
        renderPopup({
            action: selectedAction,
            actions: [selectedAction],
            loadConversation: vi.fn(async (path) => {
                if (path === bad.path) throw new Error('Broken log')
                return good
            }),
            loadConversations: vi.fn(async () => [good, bad]),
            onAddAction: vi.fn(),
            onSelectAction: vi.fn(),
        })

        const picker = await screen.findByRole('combobox', { name: 'Conversation history' })
        await waitFor(() => expect(picker).toBeEnabled())
        fireEvent.mouseDown(picker)
        fireEvent.click(screen.getByRole('option', { name: /Good/u }))
        await screen.findByText('Keep me')
        fireEvent.mouseDown(picker)
        fireEvent.click(screen.getByRole('option', { name: /Bad/u }))

        await waitFor(() => expect(reportError).toHaveBeenCalledWith(expect.any(Error), expect.any(Object)))
        expect(screen.getByText('Keep me')).toBeInTheDocument()
        reportError.mockRestore()
    })

    it('refreshes conversation history after an agent run persists', async () => {
        const selectedAction = action('Implement', { type: 'agent' })
        const loadConversations = vi.fn(async () => [conversation('persisted')])
        renderPopup({
            action: selectedAction,
            actions: [selectedAction],
            loadConversations,
            onAddAction: vi.fn(),
            onSelectAction: vi.fn(),
        })

        await waitFor(() => expect(loadConversations).toHaveBeenCalledOnce())
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        await waitFor(() => expect(loadConversations).toHaveBeenCalledTimes(2))
    })

    it('expands before Close and restores anchored size after collapse', () => {
        window.localStorage.removeItem(CARD_RUN_POPUP_SIZE_STORAGE_KEY)
        const selectedAction = action('Implement', { type: 'agent' })
        renderPopup({
            action: selectedAction,
            actions: [selectedAction],
            loadConversations: vi.fn(async () => []),
            onAddAction: vi.fn(),
            onSelectAction: vi.fn(),
        })
        const dialog = screen.getByRole('dialog', { name: 'Run actions' })
        const expand = screen.getByRole('button', { name: 'Expand upward' })
        const close = screen.getByRole('button', { name: 'Close' })

        expect(expand.compareDocumentPosition(close)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
        fireEvent.click(expand)

        expect(dialog).toHaveAttribute('data-full-height', 'true')
        expect(dialog.style.height).toBe('100vh')
        expect(screen.getByRole('button', { name: 'Collapse downward' })).toBeInTheDocument()
        expect(screen.queryAllByRole('separator', { name: /Resize action popup/u })).toHaveLength(0)
        fireEvent.click(screen.getByRole('button', { name: 'Collapse downward' }))

        expect(dialog.style.height).toBe('450px')
        expect(dialog.style.width).toBe('400px')
        expect(screen.getAllByRole('separator', { name: /Resize action popup/u })).toHaveLength(8)
    })
})
