import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionPopup } from './action_popup'
import type { ActionDefinition } from '../../data/action_types'
import type { ActionContext } from '../../data/action_context'
import type { ActionRunResult } from '../../services/action_runner'

function action(name: string, overrides: Partial<ActionDefinition> = {}): ActionDefinition {
    return {
        after: [],
        appliesTo: null,
        before: [],
        builtin: false,
        description: `${name} description`,
        icon: null,
        label: name,
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

function renderPopup(overrides: Partial<Parameters<typeof ActionPopup>[0]> = {}) {
    const onNavigate = vi.fn()
    const onClose = vi.fn()
    const loadHistory = vi.fn(async () => [])
    const runAction = vi.fn(async () => completedResult)
    render(
        <ActionPopup
            action={action('Implement')}
            context={context}
            loadHistory={loadHistory}
            onClose={onClose}
            onNavigate={onNavigate}
            runAction={runAction}
            {...overrides}
        />,
    )

    return { loadHistory, onClose, onNavigate, runAction }
}

describe('ActionPopup', () => {
    afterEach(cleanup)

    it('shows the action label, description and a Run command', () => {
        renderPopup()

        expect(screen.getByText('Implement')).toBeInTheDocument()
        expect(screen.getByText('Implement description')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument()
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

    it('shows previous run history for an agent action', async () => {
        renderPopup({
            action: action('Implement', { type: 'agent' }),
            loadHistory: vi.fn(async () => [{ completedAt: '2026-07-05T10:00:00.000Z', output: 'done', prompt: 'run', status: 'completed' }]),
        })

        expect(screen.getByText('Run history')).toBeInTheDocument()
        await waitFor(() => expect(screen.getByText('completed: done')).toBeInTheDocument())
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
