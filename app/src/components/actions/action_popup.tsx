import { Box, Button, Dialog, Divider, Stack, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import { runActionStub, type ActionRunResult } from '../../services/action_run_stub'

/** Which lower corner the resize handle sits in, chosen by the popup's screen position. */
export type ResizeCorner = 'lower-left' | 'lower-right'

const MIN_WIDTH = 280
const MIN_HEIGHT = 200
const DEFAULT_WIDTH = 420
const DEFAULT_HEIGHT = 320
const HANDLE_SIZE = 16

interface ActionPopupProps {
    action: ActionDefinition
    context: ActionContext
    /** Open a new popup for a related (`before`/`after`) action with the same context. */
    onNavigate: (action: ActionDefinition) => void
    onClose: () => void
    /** Lower corner to place the resize handle; defaults to lower-right. */
    resizeCorner?: ResizeCorner
}

interface RelatedActionsProps {
    actions: ActionDefinition[]
    label: string
    onNavigate: (action: ActionDefinition) => void
}

function RelatedActions(props: RelatedActionsProps) {
    if (props.actions.length === 0) return null

    return (
        <Box>
            <Typography color="text.secondary" variant="caption">
                {props.label}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mt: 0.5 }}>
                {props.actions.map((action) => (
                    <Button key={action.name} onClick={() => props.onNavigate(action)} size="small" variant="outlined">
                        {action.label}
                    </Button>
                ))}
            </Stack>
        </Box>
    )
}

/**
 * The execution surface for a selected action and context: a resizable popup with
 * a `Run` command (stubbed until F-010c) and shortcuts to the action's `before`
 * and `after` actions. Activating a shortcut opens a new popup for that action.
 */
export function ActionPopup(props: ActionPopupProps) {
    const { action, context, onClose, onNavigate } = props
    const resizeCorner = props.resizeCorner ?? 'lower-right'
    const [size, setSize] = useState({ height: DEFAULT_HEIGHT, width: DEFAULT_WIDTH })
    const [runResult, setRunResult] = useState<ActionRunResult | null>(null)
    const resizeRef = useRef<AbortController | null>(null)

    useEffect(() => () => resizeRef.current?.abort(), [])

    const handleRun = () => {
        setRunResult(runActionStub(action, context))
    }

    const startResize = (event: ReactPointerEvent) => {
        event.preventDefault()
        resizeRef.current?.abort()
        const controller = new AbortController()
        resizeRef.current = controller
        const start = { height: size.height, width: size.width, x: event.clientX, y: event.clientY }

        window.addEventListener('pointermove', (move: PointerEvent) => {
            const dx = move.clientX - start.x
            const dy = move.clientY - start.y
            const widthDelta = resizeCorner === 'lower-left' ? -dx : dx

            setSize({
                height: Math.max(MIN_HEIGHT, start.height + dy),
                width: Math.max(MIN_WIDTH, start.width + widthDelta),
            })
        }, { signal: controller.signal })
        window.addEventListener('pointerup', () => controller.abort(), { signal: controller.signal })
    }

    return (
        <Dialog
            onClose={onClose}
            open
            slotProps={{ paper: { style: { height: size.height, width: size.width }, sx: { m: 2, position: 'relative' } } }}
        >
            <Stack spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
                <Box>
                    <Typography variant="h6">{action.label}</Typography>
                    {action.description ? (
                        <Typography color="text.secondary" variant="body2">
                            {action.description}
                        </Typography>
                    ) : null}
                </Box>

                <Stack direction="row" spacing={1}>
                    <Button onClick={handleRun} variant="contained">
                        Run
                    </Button>
                    <Button onClick={onClose}>Close</Button>
                </Stack>

                {runResult ? (
                    <Typography color="warning.main" role="status" variant="body2">
                        {runResult.message}
                    </Typography>
                ) : null}

                <Divider />

                <RelatedActions actions={action.before} label="Before" onNavigate={onNavigate} />
                <RelatedActions actions={action.after} label="After" onNavigate={onNavigate} />
            </Stack>

            <Box
                aria-label="Resize action popup"
                data-corner={resizeCorner}
                onPointerDown={startResize}
                role="separator"
                sx={{
                    bottom: 0,
                    cursor: resizeCorner === 'lower-left' ? 'nesw-resize' : 'nwse-resize',
                    height: HANDLE_SIZE,
                    left: resizeCorner === 'lower-left' ? 0 : undefined,
                    position: 'absolute',
                    right: resizeCorner === 'lower-right' ? 0 : undefined,
                    touchAction: 'none',
                    width: HANDLE_SIZE,
                }}
            />
        </Dialog>
    )
}
