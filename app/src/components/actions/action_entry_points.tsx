import { IconButton, ListItemIcon, MenuItem, Stack, Tooltip } from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { actionsForContext, type ActionContext } from '../../data/action_context'
import { CUSTOM_PROMPT_ACTION_ID, type ActionDefinition } from '../../data/action_types'
import { useActions } from '../hooks/use_actions'
import { useRunningActionForContext } from '../hooks/use_action_executions'
import { ActionIcon } from './action_icon'
import { resolveActionIcon, type ActionIconSource } from './action_icon_resolver'
import { ActionPopup } from './action_popup'

/** How action entry points are rendered in an existing toolbar or menu. */
export type ActionEntryVariant = 'icons' | 'menuItems'

interface ActionEntryPointsProps {
    actions?: ActionDefinition[]
    context: ActionContext
    onMenuItemSelected?: () => void
    popupAnchorElement?: HTMLElement | null
    variant: ActionEntryVariant
}

const DEFAULT_ICON_SOURCE: ActionIconSource = { dataUri: null }

/**
 * Context-sensitive action entry points shown close to a card/file/folder. Filters
 * the loaded actions by `appliesTo`, and on activation opens a resizable popup bound
 * to the action and context. `before`/`after` shortcuts push a new popup for the
 * related action with the same context.
 */
export function ActionEntryPoints(props: ActionEntryPointsProps) {
    const { actions: suppliedActions, context, onMenuItemSelected, popupAnchorElement, variant } = props
    const { actions: loadedActions } = useActions()
    const actions = suppliedActions ?? loadedActions
    const runningExecution = useRunningActionForContext(context)
    const executionDisabled = !!runningExecution
    const [iconSources, setIconSources] = useState<Record<string, ActionIconSource>>({})
    const [popupAnchor, setPopupAnchor] = useState<HTMLElement | null>(null)

    const matching = useMemo(() => {
        const contextActions = actionsForContext(actions, context)
        const customPrompt = contextActions.find((action) => action.id === CUSTOM_PROMPT_ACTION_ID)
        const configuredActions = contextActions.filter((action) => action.id !== CUSTOM_PROMPT_ACTION_ID)

        return customPrompt ? [...configuredActions, customPrompt] : configuredActions
    }, [actions, context])

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

    const open = (anchorElement: HTMLElement) => {
        onMenuItemSelected?.()
        setPopupAnchor(anchorElement)
    }

    const iconSourceFor = (action: ActionDefinition) => iconSources[action.id] ?? DEFAULT_ICON_SOURCE

    const closePopup = () => {
        setPopupAnchor(null)
    }

    const popup = popupAnchor ? (
        <ActionPopup
            anchorElement={popupAnchor}
            context={context}
            onClose={closePopup}
        />
    ) : null

    const menuItems = (
        <>
            {matching.map((action) => (
                <MenuItem
                    disabled={executionDisabled}
                    key={action.id}
                    onClick={(event) => open(popupAnchorElement ?? event.currentTarget)}
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
                        disabled={executionDisabled}
                        onClick={(event) => open(event.currentTarget)}
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
