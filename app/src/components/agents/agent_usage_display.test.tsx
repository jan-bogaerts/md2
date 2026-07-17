import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgentUsageDisplay } from './agent_usage_display'

describe('AgentUsageDisplay', () => {
    it('shows every token bucket and reported cost', () => {
        render(<AgentUsageDisplay usage={{
            cachedInputTokens: 234,
            costUsd: 0.0125,
            inputTokens: 1000,
            outputTokens: 40,
            reasoningTokens: 10,
            totalTokens: 1284,
        }} />)

        const summary = screen.getByLabelText('Token usage: 1284 total, 1000 input, 234 cached input, 40 output, 10 reasoning, $0.0125 reported cost')
        expect(summary).toHaveTextContent('1,284 tokens')
        expect(summary).toHaveTextContent('cached 234')
        expect(summary).toHaveTextContent('$0.0125')
    })

    it('omits cost when no provider reported it', () => {
        render(<AgentUsageDisplay usage={{
            cachedInputTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            reasoningTokens: 0,
            totalTokens: 0,
        }} />)

        expect(screen.getByLabelText('Token usage: 0 total, 0 input, 0 cached input, 0 output, 0 reasoning')).not.toHaveTextContent('$')
    })
})
