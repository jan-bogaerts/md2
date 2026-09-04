import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgentUsageDisplay } from './agent_usage_display'
import { formatTokenCount } from './token_count'

describe('AgentUsageDisplay', () => {
    it('shows only total inline and complete reported-cost detail on focus', async () => {
        render(<AgentUsageDisplay usage={{
            cachedInputTokens: 234,
            costUsd: 0.0125,
            inputTokens: 1000,
            outputTokens: 40,
            reasoningTokens: 10,
            totalTokens: 1284,
        }} />)

        const summary = screen.getByText(`tokens: ${formatTokenCount(1284)}`)
        expect(summary).not.toHaveTextContent('input')
        expect(summary).not.toHaveTextContent('$')

        fireEvent.keyDown(document, { key: 'Tab' })
        summary.focus()

        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'total: 1,284, input: 1,000, cached input: 234, output: 40, reasoning: 10, reported cost: $0.0125',
        )
    })

    it('abbreviates the inline total while the tooltip keeps the exact grouped number', async () => {
        render(<AgentUsageDisplay usage={{
            cachedInputTokens: 0,
            inputTokens: 400000,
            outputTokens: 28913,
            reasoningTokens: 0,
            totalTokens: 428913,
        }} />)

        // Inline and tooltip disagree by design: the caption abbreviates, the detail stays exact.
        const summary = screen.getByText(`tokens: ${formatTokenCount(428913)}`)
        expect(summary).not.toHaveTextContent('428,913')

        fireEvent.mouseOver(summary)

        expect(await screen.findByText('total: 428,913, input: 400,000, cached input: 0, output: 28,913, reasoning: 0'))
            .toBeInTheDocument()
    })

    it('omits cost when no provider reported it', async () => {
        render(<AgentUsageDisplay usage={{
            cachedInputTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            reasoningTokens: 0,
            totalTokens: 0,
        }} />)

        const summary = screen.getByText('tokens: 0')
        fireEvent.mouseOver(summary)

        const tooltip = await screen.findByText('total: 0, input: 0, cached input: 0, output: 0, reasoning: 0')
        expect(tooltip).not.toHaveTextContent('$')
    })
})
