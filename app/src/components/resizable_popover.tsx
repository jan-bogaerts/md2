import { Box, Popover } from '@mui/material'
import type { PopoverOrigin, SxProps, Theme } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'

export type ResizeCorner = 'lower-left' | 'lower-right'

interface PopoverSize {
    height?: number
    width?: number
}

interface ResizablePopoverProps {
    anchorElement: HTMLElement | null
    anchorOrigin?: PopoverOrigin
    children: ReactNode
    initialSize: PopoverSize
    labelId: string
    onClose: (reason?: 'backdropClick' | 'escapeKeyDown') => void
    open: boolean
    paperSx?: SxProps<Theme>
    resizeCorner?: ResizeCorner
    resizeFromAllSides?: boolean
    resizeLabel: string
    transformOrigin?: PopoverOrigin
}

const MIN_WIDTH = 280
const MIN_HEIGHT = 200
const HANDLE_SIZE = 16
const EDGE_HANDLE_SIZE = 6
const ALL_RESIZE_DIRECTIONS = ['top', 'right', 'bottom', 'left', 'top-right', 'bottom-right', 'bottom-left', 'top-left'] as const
type ResizeDirection = typeof ALL_RESIZE_DIRECTIONS[number]

function directionCursor(direction: ResizeDirection) {
    if (direction === 'top' || direction === 'bottom') return 'ns-resize'
    if (direction === 'left' || direction === 'right') return 'ew-resize'
    if (direction === 'top-right' || direction === 'bottom-left') return 'nesw-resize'
    return 'nwse-resize'
}

function directionPosition(direction: ResizeDirection) {
    const isCorner = direction.includes('-')
    const touchesTop = direction.startsWith('top')
    const touchesBottom = direction.startsWith('bottom')
    const touchesLeft = direction.endsWith('left') || direction === 'left'
    const touchesRight = direction.endsWith('right') || direction === 'right'

    return {
        bottom: touchesBottom ? 0 : undefined,
        cursor: directionCursor(direction),
        height: isCorner ? HANDLE_SIZE : touchesTop || touchesBottom ? EDGE_HANDLE_SIZE : `calc(100% - ${HANDLE_SIZE * 2}px)`,
        left: touchesLeft ? 0 : direction === 'top' || direction === 'bottom' ? HANDLE_SIZE : undefined,
        right: touchesRight ? 0 : undefined,
        top: touchesTop ? 0 : direction === 'left' || direction === 'right' ? HANDLE_SIZE : undefined,
        width: isCorner ? HANDLE_SIZE : touchesLeft || touchesRight ? EDGE_HANDLE_SIZE : `calc(100% - ${HANDLE_SIZE * 2}px)`,
    }
}

/** An anchored popover with configurable drag handles for resizing its content. */
export function ResizablePopover(props: ResizablePopoverProps) {
    const {
        anchorElement,
        anchorOrigin = { horizontal: 'left', vertical: 'bottom' },
        children,
        initialSize,
        labelId,
        onClose,
        open,
        paperSx,
        resizeCorner = 'lower-right',
        resizeFromAllSides = false,
        resizeLabel,
        transformOrigin = { horizontal: 'left', vertical: 'top' },
    } = props
    const [size, setSize] = useState(initialSize)
    const paperRef = useRef<HTMLDivElement | null>(null)
    const resizeRef = useRef<AbortController | null>(null)

    useEffect(() => () => resizeRef.current?.abort(), [])

    const handleClose = (_event: unknown, reason: 'backdropClick' | 'escapeKeyDown') => {
        resizeRef.current?.abort()
        onClose(reason)
    }

    const startResize = (event: ReactPointerEvent) => {
        event.preventDefault()
        resizeRef.current?.abort()

        if (!paperRef.current) throw new Error('Missing resizable popover paper element')

        const direction = event.currentTarget.getAttribute('data-direction') as ResizeDirection | null
        const controller = new AbortController()
        const bounds = paperRef.current.getBoundingClientRect()
        const start = {
            height: size.height ?? bounds.height,
            width: size.width ?? bounds.width,
            x: event.clientX,
            y: event.clientY,
        }
        resizeRef.current = controller

        window.addEventListener('pointermove', (move: PointerEvent) => {
            const activeDirection = direction ?? (resizeCorner === 'lower-left' ? 'bottom-left' : 'bottom-right')
            const horizontalDelta = move.clientX - start.x
            const verticalDelta = move.clientY - start.y
            const resizesLeft = activeDirection.includes('left')
            const resizesRight = activeDirection.includes('right')
            const resizesTop = activeDirection.includes('top')
            const resizesBottom = activeDirection.includes('bottom')
            const width = Math.max(MIN_WIDTH, start.width + (resizesLeft ? -horizontalDelta : resizesRight ? horizontalDelta : 0))
            const height = Math.max(MIN_HEIGHT, start.height + (resizesTop ? -verticalDelta : resizesBottom ? verticalDelta : 0))

            setSize({ height, width })
        }, { signal: controller.signal })
        window.addEventListener('pointerup', () => controller.abort(), { signal: controller.signal })
    }

    return (
        <Popover
            anchorEl={anchorElement}
            anchorOrigin={anchorOrigin}
            onClose={handleClose}
            open={open}
            slotProps={{
                paper: {
                    'aria-labelledby': labelId,
                    ref: paperRef,
                    role: 'dialog',
                    style: size,
                    sx: [{
                        display: 'flex',
                        maxHeight: 'calc(100vh - 32px)',
                        maxWidth: 'calc(100vw - 32px)',
                        overflow: 'hidden',
                        position: 'relative',
                    }, paperSx] as SxProps<Theme>,
                },
            }}
            transformOrigin={transformOrigin}
        >
            {children}
            {resizeFromAllSides ? ALL_RESIZE_DIRECTIONS.map((direction) => (
                <Box
                    aria-label={`${resizeLabel} from ${direction}`}
                    data-direction={direction}
                    key={direction}
                    onPointerDown={startResize}
                    role="separator"
                    sx={{ ...directionPosition(direction), position: 'absolute', touchAction: 'none' }}
                />
            )) : (
                <Box
                    aria-label={resizeLabel}
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
            )}
        </Popover>
    )
}
