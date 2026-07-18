import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgentUsageDisplay } from './agent_usage_display'

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

        const summary = screen.getByText('tokens: 1,284')
        expect(summary).not.toHaveTextContent('input')
        expect(summary).not.toHaveTextContent('$')

        fireEvent.keyDown(document, { key: 'Tab' })
        summary.focus()

        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'total: 1,284, input: 1,000, cached input: 234, output: 40, reasoning: 10, reported cost: $0.0125',
        )
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
