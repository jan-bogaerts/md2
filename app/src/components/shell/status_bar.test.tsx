import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatusBar } from './status_bar'
import { projectAgentTokenUsage } from '../../services/agents/agent_usage'

const EMPTY_AGENT_USAGE = projectAgentTokenUsage(null, 'design')

describe('StatusBar', () => {
    afterEach(cleanup)

    it('renders card counts, synchronization status and the agents indicator', () => {
        render(
            <StatusBar
                activeCardCount={2}
                agentUsage={EMPTY_AGENT_USAGE}
                agents={[]}
                hasPendingPush={false}
                hasPendingSave={false}
                isPushing={false}
                totalCardCount={5}
            />,
        )

        expect(screen.getByText('5')).toBeInTheDocument()
        expect(screen.getByText('cards')).toBeInTheDocument()
        expect(screen.getByText('2')).toBeInTheDocument()
        expect(screen.getByText('active')).toBeInTheDocument()
        expect(screen.getByText('Saved locally')).toBeInTheDocument()
        expect(screen.getByText('Synced')).toBeInTheDocument()
        expect(screen.queryByText('INS')).not.toBeInTheDocument()
        expect(screen.queryByText('OVR')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Running agents: 0' })).toBeInTheDocument()
    })

    it('does not render an editable status input', () => {
        render(
            <StatusBar
                activeCardCount={0}
                agentUsage={EMPTY_AGENT_USAGE}
                agents={[]}
                hasPendingPush={false}
                hasPendingSave={false}
                isPushing={false}
                totalCardCount={0}
            />,
        )

        expect(screen.queryByRole('textbox', { name: 'Status' })).toBeNull()
    })

    it('shows local saving and pending push independently', () => {
        render(
            <StatusBar
                activeCardCount={0}
                agentUsage={EMPTY_AGENT_USAGE}
                agents={[]}
                hasPendingPush
                hasPendingSave
                isPushing={false}
                totalCardCount={0}
            />,
        )

        expect(screen.getByText('Saving changes...')).toBeInTheDocument()
        expect(screen.getByText('Changes ready to push')).toBeInTheDocument()
    })

    it('shows push progress instead of the pending push status', () => {
        render(
            <StatusBar
                activeCardCount={0}
                agentUsage={EMPTY_AGENT_USAGE}
                agents={[]}
                hasPendingPush
                hasPendingSave={false}
                isPushing
                totalCardCount={0}
            />,
        )

        expect(screen.getByRole('progressbar', { name: 'Pushing' })).toBeInTheDocument()
        expect(screen.getByText('Pushing...')).toBeInTheDocument()
        expect(screen.queryByText('Changes ready to push')).not.toBeInTheDocument()
    })

    it('opens project, current-version, and release usage details', () => {
        const agentUsage = {
            current: {
                name: 'Current',
                usage: { cachedInputTokens: 2, inputTokens: 10, outputTokens: 3, reasoningTokens: 1, totalTokens: 16 },
            },
            project: { cachedInputTokens: 6, costUsd: 0.02, inputTokens: 30, outputTokens: 9, reasoningTokens: 3, totalTokens: 48 },
            releases: [{
                name: 'v1',
                usage: { cachedInputTokens: 4, costUsd: 0.02, inputTokens: 20, outputTokens: 6, reasoningTokens: 2, totalTokens: 32 },
            }],
        }
        render(
            <StatusBar
                activeCardCount={0}
                agentUsage={agentUsage}
                agents={[]}
                hasPendingPush={false}
                hasPendingSave={false}
                isPushing={false}
                totalCardCount={0}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Agent token usage summary' }))

        expect(screen.getByRole('heading', { name: 'Project agent usage' })).toBeInTheDocument()
        expect(screen.getByText('Current')).toBeInTheDocument()
        expect(screen.getByText('v1')).toBeInTheDocument()
        expect(screen.getByText('tokens: 48')).toBeInTheDocument()
        expect(screen.queryByText('$0.02')).not.toBeInTheDocument()
    })
})
