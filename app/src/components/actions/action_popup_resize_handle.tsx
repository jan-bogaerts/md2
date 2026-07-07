import { Box } from '@mui/material'
import type { PointerEvent as ReactPointerEvent } from 'react'

export type ResizeCorner = 'lower-left' | 'lower-right'

const HANDLE_SIZE = 16

interface ActionPopupResizeHandleProps {
    corner: ResizeCorner
    onPointerDown: (event: ReactPointerEvent) => void
}

/** Presentation-only resize handle for the action popup. */
export function ActionPopupResizeHandle(props: ActionPopupResizeHandleProps) {
    const { corner, onPointerDown } = props

    return (
        <Box
            aria-label="Resize action popup"
            data-corner={corner}
            onPointerDown={onPointerDown}
            role="separator"
            sx={{
                bottom: 0,
                cursor: corner === 'lower-left' ? 'nesw-resize' : 'nwse-resize',
                height: HANDLE_SIZE,
                left: corner === 'lower-left' ? 0 : undefined,
                position: 'absolute',
                right: corner === 'lower-right' ? 0 : undefined,
                touchAction: 'none',
                width: HANDLE_SIZE,
            }}
        />
    )
}
