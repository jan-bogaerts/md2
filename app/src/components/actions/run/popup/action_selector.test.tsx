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
    scheduled: {} as Record<string, boolean>,
}))

vi.mock('../../../hooks/use_action_runs', () => ({
    useActiveActionRunsForContext: () => Object.entries(actionStates.live).flatMap(([rootActionId, status]) => (
        status ? [{ rootActionId, runId: `${rootActionId}-run`, status }] : []
    )),
}))
vi.mock('../../../hooks/use_context_action_agent_state', () => ({ useContextActionAgentState: (actionId: string) => actionStates.persisted[actionId] ?? 'idle' }))
vi.mock('../../../hooks/use_pending_action_schedule', () => ({usePendingActionScheduleForCardAndAction: (_cardInternalId: string, actionId: string) => !!actionStates.scheduled[actionId]}))

const SCROLLER_WIDTH = 300
const OVERFLOWING_CONTENT_WIDTH = 800

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

/** Stubs jsdom layout so the scroll area around the action group measures as overflowing. */
function stubOverflowingScrollArea(actionGroup: HTMLElement) {
    const content = actionGroup.parentElement
    const scroller = content?.parentElement
    if (!content || !scroller) throw new Error('Expected scroll area structure')
    Object.defineProperties(content, { scrollWidth: { configurable: true, get: () => OVERFLOWING_CONTENT_WIDTH } })
    Object.defineProperties(scroller, {
        clientWidth: { configurable: true, get: () => SCROLLER_WIDTH },
        scrollLeft: { configurable: true, get: () => 0 },
        scrollWidth: { configurable: true, get: () => OVERFLOWING_CONTENT_WIDTH },
    })
    fireEvent.scroll(scroller)
}

describe('ActionSelector', () => {
    afterEach(() => {
        actionStates.live = {}
        actionStates.persisted = {}
        actionStates.scheduled = {}
        vi.restoreAllMocks()
        cleanup()
    })

    it('renders the action buttons in a scroll area that offers scrolling when they overflow', () => {
        render(
            <ThemeProvider theme={createAppTheme('light')}>
                <ActionSelector actions={actions} context={context} onSelect={vi.fn()} selectedAction={actions[0]} />
            </ThemeProvider>,
        )
        const actionGroup = screen.getByRole('group', { name: 'Actions' })

        expect(screen.queryByRole('button', { name: 'Scroll right' })).not.toBeInTheDocument()
        stubOverflowingScrollArea(actionGroup)

        expect(screen.getByRole('button', { name: 'Scroll right' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Scroll left' })).not.toBeInTheDocument()
        expect(within(actionGroup).getAllByRole('button')).toHaveLength(actions.length)
    })

    it('scrolls the selected action into view on first render and when the selection changes', () => {
        const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
        const theme = createAppTheme('light')
        const { rerender } = render(
            <ThemeProvider theme={theme}>
                <ActionSelector actions={actions} context={context} onSelect={vi.fn()} selectedAction={actions[0]} />
            </ThemeProvider>,
        )
        const scrollOptions = { block: 'nearest', inline: 'nearest' }

        expect(scrollIntoView).toHaveBeenCalledTimes(1)
        expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('button', { name: 'Selected action' }))
        expect(scrollIntoView).toHaveBeenLastCalledWith(scrollOptions)

        rerender(
            <ThemeProvider theme={theme}>
                <ActionSelector actions={actions} context={context} onSelect={vi.fn()} selectedAction={actions[1]} />
            </ThemeProvider>,
        )

        expect(scrollIntoView).toHaveBeenCalledTimes(2)
        expect(scrollIntoView.mock.contexts[1]).toBe(screen.getByRole('button', { name: 'Unselected action' }))
        expect(scrollIntoView).toHaveBeenLastCalledWith(scrollOptions)
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

    it('shows scheduled timer and warning color only for matching action', () => {
        actionStates.scheduled = { selected: true }
        const theme = createAppTheme('light')
        render(
            <ThemeProvider theme={theme}>
                <ActionSelector actions={actions} context={context} onSelect={vi.fn()} selectedAction={actions[0]} />
            </ThemeProvider>,
        )

        const selectedButton = screen.getByRole('button', { name: /Selected action.*Action scheduled/u })
        expect(selectedButton).toHaveStyle({ color: theme.palette.warning.main })
        expect(within(selectedButton).getByTestId('TimerOutlinedIcon')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Unselected action' })).not.toHaveStyle({ color: theme.palette.warning.main })
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

    it.each([
        ['queued', 'waiting for input', 'Action is queued'],
        ['running', 'waiting for input', 'Agent is running'],
        ['waitingForInput', 'running', 'Agent is waiting for input'],
    ] as const)('lets live project %s state override conflicting persisted state', (liveStatus, persistedState, description) => {
        actionStates.persisted = { selected: persistedState }
        actionStates.live = { selected: liveStatus }
        render(
            <ThemeProvider theme={createAppTheme('light')}>
                <ActionSelector actions={actions} context={{ kind: 'project' }} onSelect={vi.fn()} selectedAction={actions[0]} />
            </ThemeProvider>,
        )

        const selectedButton = screen.getByRole('button', { name: new RegExp(`Selected action.*${description}`, 'u') })
        if (liveStatus === 'running') expect(within(selectedButton).getByTestId('PlayIcon')).toBeInTheDocument()
        if (liveStatus === 'waitingForInput') expect(within(selectedButton).getByTestId('HelpCircleOutlineIcon')).toBeInTheDocument()
        if (liveStatus === 'queued') {
            expect(within(selectedButton).queryByTestId('PlayIcon')).not.toBeInTheDocument()
            expect(within(selectedButton).queryByTestId('HelpCircleOutlineIcon')).not.toBeInTheDocument()
        }
    })
})
