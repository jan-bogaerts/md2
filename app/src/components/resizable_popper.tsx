import { Box, Paper, Popper } from '@mui/material'
import type { PopperPlacementType, SxProps, Theme } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { ResizeCorner } from './resizable_popover'

interface PopperSize {
    height?: number
    width?: number
}

interface ResizablePopperProps {
    anchorElement: HTMLElement | null
    children: ReactNode
    initialSize: PopperSize
    labelId: string
    onClose: () => void
    open: boolean
    paperSx?: SxProps<Theme>
    placement?: PopperPlacementType
    resizeCorner?: ResizeCorner
    resizeFromAllSides?: boolean
    resizeLabel: string
    storageKey?: string
}

const MIN_WIDTH = 280
const MIN_HEIGHT = 200
const HANDLE_SIZE = 16
const EDGE_HANDLE_SIZE = 6
const ALL_RESIZE_DIRECTIONS = ['top', 'right', 'bottom', 'left', 'top-right', 'bottom-right', 'bottom-left', 'top-left'] as const
type ResizeDirection = typeof ALL_RESIZE_DIRECTIONS[number]

function loadSize(initialSize: PopperSize, storageKey?: string): PopperSize {
    if (!storageKey) return initialSize

    const storedValue = window.localStorage.getItem(storageKey)
    if (!storedValue) return initialSize

    try {
        const storedSize = JSON.parse(storedValue) as Partial<PopperSize>
        if (!Number.isFinite(storedSize.height) || !Number.isFinite(storedSize.width)) return initialSize

        return {
            height: Math.max(MIN_HEIGHT, storedSize.height as number),
            width: Math.max(MIN_WIDTH, storedSize.width as number),
        }
    } catch {
        return initialSize
    }
}

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

/** A non-modal anchored surface with configurable drag handles for resizing its content. */
export function ResizablePopper(props: ResizablePopperProps) {
    const {
        anchorElement,
        children,
        initialSize,
        labelId,
        onClose,
        open,
        paperSx,
        placement = 'bottom-start',
        resizeCorner = 'lower-right',
        resizeFromAllSides = false,
        resizeLabel,
        storageKey,
    } = props
    const [size, setSize] = useState(() => loadSize(initialSize, storageKey))
    const paperRef = useRef<HTMLDivElement | null>(null)
    const resizeRef = useRef<AbortController | null>(null)

    useEffect(() => () => resizeRef.current?.abort(), [])
    useEffect(() => {
        if (!storageKey) return

        window.localStorage.setItem(storageKey, JSON.stringify(size))
    }, [size, storageKey])

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Escape') return

        resizeRef.current?.abort()
        onClose()
    }

    const startResize = (event: ReactPointerEvent) => {
        event.preventDefault()
        resizeRef.current?.abort()

        if (!paperRef.current) throw new Error('Missing resizable popper paper element')

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
        <Popper anchorEl={anchorElement} open={open} placement={placement} sx={{ zIndex: 'modal' }}>
            <Paper
                aria-labelledby={labelId}
                onKeyDown={handleKeyDown}
                ref={paperRef}
                role="dialog"
                style={size}
                sx={[{
                    display: 'flex',
                    maxHeight: 'calc(100vh - 32px)',
                    maxWidth: 'calc(100vw - 32px)',
                    overflow: 'hidden',
                    position: 'relative',
                }, paperSx] as SxProps<Theme>}
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
            </Paper>
        </Popper>
    )
}
