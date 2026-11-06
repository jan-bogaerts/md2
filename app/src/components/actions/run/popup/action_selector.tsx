import { ToggleButtonGroup } from '@mui/material'
import { useEffect, useRef, type MouseEvent } from 'react'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionRunStatus } from '../../../../data/action_run_types'
import type { ActionDefinition } from '../../../../data/action_types'
import { useActiveActionRunsForContext } from '../../../hooks/use_action_runs'
import { HorizontalScrollArea } from '../../../horizontal_scroll_area'
import { ActionSelectorButton } from './action_selector_button'
import { ACTION_SELECTOR_GROUP_SX } from './action_selector_styles'

/** Single-row variant of the shared group styles; buttons keep their natural width inside the scroll area. */
const ACTION_SELECTOR_ROW_SX = {
    ...ACTION_SELECTOR_GROUP_SX,
    flexWrap: 'nowrap',
    '& .MuiToggleButtonGroup-grouped': {
        ...ACTION_SELECTOR_GROUP_SX['& .MuiToggleButtonGroup-grouped'],
        flexShrink: 0,
        whiteSpace: 'nowrap',
    },
} as const
const SELECTED_BUTTON_SELECTOR = '[aria-pressed="true"]'

interface ActionSelectorProps {
    actions: ActionDefinition[]
    context: ActionContext
    onSelect: (actionId: string) => void
    selectedAction: ActionDefinition
    selectedHasForEach?: boolean
}

/** Horizontally scrollable, mutually exclusive action selector used by the card Run popup. */
export function ActionSelector(props: ActionSelectorProps) {
    const { actions, context, onSelect, selectedAction, selectedHasForEach = false } = props
    const activeRuns = useActiveActionRunsForContext(context)
    const groupRef = useRef<HTMLDivElement>(null)
    const activeActionStatuses: Record<string, ActionRunStatus> = {}
    for (const { rootActionId, status } of activeRuns) {
        if (status === 'waitingForInput' || !activeActionStatuses[rootActionId]) activeActionStatuses[rootActionId] = status
    }
    const handleChange = (_event: MouseEvent<HTMLElement>, actionId: string | null) => {
        if (actionId) onSelect(actionId)
    }

    useEffect(() => {
        const selectedButton = groupRef.current?.querySelector(SELECTED_BUTTON_SELECTOR)
        selectedButton?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }, [selectedAction.id])

    return (
        <HorizontalScrollArea>
            <ToggleButtonGroup
                aria-label="Actions"
                exclusive
                onChange={handleChange}
                ref={groupRef}
                size="small"
                sx={ACTION_SELECTOR_ROW_SX}
                value={selectedAction.id}
            >
                {actions.map((action) => (
                    <ActionSelectorButton
                        action={action}
                        context={context}
                        key={action.id}
                        liveStatus={activeActionStatuses[action.id]}
                        hasForEach={action.id === selectedAction.id && selectedHasForEach}
                    />
                ))}
            </ToggleButtonGroup>
        </HorizontalScrollArea>
    )
}
