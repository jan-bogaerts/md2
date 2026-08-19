import { Box, ToggleButtonGroup } from '@mui/material'
import type { MouseEvent } from 'react'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionRunStatus } from '../../../../data/action_run_types'
import type { ActionDefinition } from '../../../../data/action_types'
import { useActiveActionRunsForContext } from '../../../hooks/use_action_runs'
import { ActionSelectorButton } from './action_selector_button'

interface ActionSelectorProps {
    actions: ActionDefinition[]
    context: ActionContext
    onSelect: (actionId: string) => void
    selectedAction: ActionDefinition
}

/** Horizontally scrollable, mutually exclusive action selector used by the card Run popup. */
export function ActionSelector(props: ActionSelectorProps) {
    const { actions, context, onSelect, selectedAction } = props
    const activeRuns = useActiveActionRunsForContext(context)
    const activeActionStatuses: Record<string, ActionRunStatus> = {}
    for (const { rootActionId, status } of activeRuns) {
        if (status === 'waitingForInput' || !activeActionStatuses[rootActionId]) activeActionStatuses[rootActionId] = status
    }
    const handleChange = (_event: MouseEvent<HTMLElement>, actionId: string | null) => {
        if (actionId) onSelect(actionId)
    }

    return (
        <Box sx={{ alignItems: 'center', display: 'flex', flex: 1, flexWrap: 'wrap', gap: 1, minWidth: 0 }}>
            <Box sx={{ minWidth: 0 }}>
                <ToggleButtonGroup
                    aria-label="Actions"
                    exclusive
                    onChange={handleChange}
                    size="small"
                    sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 1,
                        '& .MuiToggleButtonGroup-grouped': {
                            bgcolor: 'action.selected',
                            border: '1px solid transparent',
                            borderRadius: '7px !important',
                            color: 'text.secondary',
                            fontSize: 12,
                            fontWeight: 600,
                            height: 26,
                            m: '0 !important',
                            px: 1.5,
                            textTransform: 'none',
                            '&:hover': { bgcolor: 'action.hover', borderColor: 'text.disabled', color: 'text.primary' },
                            '&.Mui-selected': {
                                bgcolor: 'action.selected',
                                borderColor: 'primary.main',
                                color: 'primary.main',
                                '&:hover': { bgcolor: 'action.selected' },
                            },
                        },
                    }}
                    value={selectedAction.id}
                >
                    {actions.map((action) => (
                        <ActionSelectorButton
                            action={action}
                            context={context}
                            key={action.id}
                            liveStatus={activeActionStatuses[action.id]}
                        />
                    ))}
                </ToggleButtonGroup>
            </Box>
        </Box>
    )
}
