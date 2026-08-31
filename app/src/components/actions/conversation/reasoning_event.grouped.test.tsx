import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentConversationEvent } from '../../../data/data_types'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ReasoningEvent } from './reasoning_event'

function reasoningEvent(status: string, summary: string[]): AgentConversationEvent {
    return {
        content: '',
        id: 'reasoning-1',
        providerItemId: 'reasoning-1',
        status,
        summary,
        timestamp: 'now',
        type: 'reasoning',
    }
}

function renderReasoning(event: AgentConversationEvent) {
    return render(<AppThemeProvider><ReasoningEvent event={event} /></AppThemeProvider>)
}

describe('ReasoningEvent', () => {
    afterEach(() => cleanup())

    it.each(['inProgress', 'running', 'started'])('keeps %s reasoning expanded', (status) => {
        renderReasoning(reasoningEvent(status, ['Inspect code']))

        expect(screen.getByText('Inspect code')).toBeInTheDocument()
        expect(screen.getByText('Running')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Reasoning details' })).not.toBeInTheDocument()
    })

    it('starts historical completed reasoning collapsed and toggles through an accessible button', () => {
        renderReasoning(reasoningEvent('completed', ['Finished inspection']))
        const button = screen.getByRole('button', { name: 'Reasoning details' })

        expect(button.tagName).toBe('BUTTON')
        expect(button).toHaveAttribute('aria-expanded', 'false')
        expect(screen.getByText('Completed')).toBeInTheDocument()
        expect(screen.queryByText('Finished inspection')).not.toBeInTheDocument()

        fireEvent.click(button)

        expect(button).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByText('Finished inspection')).toBeInTheDocument()

        fireEvent.click(button)

        expect(button).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByText('Finished inspection')).not.toBeInTheDocument()
    })

    it('collapses on live completion once and keeps user expansion across later updates', () => {
        const started = reasoningEvent('inProgress', ['Inspect code'])
        const { rerender } = renderReasoning(started)

        rerender(<AppThemeProvider><ReasoningEvent event={{ ...started, status: 'completed' }} /></AppThemeProvider>)
        const button = screen.getByRole('button', { name: 'Reasoning details' })
        expect(button).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByText('Inspect code')).not.toBeInTheDocument()

        fireEvent.click(button)
        rerender(
            <AppThemeProvider>
                <ReasoningEvent event={{ ...started, status: 'completed', summary: ['Inspect code', 'Check tests'] }} />
            </AppThemeProvider>,
        )

        expect(button).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByText('Inspect code')).toHaveStyle({ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' })
        expect(screen.getByText('Check tests')).toBeInTheDocument()
    })

    it.each([
        ['failed', 'Failed'],
        ['declined', 'Declined'],
    ])('keeps %s reasoning expanded with error state', (status, label) => {
        renderReasoning(reasoningEvent(status, [`${label} inspection`]))

        expect(screen.getByText(label)).toBeInTheDocument()
        expect(screen.getByText(`${label} inspection`)).toBeInTheDocument()
    })
})
