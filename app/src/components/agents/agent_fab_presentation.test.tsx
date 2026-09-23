import { cleanup, render, screen } from '@testing-library/react'
import RobotOutline from 'mdi-material-ui/RobotOutline'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActiveActionRun } from '../../services/actions/action_run_registry'
import type { CardAgentState } from '../../services/agents/card_agent_state'
import { AppThemeProvider } from '../../theme/theme_provider'
import { AgentFabPresentation } from './agent_fab_presentation'
import { type AgentFabState, resolveAgentFabState } from './agent_fab_state'

function activeRun(status: ActiveActionRun['status']) {
    return { status } as ActiveActionRun
}

describe('resolveAgentFabState', () => {
    it('uses waiting, running, queued, unseen, and idle priority', () => {
        expect(resolveAgentFabState([
            activeRun('queued'), activeRun('running'), activeRun('waitingForInput'),
        ], 'unseen result')).toBe('waiting for input')
        expect(resolveAgentFabState([activeRun('queued'), activeRun('running')], 'unseen result')).toBe('running')
        expect(resolveAgentFabState([activeRun('queued')], 'unseen result')).toBe('queued')
        expect(resolveAgentFabState([], 'unseen result')).toBe('unseen result')
        expect(resolveAgentFabState([], 'idle')).toBe('idle')
    })

    it.each([
        ['waiting for input', 'waiting for input'],
        ['running', 'running'],
    ] as [CardAgentState, AgentFabState][])('keeps persisted %s state without a live run', (persistedState, expected) => {
        expect(resolveAgentFabState([], persistedState)).toBe(expected)
    })
})

describe('AgentFabPresentation', () => {
    afterEach(cleanup)

    it.each([
        ['idle', 'Diagram action', null],
        ['queued', 'Diagram action — Action is queued', null],
        ['running', 'Diagram action — Action is running', null],
        ['waiting for input', 'Diagram action — Agent is waiting for input', 'HelpCircleOutlineIcon'],
        ['unseen result', 'Diagram action — New agent result available', 'CircleIcon'],
    ] as [AgentFabState, string, string | null][])('renders %s state', (state, label, badgeTestId) => {
        render(
            <AgentFabPresentation
                icon={<RobotOutline />}
                labelPrefix="Diagram action"
                onActivate={vi.fn()}
                state={state}
            />,
            { wrapper: AppThemeProvider },
        )

        const button = screen.getByRole('button', { name: label })
        if (badgeTestId) expect(button.querySelector(`[data-testid="${badgeTestId}"]`)).toBeInTheDocument()
        if (state === 'running') expect(document.head.textContent).toContain('md2-agent-run-spin')
    })

    it('uses disabled explanation as accessible label', () => {
        render(
            <AgentFabPresentation
                disabled
                disabledLabel="No root diagram actions configured"
                icon={<RobotOutline />}
                labelPrefix="Diagram action"
                onActivate={vi.fn()}
                state="idle"
            />,
            { wrapper: AppThemeProvider },
        )

        expect(screen.getByRole('button', { name: 'No root diagram actions configured' })).toBeDisabled()
    })
})
