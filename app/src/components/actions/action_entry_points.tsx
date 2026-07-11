import { Button, IconButton, ListItemIcon, Menu, MenuItem, Stack, Tooltip } from '@mui/material'
import DotsVertical from 'mdi-material-ui/DotsVertical'
import Play from 'mdi-material-ui/Play'
import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { actionsForContext, type ActionContext } from '../../data/action_context'
import { CUSTOM_PROMPT_ACTION_NAME, type ActionDefinition } from '../../data/action_types'
import { useActions } from '../hooks/use_actions'
import { ActionIcon } from './action_icon'
import { resolveActionIcon, type ActionIconSource } from './action_icon_resolver'
import { ActionPopup } from './action_popup'

/** How entry points are rendered: inline icon buttons (cards) or a single overflow menu (files/folders). */
export type ActionEntryVariant = 'button' | 'icons' | 'menu' | 'menuItems'

interface ActionEntryPointsProps {
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
    const { context, onMenuItemSelected, popupAnchorElement, variant } = props
    const { actions } = useActions()
    const [iconSources, setIconSources] = useState<Record<string, ActionIconSource>>({})
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
    const [popupAnchor, setPopupAnchor] = useState<HTMLElement | null>(null)
    const [showSaveControls, setShowSaveControls] = useState(false)
    const [stack, setStack] = useState<ActionDefinition[]>([])

    const matching = useMemo(() => {
        const contextActions = actionsForContext(actions, context)
        const customPrompt = contextActions.find((action) => action.name === CUSTOM_PROMPT_ACTION_NAME)
        const configuredActions = contextActions.filter((action) => action.name !== CUSTOM_PROMPT_ACTION_NAME)

        return customPrompt ? [...configuredActions, customPrompt] : configuredActions
    }, [actions, context])

    useEffect(() => {
        let isActive = true

        const loadIcons = async () => {
            const entries = await Promise.all(matching.map(async (action) => [action.name, await resolveActionIcon(action.icon)] as const))
            if (!isActive) return

            setIconSources(Object.fromEntries(entries))
        }

        void loadIcons()

        return () => {
            isActive = false
        }
    }, [matching])

    if (matching.length === 0) return null

    const open = (action: ActionDefinition, anchorElement: HTMLElement) => {
        setMenuAnchor(null)
        onMenuItemSelected?.()
        setPopupAnchor(anchorElement)
        setStack([action])
    }

    const navigate = (action: ActionDefinition) => {
        setShowSaveControls(false)
        setStack((current) => [...current, action])
    }

    const selectAction = (action: ActionDefinition) => {
        setShowSaveControls(false)
        setStack([action])
    }

    const addAction = () => {
        const customPrompt = matching.find((action) => action.name === CUSTOM_PROMPT_ACTION_NAME)
        if (!customPrompt) throw new Error('Missing custom prompt action')

        setShowSaveControls((current) => !current)
        setStack([customPrompt])
    }

    const current = stack.at(-1) ?? null
    const iconSourceFor = (action: ActionDefinition) => iconSources[action.name] ?? DEFAULT_ICON_SOURCE

    const closePopup = () => {
        setPopupAnchor(null)
        setShowSaveControls(false)
        setStack([])
    }

    const popup = current ? (
        <ActionPopup
            action={current}
            anchorElement={popupAnchor}
            context={context}
            onClose={closePopup}
            onNavigate={navigate}
            {...(variant === 'button' ? {
                actions: matching,
                onAddAction: addAction,
                onSelectAction: selectAction,
                showSaveControls,
            } : {})}
        />
    ) : null

    const menuItems = (
        <>
            {matching.map((action) => (
                <MenuItem
                    key={action.name}
                    onClick={(event) => open(action, popupAnchorElement ?? menuAnchor ?? event.currentTarget)}
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

    if (variant === 'button') {
        const primaryAction = matching.find((action) => !action.builtin && action.appliesTo !== null)
            ?? matching.find((action) => !action.builtin)
            ?? matching[0]

        const handleRun = (event: MouseEvent<HTMLButtonElement>) => {
            setShowSaveControls(false)
            open(primaryAction, event.currentTarget)
        }

        return (
            <>
                <Button
                    onClick={handleRun}
                    size="small"
                    startIcon={<Play sx={{ fontSize: '13px !important' }} />}
                    sx={{ borderRadius: 99, fontSize: 11.5, height: 26, minWidth: 0, px: 1.25 }}
                    variant="outlined"
                >
                    Run
                </Button>
                {popup}
            </>
        )
    }

    if (variant === 'menu') {
        return (
            <>
                <Tooltip title="Actions">
                    <IconButton aria-label="Actions" onClick={(event) => setMenuAnchor(event.currentTarget)} size="small">
                        <DotsVertical fontSize="small" />
                    </IconButton>
                </Tooltip>
                <Menu anchorEl={menuAnchor} onClose={() => setMenuAnchor(null)} open={!!menuAnchor}>
                    {menuItems}
                </Menu>
            </>
        )
    }

    return (
        <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
            {matching.map((action) => (
                <Tooltip key={action.name} title={action.label}>
                    <IconButton aria-label={action.label} onClick={(event) => open(action, event.currentTarget)} size="small">
                        <ActionIcon fontSize="small" source={iconSourceFor(action)} />
                    </IconButton>
                </Tooltip>
            ))}
            {popup}
        </Stack>
    )
}
