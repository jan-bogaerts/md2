import { Box, Menu, MenuItem, ToggleButtonGroup } from '@mui/material'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionRunStatus } from '../../../../data/action_run_types'
import type { ActionDefinition } from '../../../../data/action_types'
import { useActiveActionRunsForContext } from '../../../hooks/use_action_runs'
import { HorizontalScrollArea } from '../../../horizontal_scroll_area'
import { ActionSelectorButton } from './action_selector_button'
import { ACTION_SELECTOR_GROUP_SX } from './action_selector_styles'
import {
    ACTION_VISIBILITY_MODES,
    type ActionVisibilityMode,
} from './action_visibility_mode_store'

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
    onVisibilityModeChange?: (mode: ActionVisibilityMode) => void
    selectedAction: ActionDefinition | null
    selectedHasForEach?: boolean
    visibilityMode?: ActionVisibilityMode
}

/** Horizontally scrollable, mutually exclusive action selector used by the card Run popup. */
export function ActionSelector(props: ActionSelectorProps) {
    const {
        actions, context, onSelect, onVisibilityModeChange, selectedAction, selectedHasForEach = false,
        visibilityMode = 'specific-for-context',
    } = props
    const activeRuns = useActiveActionRunsForContext(context)
    const groupRef = useRef<HTMLDivElement>(null)
    const [menuPosition, setMenuPosition] = useState<{ left: number, top: number } | null>(null)
    const activeActionStatuses: Record<string, ActionRunStatus> = {}
    for (const { rootActionId, status } of activeRuns) {
        if (status === 'waitingForInput' || !activeActionStatuses[rootActionId]) activeActionStatuses[rootActionId] = status
    }
    const handleChange = (_event: MouseEvent<HTMLElement>, actionId: string | null) => {
        if (actionId) onSelect(actionId)
    }
    const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
        event.preventDefault()
        setMenuPosition({ left: event.clientX, top: event.clientY })
    }
    const handleMenuClose = () => setMenuPosition(null)
    const handleModeSelect = (event: MouseEvent<HTMLLIElement>) => {
        const mode = ACTION_VISIBILITY_MODES.find(({ value }) => value === event.currentTarget.dataset.mode)?.value
        if (!mode) throw new Error('Missing action visibility mode')
        onVisibilityModeChange?.(mode)
        handleMenuClose()
    }

    useEffect(() => {
        const selectedButton = groupRef.current?.querySelector(SELECTED_BUTTON_SELECTOR)
        selectedButton?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }, [selectedAction?.id])

    return (
        <Box onContextMenu={handleContextMenu} sx={{ minHeight: 32 }}>
            <HorizontalScrollArea>
                <ToggleButtonGroup
                    aria-label="Actions"
                    exclusive
                    onChange={handleChange}
                    ref={groupRef}
                    size="small"
                    sx={ACTION_SELECTOR_ROW_SX}
                    value={selectedAction?.id ?? null}
                >
                    {actions.map((action) => (
                        <ActionSelectorButton
                            action={action}
                            context={context}
                            key={action.id}
                            liveStatus={activeActionStatuses[action.id]}
                            hasForEach={action.id === selectedAction?.id && selectedHasForEach}
                        />
                    ))}
                </ToggleButtonGroup>
            </HorizontalScrollArea>
            <Menu
                anchorPosition={menuPosition ?? undefined}
                anchorReference="anchorPosition"
                onClose={handleMenuClose}
                open={!!menuPosition}
                slotProps={{ list: { 'aria-label': 'Action visibility' } }}
            >
                {ACTION_VISIBILITY_MODES.map(({ label, value }) => (
                    <MenuItem
                        data-mode={value}
                        key={value}
                        onClick={handleModeSelect}
                        selected={value === visibilityMode}
                    >
                        {label}
                    </MenuItem>
                ))}
            </Menu>
        </Box>
    )
}
