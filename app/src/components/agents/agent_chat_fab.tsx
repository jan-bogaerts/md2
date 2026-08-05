import { Fab, Tooltip } from '@mui/material'
import RobotOutline from 'mdi-material-ui/RobotOutline'
import { useRef, useState } from 'react'
import type { MouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { projectContext } from '../../data/action_context'
import { ActionPopup } from '../actions/run/popup/action_popup'

const FAB_MARGIN = 16
const FAB_SIZE = 56
const DRAG_THRESHOLD = 5
const PROJECT_CONTEXT = projectContext()

interface FabPosition {
    left: number
    top: number
}

interface DragState extends FabPosition {
    dragged: boolean
    pointerId: number
    startX: number
    startY: number
}

function initialPosition(): FabPosition {
    return {
        left: Math.max(FAB_MARGIN, window.innerWidth - FAB_SIZE - FAB_MARGIN),
        top: Math.max(FAB_MARGIN, window.innerHeight - FAB_SIZE - FAB_MARGIN),
    }
}

function clampPosition(left: number, top: number): FabPosition {
    return {
        left: Math.min(Math.max(left, FAB_MARGIN), Math.max(FAB_MARGIN, window.innerWidth - FAB_SIZE - FAB_MARGIN)),
        top: Math.min(Math.max(top, FAB_MARGIN), Math.max(FAB_MARGIN, window.innerHeight - FAB_SIZE - FAB_MARGIN)),
    }
}

/** Project-wide free-form agent launcher, movable anywhere in application viewport. */
export function AgentChatFab() {
    const [position, setPosition] = useState(initialPosition)
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const dragRef = useRef<DragState | null>(null)

    const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
        dragRef.current = {
            ...position,
            dragged: false,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
        }
        event.currentTarget.setPointerCapture?.(event.pointerId)
    }

    const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return

        const deltaX = event.clientX - drag.startX
        const deltaY = event.clientY - drag.startY
        if (!drag.dragged && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return

        drag.dragged = true
        setAnchorElement(null)
        setPosition(clampPosition(drag.left + deltaX, drag.top + deltaY))
    }

    const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (dragRef.current?.pointerId !== event.pointerId) return

        event.currentTarget.releasePointerCapture?.(event.pointerId)
    }

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
        if (dragRef.current?.dragged) {
            event.preventDefault()
            dragRef.current = null
            return
        }

        dragRef.current = null
        const nextAnchorElement = event.currentTarget
        setAnchorElement((current) => current ? null : nextAnchorElement)
    }

    const handleClose = () => {
        setAnchorElement(null)
    }

    return (
        <>
            <Tooltip title="Project agent">
                <Fab
                    aria-label="Project agent"
                    color="primary"
                    onClick={handleClick}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    sx={{ left: position.left, position: 'fixed', top: position.top, touchAction: 'none', zIndex: 'appBar' }}
                >
                    <RobotOutline />
                </Fab>
            </Tooltip>
            {anchorElement ? (
                <ActionPopup
                    anchorElement={anchorElement}
                    context={PROJECT_CONTEXT}
                    draggable
                    onClose={handleClose}
                />
            ) : null}
        </>
    )
}
