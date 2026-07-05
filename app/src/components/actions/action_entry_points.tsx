import { IconButton, Menu, MenuItem, Stack, Tooltip } from '@mui/material'
import DotsVertical from 'mdi-material-ui/DotsVertical'
import Play from 'mdi-material-ui/Play'
import { useState } from 'react'
import { actionsForContext, type ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import { useActions } from '../hooks/use_actions'
import { ActionPopup } from './action_popup'

/** How entry points are rendered: inline icon buttons (cards) or a single overflow menu (files/folders). */
export type ActionEntryVariant = 'icons' | 'menu'

interface ActionEntryPointsProps {
    context: ActionContext
    variant: ActionEntryVariant
}

/**
 * Context-sensitive action entry points shown close to a card/file/folder. Filters
 * the loaded actions by `appliesTo`, and on activation opens a resizable popup bound
 * to the action and context. `before`/`after` shortcuts push a new popup for the
 * related action with the same context.
 */
export function ActionEntryPoints(props: ActionEntryPointsProps) {
    const { context, variant } = props
    const { actions } = useActions()
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
    const [stack, setStack] = useState<ActionDefinition[]>([])

    const matching = actionsForContext(actions, context)
    if (matching.length === 0) return null

    const open = (action: ActionDefinition) => {
        setMenuAnchor(null)
        setStack([action])
    }

    const navigate = (action: ActionDefinition) => {
        setStack((current) => [...current, action])
    }

    const current = stack.at(-1) ?? null

    const popup = current ? (
        <ActionPopup action={current} context={context} onClose={() => setStack([])} onNavigate={navigate} />
    ) : null

    if (variant === 'menu') {
        return (
            <>
                <Tooltip title="Actions">
                    <IconButton aria-label="Actions" onClick={(event) => setMenuAnchor(event.currentTarget)} size="small">
                        <DotsVertical fontSize="small" />
                    </IconButton>
                </Tooltip>
                <Menu anchorEl={menuAnchor} onClose={() => setMenuAnchor(null)} open={!!menuAnchor}>
                    {matching.map((action) => (
                        <MenuItem key={action.name} onClick={() => open(action)}>
                            {action.label}
                        </MenuItem>
                    ))}
                </Menu>
                {popup}
            </>
        )
    }

    return (
        <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
            {matching.map((action) => (
                <Tooltip key={action.name} title={action.label}>
                    <IconButton aria-label={action.label} onClick={() => open(action)} size="small">
                        <Play fontSize="small" />
                    </IconButton>
                </Tooltip>
            ))}
            {popup}
        </Stack>
    )
}
