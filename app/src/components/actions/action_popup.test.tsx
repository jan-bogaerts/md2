import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionPopup, CARD_RUN_POPUP_SIZE_STORAGE_KEY, PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY } from './action_popup'
import { CUSTOM_PROMPT_ACTION_ID, type ActionDefinition } from '../../data/action_types'
import type { ActionContext } from '../../data/action_context'
import type { ActionRunResult } from '../../data/action_run_types'
import { configService } from '../../services/config_service'
import { actionExecutionService } from '../../services/action_execution_service'
import { agentCapabilitiesService } from '../../services/agent_capabilities_service'
import type { ActionExecutionEvent } from '../../data/action_run_types'
import type { AgentConversation } from '../../data/data_types'
import { dialogService } from '../../services/dialog_service'

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

function renderPopup(overrides: Partial<Parameters<typeof ActionPopup>[0]> = {}) {
    const onNavigate = vi.fn()
    const onClose = vi.fn()
    const loadHistory = vi.fn(async () => [])
    const runAction = vi.fn(async () => completedResult)
    const scheduleAction = vi.fn(async () => {})
    render(
        <ActionPopup
            action={action('Implement')}
            anchorElement={document.body}
            context={context}
            loadHistory={loadHistory}
            onClose={onClose}
            onNavigate={onNavigate}
            runAction={runAction}
            scheduleAction={scheduleAction}
            {...overrides}
        />,
    )

    return { loadHistory, onClose, onNavigate, runAction, scheduleAction }
}

describe('ActionPopup', () => {
    afterEach(cleanup)
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
        expect(screen.getByLabelText('Extra prompt')).toHaveValue('**Run tests**')
        expect(runAction).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Show the current diff' })).toBeInTheDocument()

        fireEvent.doubleClick(screen.getByRole('button', { name: 'Run tests' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(
            selectedAction,
            context,
            {
                continueFrom: '.md2-agent-logs/conversation.json',
                extraPrompt: '**Run tests**',
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
        expect(screen.getByLabelText('Extra prompt')).toHaveValue('Run card tests')
        expect(runAction).not.toHaveBeenCalled()

        fireEvent.doubleClick(screen.getByRole('button', { name: 'Card tests' }))
        await waitFor(() => expect(runAction).toHaveBeenCalledWith(
            selectedAction,
            context,
            expect.objectContaining({ continueFrom: continuedConversation.path, extraPrompt: 'Run card tests' }),
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
        expect(screen.getByPlaceholderText('Extra prompt optional')).toBeInTheDocument()
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
        expect(screen.getByLabelText('Extra prompt')).toBeDisabled()
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
        fireEvent.change(screen.getByLabelText('Extra prompt'), { target: { value: 'follow up' } })
        selectAgent('claude')
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(selectedAction, context, {
            agent: 'claude',
            continueFrom: '.md2-agent-logs/conversation.json',
            extraPrompt: 'follow up',
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

        expect(screen.getByLabelText('Extra prompt')).toHaveValue('follow persisted turn')
        selectAgent('claude')
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(selectedAction, context, {
            agent: 'claude',
            continueFrom: '.md2-agent-logs/persisted.json',
            extraPrompt: 'follow persisted turn',
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

        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('failed'))
        expect(screen.getByRole('status')).toHaveTextContent('main: Implement failed with exit code 1: spawn missing-agent ENOENT')
        expect(screen.getByRole('status')).toHaveTextContent('thinking: high')
    })

    it('passes extra prompt input when running an agent action', async () => {
        const { runAction } = renderPopup({ action: action('Implement', { type: 'agent' }) })

        fireEvent.change(screen.getByLabelText('Extra prompt'), { target: { value: 'focus tests' } })
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        const expectedInput = { extraPrompt: 'focus tests', thinkingLevel: 'none' }
        await waitFor(() => expect(runAction).toHaveBeenCalledWith(expect.objectContaining({ label: 'Implement' }), context, expectedInput, expect.any(Function)))
    })

    it('runs the card popup with Control+Enter from the extra prompt', async () => {
        const selectedAction = action('Implement', { type: 'agent' })
        const { runAction } = renderPopup({
            action: selectedAction,
            actions: [selectedAction],
            onAddAction: vi.fn(),
            onSelectAction: vi.fn(),
        })

        fireEvent.change(screen.getByLabelText('Extra prompt'), { target: { value: 'focus tests' } })
        fireEvent.keyDown(screen.getByLabelText('Extra prompt'), { ctrlKey: true, key: 'Enter' })

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(selectedAction, context, { extraPrompt: 'focus tests', thinkingLevel: 'none' }, expect.any(Function)))
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

        fireEvent.change(screen.getByLabelText('Extra prompt'), { target: { value: 'focus tests' } })
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        const expectedInput = { agent: 'codex', extraPrompt: 'focus tests', model: 'gpt-5-mini', thinkingLevel: 'none' }
        await waitFor(() => expect(runAction).toHaveBeenCalledWith(expect.objectContaining({ label: 'Implement' }), context, expectedInput, expect.any(Function)))
    })

    it('preselects definition thinking level without changing definition for a run override', async () => {
        const selectedAction = action('Implement', { thinkingLevel: 'high', type: 'agent' })
        const { runAction } = renderPopup({ action: selectedAction })

        expect(screen.getByRole('combobox', { name: 'Thinking level' })).toBeEnabled()
        expect(screen.getByRole('combobox', { name: 'Thinking level' })).toHaveTextContent('high')
        selectThinkingLevel('low')
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(
            selectedAction,
            context,
            { extraPrompt: '', thinkingLevel: 'low' },
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
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(
            expect.objectContaining({ label: 'Implement' }),
            context,
            { agent: 'claude', extraPrompt: '', model: 'sonnet', thinkingLevel: 'none' },
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
            commit: {
                actionId: 'action-commit',
                branch: 'main',
                commit: 'abc1234',
                completedAt: '2026-07-05T10:00:00.000Z',
                filePaths: ['design/F-010.md'],
                repositoryRoot: 'C:/repo',
            },
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

        fireEvent.change(screen.getByLabelText('Extra prompt'), { target: { value: 'review this file' } })
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

        fireEvent.change(screen.getByLabelText('Extra prompt'), { target: { value: 'review this file' } })
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Custom review' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save and run' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(
            expect.objectContaining({ label: 'Custom prompt' }),
            context,
            { extraPrompt: 'review this file', thinkingLevel: 'none' },
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
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(
            customPrompt,
            context,
            { agent: 'codex', extraPrompt: '', model: 'gpt-5', thinkingLevel: 'none' },
            expect.any(Function),
        ))
        expect(convertPromptToAction).toHaveBeenCalledWith({
            agent: 'codex',
            context,
            label: 'Custom review',
            model: 'gpt-5',
            prompt: '',
        })
    })

    it('shows the custom prompt as required and keeps unlabeled agent controls accessible', () => {
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
        expect(screen.getByPlaceholderText('Prompt required')).toBeInTheDocument()
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

        fireEvent.change(screen.getByLabelText('Extra prompt'), { target: { value: 'review this file' } })
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

    it('orders agent controls, chat, divider, and prompt without inline run history', async () => {
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
        const prompt = screen.getByLabelText('Extra prompt')

        expect(agentControl.compareDocumentPosition(picker)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
        expect(picker.compareDocumentPosition(chat)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
        expect(chat.compareDocumentPosition(prompt)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
        expect(chat.parentElement?.nextElementSibling?.tagName).toBe('HR')
        expect(screen.queryByText('Run history')).not.toBeInTheDocument()
        expect(screen.queryByText('No previous runs')).not.toBeInTheDocument()
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
        const { rerender } = render(<ActionPopup {...popupProps} context={{ ...context }} />)
        const picker = await screen.findByRole('combobox', { name: 'Conversation history' })
        await waitFor(() => expect(picker).toBeEnabled())
        fireEvent.mouseDown(picker)
        fireEvent.click(screen.getByRole('option', { name: /Selected chat/u }))
        await screen.findByText('Answer remains visible')

        await act(async () => {
            rerender(<ActionPopup {...popupProps} context={{ ...context }} />)
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
