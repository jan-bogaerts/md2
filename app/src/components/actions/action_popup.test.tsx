import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionPopup } from './action_popup'
import type { ActionDefinition } from '../../data/action_types'
import type { ActionContext } from '../../data/action_context'
import type { ActionRunResult } from '../../services/action_runner'
import { configService } from '../../services/config_service'

function action(name: string, overrides: Partial<ActionDefinition> = {}): ActionDefinition {
    return {
        after: [],
        agent: null,
        appliesTo: null,
        before: [],
        builtin: false,
        description: `${name} description`,
        icon: null,
        label: name,
        model: null,
        name,
        on: [],
        onState: null,
        text: 'run',
        type: 'cmd',
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

function renderPopup(overrides: Partial<Parameters<typeof ActionPopup>[0]> = {}) {
    const onNavigate = vi.fn()
    const onClose = vi.fn()
    const loadHistory = vi.fn(async () => [])
    const runAction = vi.fn(async () => completedResult)
    const scheduleAction = vi.fn(async () => {})
    render(
        <ActionPopup
            action={action('Implement')}
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
            { actionName: 'Run tests', type: 'afterAction' },
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
        expect(runAction).toHaveBeenCalledWith(expect.objectContaining({ name: 'Implement' }), context, { extraPrompt: '' })
    })

    it('passes extra prompt input when running an agent action', async () => {
        const { runAction } = renderPopup({ action: action('Implement', { type: 'agent' }) })

        fireEvent.change(screen.getByLabelText('Extra prompt'), { target: { value: 'focus tests' } })
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        const expectedInput = { extraPrompt: 'focus tests' }
        await waitFor(() => expect(runAction).toHaveBeenCalledWith(expect.objectContaining({ name: 'Implement' }), context, expectedInput))
    })

    it('passes selected agent and model when running an agent action', async () => {
        configService.init({
            desktopConfig: {
                agent: 'codex',
                agentProfiles: [{ command: 'codex', modelArgument: '--model', models: ['gpt-5', 'gpt-5-mini'], name: 'codex' }],
                model: 'gpt-5',
                projectLocationMode: 'folder',
            },
        })
        const { runAction } = renderPopup({ action: action('Implement', { model: 'gpt-5-mini', type: 'agent' }) })

        fireEvent.change(screen.getByLabelText('Extra prompt'), { target: { value: 'focus tests' } })
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        const expectedInput = { agent: 'codex', extraPrompt: 'focus tests', model: 'gpt-5-mini' }
        await waitFor(() => expect(runAction).toHaveBeenCalledWith(expect.objectContaining({ name: 'Implement' }), context, expectedInput))
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

        expect(screen.getByText('Run history')).toBeInTheDocument()
        await waitFor(() => expect(screen.getByText('completed (codex / gpt-5): done')).toBeInTheDocument())
    })

    it('shows and hides a diff view for a commit history entry', async () => {
        const commitEntry = {
            command: 'git commit',
            commit: {
                actionName: 'commit',
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
        renderPopup({ action: action('Custom prompt', { text: '{{prompt}}', type: 'agent' }), convertPromptToAction })

        fireEvent.change(screen.getByLabelText('Extra prompt'), { target: { value: 'review this file' } })
        fireEvent.change(screen.getByLabelText('Action label'), { target: { value: 'Custom review' } })
        fireEvent.click(screen.getByRole('button', { name: 'Convert to action' }))

        await waitFor(() => expect(screen.getByText('Saved actions/custom-review.json')).toBeInTheDocument())
        expect(convertPromptToAction).toHaveBeenCalledWith({ context, label: 'Custom review', prompt: 'review this file' })
    })

    it('shows before and after shortcuts and navigates to them with the same context', () => {
        const before = action('Create branch')
        const after = action('Run tests')
        const { onNavigate } = renderPopup({ action: action('Implement', { after: [after], before: [before] }) })

        fireEvent.click(screen.getByRole('button', { name: 'Create branch' }))
        expect(onNavigate).toHaveBeenCalledWith(before)

        fireEvent.click(screen.getByRole('button', { name: 'Run tests' }))
        expect(onNavigate).toHaveBeenCalledWith(after)
    })

    it('places the resize handle in the corner set by popup position', () => {
        renderPopup({ resizeCorner: 'lower-left' })

        expect(screen.getByRole('separator', { name: 'Resize action popup' })).toHaveAttribute('data-corner', 'lower-left')
    })

    it('grows the popup when the resize handle is dragged', () => {
        renderPopup()
        const handle = screen.getByRole('separator', { name: 'Resize action popup' })
        const paper = document.querySelector('.MuiDialog-paper') as HTMLElement

        fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 100, clientY: 60, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })

        expect(paper.style.width).toBe('520px')
        expect(paper.style.height).toBe('380px')
    })
})
