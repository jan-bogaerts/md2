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
    onClose: () => void
    open: boolean
    paperSx?: SxProps<Theme>
    resizeCorner?: ResizeCorner
    resizeLabel: string
    transformOrigin?: PopoverOrigin
}

const MIN_WIDTH = 280
const MIN_HEIGHT = 200
const HANDLE_SIZE = 16

/** An anchored popover whose lower corner can be dragged to resize its content. */
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
        resizeLabel,
        transformOrigin = { horizontal: 'left', vertical: 'top' },
    } = props
    const [size, setSize] = useState(initialSize)
    const paperRef = useRef<HTMLDivElement | null>(null)
    const resizeRef = useRef<AbortController | null>(null)

    useEffect(() => () => resizeRef.current?.abort(), [])

    const handleClose = () => {
        resizeRef.current?.abort()
        onClose()
    }

    const startResize = (event: ReactPointerEvent) => {
        event.preventDefault()
        resizeRef.current?.abort()

        if (!paperRef.current) throw new Error('Missing resizable popover paper element')

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
            const widthDelta = resizeCorner === 'lower-left' ? start.x - move.clientX : move.clientX - start.x
            setSize({
                height: Math.max(MIN_HEIGHT, start.height + move.clientY - start.y),
                width: Math.max(MIN_WIDTH, start.width + widthDelta),
            })
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
        </Popover>
    )
}
