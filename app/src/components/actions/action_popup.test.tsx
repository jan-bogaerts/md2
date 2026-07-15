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
        name,
        needsWorkTree: false,
        on: [],
        onAfter: [],
        onBefore: [],
        onState: null,
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

function selectScheduleTrigger(label: string) {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Schedule trigger' }))
    fireEvent.click(screen.getByRole('option', { name: label }))
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
                action={action('Agent', { agent: 'codex', command: null, model: 'GPT 5.5', prompt: 'Run', type: 'agent' })}
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
                agentSlotCommand: '',
                agentProfiles: [
                    { command: 'codex', models: ['gpt-5'], name: 'codex' },
                    { command: 'claude', models: ['sonnet'], name: 'claude' },
                ],
                model: 'gpt-5',
                projectLocationMode: 'folder',
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
        const selectedAction = action('Implement', { agent: 'codex', model: 'GPT 5.5', type: 'agent' })
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

    it('registers an at schedule from the picker', async () => {
        const { runAction, scheduleAction } = renderPopup()

        fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
        fireEvent.change(screen.getByLabelText('Schedule timestamp'), { target: { value: '2026-07-07T10:30' } })
        fireEvent.click(screen.getByRole('button', { name: 'Register schedule' }))

        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Schedule registered'))
        expect(scheduleAction).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Implement' }),
            context,
            { timestamp: '2026-07-07T10:30', type: 'at' },
        )
        expect(runAction).not.toHaveBeenCalled()
    })

    it('registers an agent slot schedule without extra input', async () => {
        const { scheduleAction } = renderPopup()

        fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
        selectScheduleTrigger('Agent slot')
        fireEvent.click(screen.getByRole('button', { name: 'Register schedule' }))

        await waitFor(() => expect(scheduleAction).toHaveBeenCalledWith(expect.objectContaining({ name: 'Implement' }), context, { type: 'agentSlot' }))
    })

    it('registers an after action schedule with the action name', async () => {
        const { scheduleAction } = renderPopup()

        fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
        selectScheduleTrigger('After action')
        fireEvent.change(screen.getByLabelText('After action name'), { target: { value: 'Run tests' } })
        fireEvent.click(screen.getByRole('button', { name: 'Register schedule' }))

        await waitFor(() => expect(scheduleAction).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Implement' }),
            context,
            { actionId: 'Run tests', type: 'afterAction' },
        ))
    })

    it('shows schedule registration errors', async () => {
        const scheduleAction = vi.fn(async () => {
            throw new Error('Desktop scheduler unavailable')
        })
        renderPopup({ scheduleAction })

        fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
        fireEvent.change(screen.getByLabelText('Schedule timestamp'), { target: { value: '2026-07-07T10:30' } })
        fireEvent.click(screen.getByRole('button', { name: 'Register schedule' }))

        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Desktop scheduler unavailable'))
    })

    it('reports running and completed states when Run is pressed', async () => {
        const { runAction } = renderPopup()

        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        expect(screen.getByRole('status')).toHaveTextContent('running')
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('completed'))
        expect(screen.getByRole('status')).toHaveTextContent('main: Implement completed')
        expect(runAction).toHaveBeenCalledWith(expect.objectContaining({ name: 'Implement' }), context, { extraPrompt: '' }, expect.any(Function))
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
        await waitFor(() => expect(runAction).toHaveBeenCalledWith(expect.objectContaining({ name: 'Implement' }), context, expectedInput, expect.any(Function)))
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
                agentSlotCommand: '',
                agentProfiles: [{ command: 'codex', modelArgument: '--model', models: ['gpt-5', 'gpt-5-mini'], name: 'codex' }],
                model: 'gpt-5',
                projectLocationMode: 'folder',
            },
        })
        const { runAction } = renderPopup({ action: action('Implement', { model: 'gpt-5-mini', type: 'agent' }) })

        fireEvent.change(screen.getByLabelText('Extra prompt'), { target: { value: 'focus tests' } })
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        const expectedInput = { agent: 'codex', extraPrompt: 'focus tests', model: 'gpt-5-mini', thinkingLevel: 'none' }
        await waitFor(() => expect(runAction).toHaveBeenCalledWith(expect.objectContaining({ name: 'Implement' }), context, expectedInput, expect.any(Function)))
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

    it('resets thinking level when agent changes', async () => {
        configService.init({
            desktopConfig: {
                agent: 'codex',
                agentSlotCommand: '',
                agentProfiles: [
                    { command: 'codex', models: ['gpt-5'], name: 'codex' },
                    { command: 'claude', models: ['sonnet'], name: 'claude' },
                ],
                model: 'gpt-5',
                projectLocationMode: 'folder',
            },
        })
        const { runAction } = renderPopup({ action: action('Implement', { agent: 'codex', model: 'gpt-5', thinkingLevel: 'high', type: 'agent' }) })

        selectAgent('claude')
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Implement' }),
            context,
            { agent: 'claude', extraPrompt: '', model: 'sonnet', thinkingLevel: 'none' },
            expect.any(Function),
        ))
    })

    it('keeps agent fields out of command run input', async () => {
        configService.init({
            desktopConfig: {
                agent: 'codex',
                agentSlotCommand: '',
                agentProfiles: [{ command: 'codex', models: ['gpt-5'], name: 'codex' }],
                model: 'gpt-5',
                projectLocationMode: 'folder',
            },
        })
        const { runAction } = renderPopup()

        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Implement' }),
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
        renderPopup({ action: action('Custom prompt', { command: null, prompt: '{{prompt}}', type: 'agent' }), convertPromptToAction })

        fireEvent.change(screen.getByLabelText('Extra prompt'), { target: { value: 'review this file' } })
        fireEvent.change(screen.getByLabelText('Action label'), { target: { value: 'Custom review' } })
        fireEvent.click(screen.getByRole('button', { name: 'Convert to action' }))

        await waitFor(() => expect(screen.getByText('Saved actions/custom-review.json')).toBeInTheDocument())
        expect(convertPromptToAction).toHaveBeenCalledWith({ context, label: 'Custom review', prompt: 'review this file' })
    })

    it('saves and runs a named custom action', async () => {
        const convertPromptToAction = vi.fn(async () => ({ path: 'actions/custom-review.json' }))
        const { runAction } = renderPopup({
            action: action('Custom prompt', { command: null, prompt: '{{prompt}}', type: 'agent' }),
            convertPromptToAction,
            showSaveControls: true,
        })

        fireEvent.change(screen.getByLabelText('Extra prompt'), { target: { value: 'review this file' } })
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Custom review' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save and run' }))

        await waitFor(() => expect(runAction).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Custom prompt' }),
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
                agentSlotCommand: '',
                agentProfiles: [{ command: 'codex', modelArgument: '--model', models: ['gpt-5'], name: 'codex' }],
                model: 'gpt-5',
                projectLocationMode: 'folder',
            },
        })
        const customPrompt = action('Custom prompt', { command: null, id: CUSTOM_PROMPT_ACTION_ID, prompt: '{{prompt}}', type: 'agent' })
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
                agentSlotCommand: '',
                agentProfiles: [{ command: 'codex', modelArgument: '--model', models: ['gpt-5'], name: 'codex' }],
                model: 'gpt-5',
                projectLocationMode: 'folder',
            },
        })
        const customPrompt = action('Custom prompt', { command: null, id: CUSTOM_PROMPT_ACTION_ID, prompt: '{{prompt}}', type: 'agent' })
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
        expect(screen.getByLabelText('Prompt').closest('.MuiFormControl-root')).toHaveStyle({ flex: '1' })
    })

    it('does not run a named custom action when saving fails', async () => {
        const convertPromptToAction = vi.fn(async () => {
            throw new Error('Could not save action')
        })
        const { runAction } = renderPopup({
            action: action('Custom prompt', { command: null, prompt: '{{prompt}}', type: 'agent' }),
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
})
