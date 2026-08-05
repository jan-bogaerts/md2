import { ThemeProvider, type PaletteMode } from '@mui/material'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../../data/action_context'
import { BUILTIN_CUSTOM_PROMPT, type ActionDefinition } from '../../data/action_types'
import type { ActiveActionRun } from '../../services/actions/action_run_registry'
import { createAppTheme } from '../../theme/app_theme'
import { ActionSelector } from './action_selector'

const activeRuns = vi.hoisted(() => ({ value: [] as ActiveActionRun[] }))

vi.mock('../hooks/use_action_runs', () => ({useActiveActionRunsForContext: () => activeRuns.value}))

const context: ActionContext = { file: 'design/F-105.md', kind: 'card', state: 'design', type: 'feature' }
const actions: ActionDefinition[] = [
    { ...BUILTIN_CUSTOM_PROMPT, id: 'selected', label: 'Selected action' },
    { ...BUILTIN_CUSTOM_PROMPT, id: 'unselected', label: 'Unselected action' },
]

function renderSelector(mode: PaletteMode) {
    const theme = createAppTheme(mode)
    activeRuns.value = actions.map(({ id }) => ({ rootActionId: id, runId: `${id}-run`, status: 'waitingForInput' }))
    render(
        <ThemeProvider theme={theme}>
            <ActionSelector
                actions={actions}
                adding={false}
                context={context}
                onAdd={vi.fn()}
                onSelect={vi.fn()}
                selectedAction={actions[0]}
            />
        </ThemeProvider>,
    )

    return theme
}

describe('ActionSelector', () => {
    afterEach(() => {
        activeRuns.value = []
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
})
