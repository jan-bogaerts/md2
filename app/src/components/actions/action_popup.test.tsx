import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionPopup } from './action_popup'
import type { ActionDefinition } from '../../data/action_types'
import type { ActionContext } from '../../data/action_context'

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

function renderPopup(overrides: Partial<Parameters<typeof ActionPopup>[0]> = {}) {
    const onNavigate = vi.fn()
    const onClose = vi.fn()
    render(<ActionPopup action={action('Implement')} context={context} onClose={onClose} onNavigate={onNavigate} {...overrides} />)

    return { onClose, onNavigate }
}

describe('ActionPopup', () => {
    afterEach(cleanup)

    it('shows the action label, description and a Run command', () => {
        renderPopup()

        expect(screen.getByText('Implement')).toBeInTheDocument()
        expect(screen.getByText('Implement description')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument()
    })

    it('reports "not yet runnable" when Run is pressed (F-010c stub)', () => {
        renderPopup()

        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        expect(screen.getByRole('status')).toHaveTextContent('not yet runnable')
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
