import { ThemeProvider, type PaletteMode } from '@mui/material'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionRunStatus } from '../../../../data/action_run_types'
import { BUILTIN_CUSTOM_PROMPT, type ActionDefinition } from '../../../../data/action_types'
import type { CardAgentState } from '../../../../services/agents/card_agent_state'
import { createAppTheme } from '../../../../theme/app_theme'
import { ActionSelector } from './action_selector'

const actionStates = vi.hoisted(() => ({
    live: {} as Record<string, ActionRunStatus | null>,
    persisted: {} as Record<string, CardAgentState>,
}))

vi.mock('../../../hooks/use_action_runs', () => ({
    useActiveActionRunsForContext: () => Object.entries(actionStates.live).flatMap(([rootActionId, status]) => (
        status ? [{ rootActionId, runId: `${rootActionId}-run`, status }] : []
    )),
}))
vi.mock('../../../hooks/use_card_action_agent_state', () => ({ useCardActionAgentState: (actionId: string) => actionStates.persisted[actionId] ?? 'idle' }))

const context: ActionContext = { file: 'design/F-105.md', kind: 'card', state: 'design', type: 'feature' }
const actions: ActionDefinition[] = [
    { ...BUILTIN_CUSTOM_PROMPT, id: 'selected', label: 'Selected action' },
    { ...BUILTIN_CUSTOM_PROMPT, id: 'unselected', label: 'Unselected action' },
]

function renderSelector(mode: PaletteMode) {
    const theme = createAppTheme(mode)
    actionStates.live = { selected: 'waitingForInput', unselected: 'waitingForInput' }
    render(
        <ThemeProvider theme={theme}>
            <ActionSelector
                actions={actions}
                context={context}
                onSelect={vi.fn()}
                selectedAction={actions[0]}
            />
        </ThemeProvider>,
    )

    return theme
}

describe('ActionSelector', () => {
    afterEach(() => {
        actionStates.live = {}
        actionStates.persisted = {}
        cleanup()
    })

    it.each(['light', 'dark'] as const)('keeps waiting borders visible for selected and unselected actions in %s mode', (mode) => {
        const theme = renderSelector(mode)
        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))
        const selectedButton = actionGroup.getByRole('button', { name: /Selected action.*Agent is waiting for input/u })
        const unselectedButton = actionGroup.getByRole('button', { name: /Unselected action.*Agent is waiting for input/u })

        expect(selectedButton).toHaveAttribute('aria-pressed', 'true')
        expect(unselectedButton).toHaveAttribute('aria-pressed', 'false')
        expect(selectedButton).toHaveStyle({ borderColor: theme.palette.warning.main })
        expect(unselectedButton).toHaveStyle({ borderColor: theme.palette.warning.main })
        expect(within(selectedButton).getByTestId('HelpCircleOutlineIcon')).toBeInTheDocument()
        expect(within(selectedButton).queryByTestId('PlayIcon')).not.toBeInTheDocument()
    })

    it('renders custom prompt as one accessible plus action with an explanatory tooltip', async () => {
        actionStates.live = {}
        render(
            <ThemeProvider theme={createAppTheme('light')}>
                <ActionSelector
                    actions={[BUILTIN_CUSTOM_PROMPT]}
                    context={context}
                    onSelect={vi.fn()}
                    selectedAction={BUILTIN_CUSTOM_PROMPT}
                />
            </ThemeProvider>,
        )
        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))
        const customPrompt = actionGroup.getByRole('button', { name: 'Custom prompt' })

        expect(customPrompt).toHaveTextContent('+')
        expect(actionGroup.getAllByRole('button')).toHaveLength(1)
        expect(screen.queryByRole('button', { name: 'Add action' })).not.toBeInTheDocument()
        fireEvent.mouseOver(customPrompt)
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Send a custom prompt to the agent.')
    })

    it.each([
        ['waiting for input', 'Agent is waiting for input'],
        ['unseen result', 'New agent result available'],
    ] as const)('shows persisted %s state without a live run', (persistedState, description) => {
        actionStates.persisted = { selected: persistedState }
        render(
            <ThemeProvider theme={createAppTheme('light')}>
                <ActionSelector actions={actions} context={context} onSelect={vi.fn()} selectedAction={actions[0]} />
            </ThemeProvider>,
        )

        const selectedButton = screen.getByRole('button', { name: new RegExp(`Selected action.*${description}`, 'u') })
        if (persistedState === 'waiting for input') {
            expect(within(selectedButton).getByTestId('HelpCircleOutlineIcon')).toBeInTheDocument()
        } else {
            expect(within(selectedButton).getByTestId('CircleIcon')).toBeInTheDocument()
        }
    })

    it('lets a live running state override persisted waiting state', () => {
        actionStates.persisted = { selected: 'waiting for input' }
        actionStates.live = { selected: 'running' }
        render(
            <ThemeProvider theme={createAppTheme('light')}>
                <ActionSelector actions={actions} context={context} onSelect={vi.fn()} selectedAction={actions[0]} />
            </ThemeProvider>,
        )

        const selectedButton = screen.getByRole('button', { name: /Selected action.*Agent is running/u })
        expect(within(selectedButton).getByTestId('PlayIcon')).toBeInTheDocument()
        expect(within(selectedButton).queryByTestId('HelpCircleOutlineIcon')).not.toBeInTheDocument()
    })
})
