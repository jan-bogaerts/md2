import { IconButton, ListItemIcon, MenuItem, Stack, Tooltip } from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { displayActionsForContext, type ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import { dialogService } from '../../services/dialog_service'
import { useActions } from '../hooks/use_actions'
import { useRunningActionForContext } from '../hooks/use_action_runs'
import { ActionIcon } from './action_icon'
import { resolveActionIcon, type ActionIconSource } from './action_icon_resolver'
import { ActionPopup } from './action_popup'

/** How action entry points are rendered in an existing toolbar or menu. */
export type ActionEntryVariant = 'icons' | 'menuItems'
export type ActionEntryVisibility = 'all-matching' | 'explicit-context'

interface ActionEntryPointsProps {
    context: ActionContext
    onMenuItemSelected?: () => void
    popupAnchorElement?: HTMLElement | null
    variant: ActionEntryVariant
    visibility?: ActionEntryVisibility
}

const DEFAULT_ICON_SOURCE: ActionIconSource = { dataUri: null }

interface ActionPopupState {
    actionId: string
    anchorElement: HTMLElement
}

/**
 * Context-sensitive action entry points shown close to a card/file/folder. Filters
 * the loaded actions by `appliesTo`, and on activation opens a resizable popup bound
 * to the action and context. `before`/`after` shortcuts push a new popup for the
 * related action with the same context.
 */
export function ActionEntryPoints(props: ActionEntryPointsProps) {
    const { context, onMenuItemSelected, popupAnchorElement, variant, visibility = 'all-matching' } = props
    const { actions: loadedActions } = useActions()
    const runningRun = useRunningActionForContext(context)
    const runDisabled = !!runningRun
    const [iconSources, setIconSources] = useState<Record<string, ActionIconSource>>({})
    const [popupState, setPopupState] = useState<ActionPopupState | null>(null)

    const matching = useMemo(() => {
        const contextActions = displayActionsForContext(loadedActions, context)
        if (visibility === 'explicit-context') {
            return contextActions.filter((action) => action.appliesTo?.kind === context.kind)
        }

        return contextActions
    }, [context, loadedActions, visibility])

    useEffect(() => {
        let isActive = true

        const loadIcons = async () => {
            const entries = await Promise.all(matching.map(async (action) => [action.id, await resolveActionIcon(action.icon)] as const))
            if (!isActive) return

            setIconSources(Object.fromEntries(entries))
        }

        void loadIcons()

        return () => {
            isActive = false
        }
    }, [matching])

    if (matching.length === 0) return null

    const open = (actionId: string, anchorElement: HTMLElement) => {
        onMenuItemSelected?.()
        setPopupState({ actionId, anchorElement })
    }

    const handleOpen = (event: MouseEvent<HTMLElement>) => {
        try {
            const { actionId } = event.currentTarget.dataset
            if (!actionId) throw new Error('Missing action id on action entry point')

            open(actionId, popupAnchorElement ?? event.currentTarget)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Action popup could not be opened' })
        }
    }

    const iconSourceFor = (action: ActionDefinition) => iconSources[action.id] ?? DEFAULT_ICON_SOURCE

    const closePopup = () => {
        setPopupState(null)
    }

    const popup = popupState ? (
        <ActionPopup
            anchorElement={popupState.anchorElement}
            context={context}
            draggable
            initialActionId={popupState.actionId}
            key={popupState.actionId}
            onClose={closePopup}
        />
    ) : null

    const menuItems = (
        <>
            {matching.map((action) => (
                <MenuItem
                    data-action-id={action.id}
                    disabled={runDisabled}
                    key={action.id}
                    onClick={handleOpen}
                >
                    <ListItemIcon>
                        <ActionIcon fontSize="small" source={iconSourceFor(action)} />
                    </ListItemIcon>
                    {action.label}
                </MenuItem>
            ))}
            {popup}
        </>
    )

    if (variant === 'menuItems') return menuItems

    return (
        <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
            {matching.map((action) => (
                <Tooltip key={action.id} title={action.label}>
                    <IconButton
                        aria-label={action.label}
                        data-action-id={action.id}
                        disabled={runDisabled}
                        onClick={handleOpen}
                        size="small"
                    >
                        <ActionIcon fontSize="small" source={iconSourceFor(action)} />
                    </IconButton>
                </Tooltip>
            ))}
            {popup}
        </Stack>
    )
}
