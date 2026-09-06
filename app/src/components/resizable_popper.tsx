import { Box, Paper, Popper, ThemeProvider, useTheme } from '@mui/material'
import type { PopperPlacementType, PopperProps, SxProps, Theme } from '@mui/material'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { dialogService } from '../services/dialog_service'
import { applicationStorage } from '../services/storage/application_storage'
import type { ResizeCorner } from './resizable_popover'

interface PopperSize {
    height?: number
    width?: number
}

interface MinimumPopperSize {
    height: number
    width: number
}

interface PopperPosition {
    left: number
    top: number
}

interface ResizablePopperBaseProps {
    anchorElement: HTMLElement | null
    boundaryElement?: HTMLElement | null
    bottomInset?: number
    children: ReactNode
    constrainSizeToViewport?: boolean
    draggable?: boolean
    focusOnMount?: boolean
    fullHeight?: boolean
    initialSize: PopperSize
    labelId: string
    minimumSize?: MinimumPopperSize
    onActivate?: () => void
    open: boolean
    paperSx?: SxProps<Theme>
    persistSizeOnResizeEndOnly?: boolean
    placement?: PopperPlacementType
    resizeCorner?: ResizeCorner
    resizeFromAllSides?: boolean
    resizeHorizontallyWhenFullHeight?: boolean
    resizeLabel: string
    stackPosition?: number
    storageKey?: string
}

type ResizablePopperProps = ResizablePopperBaseProps & ({
    closeOnEscape: false
    onClose?: never
} | {
    closeOnEscape?: true
    onClose: () => void
})

// Controls that must keep their own click even when they sit inside a drag handle.
// MUI selects render a div[role="combobox"], so native tag names alone are not enough.
const INTERACTIVE_SELECTOR = [
    'button', 'input', 'select', 'textarea', 'a', 'label',
    '[role="button"]', '[role="combobox"]', '[role="option"]', '[role="listbox"]', '[role="tab"]', '[role="switch"]',
    '[contenteditable="true"]',
].join(', ')
const MIN_WIDTH = 280
const MIN_HEIGHT = 200
const DEFAULT_MINIMUM_SIZE = { height: MIN_HEIGHT, width: MIN_WIDTH }
const HANDLE_SIZE = 16
const EDGE_HANDLE_SIZE = 6
const VIEWPORT_MARGIN = 16
const OVERLAY_LAYER_OFFSET = 1
const ALL_RESIZE_DIRECTIONS = ['top', 'right', 'bottom', 'left', 'top-right', 'bottom-right', 'bottom-left', 'top-left'] as const
type ResizeDirection = typeof ALL_RESIZE_DIRECTIONS[number]
const FULL_HEIGHT_RESIZE_DIRECTIONS: ResizeDirection[] = ['left', 'right']

const FLIP_VIEWPORT_MODIFIER = { name: 'flip', options: { padding: VIEWPORT_MARGIN } } as const
const VIEWPORT_POPPER_OPTIONS: NonNullable<PopperProps['popperOptions']> = { strategy: 'fixed' }

function buildViewportModifiers(bottomInset: number, boundaryElement?: HTMLElement | null) {
    const preventViewportOverflowModifier = {
        name: 'preventOverflow',
        options: {
            altAxis: true,
            boundary: boundaryElement ?? 'clippingParents',
            padding: { bottom: bottomInset, left: VIEWPORT_MARGIN, right: VIEWPORT_MARGIN, top: VIEWPORT_MARGIN },
            tether: false,
        },
    } as const
    const flipModifier = boundaryElement
        ? { name: 'flip', options: { boundary: boundaryElement, padding: VIEWPORT_MARGIN } } as const
        : FLIP_VIEWPORT_MODIFIER
    const viewportModifiers: NonNullable<PopperProps['modifiers']> = [preventViewportOverflowModifier, flipModifier]
    const fullHeightViewportModifiers: NonNullable<PopperProps['modifiers']> = [preventViewportOverflowModifier]

    return { fullHeightViewportModifiers, viewportModifiers }
}

function clampSizeToBoundary(
    size: PopperSize,
    minimumSize: MinimumPopperSize,
    bottomInset: number,
    boundaryElement?: HTMLElement | null,
) {
    const boundaryBounds = boundaryElement?.getBoundingClientRect()
    const maximumHeight = Math.max(0, (boundaryBounds?.height ?? window.innerHeight) - VIEWPORT_MARGIN - bottomInset)
    const maximumWidth = Math.max(0, (boundaryBounds?.width ?? window.innerWidth) - VIEWPORT_MARGIN * 2)
    const minimumHeight = Math.min(minimumSize.height, maximumHeight)
    const minimumWidth = Math.min(minimumSize.width, maximumWidth)

    return {
        height: Math.min(Math.max(size.height as number, minimumHeight), maximumHeight),
        width: Math.min(Math.max(size.width as number, minimumWidth), maximumWidth),
    }
}

function loadSize(
    initialSize: PopperSize,
    minimumSize: MinimumPopperSize,
    constrainSizeToViewport: boolean,
    bottomInset: number,
    boundaryElement?: HTMLElement | null,
    storageKey?: string,
): PopperSize {
    if (!storageKey) return initialSize

    const storedValue = applicationStorage.getItem(storageKey)
    if (!storedValue) return initialSize

    try {
        const storedSize = JSON.parse(storedValue) as Partial<PopperSize>
        if (!Number.isFinite(storedSize.height) || !Number.isFinite(storedSize.width)) return initialSize

        const size = {
            height: Math.max(minimumSize.height, storedSize.height as number),
            width: Math.max(minimumSize.width, storedSize.width as number),
        }

        return constrainSizeToViewport || boundaryElement
            ? clampSizeToBoundary(size, minimumSize, bottomInset, boundaryElement)
            : size
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

function clampDetachedLeft(left: number, width: number) {
    return Math.min(Math.max(0, left), Math.max(0, window.innerWidth - width))
}

function clampDetachedTop(top: number, height: number) {
    return Math.min(Math.max(0, top), Math.max(0, window.innerHeight - height))
}

function centeredPosition(size: PopperSize): PopperPosition {
    const width = size.width ?? MIN_WIDTH
    const height = size.height ?? MIN_HEIGHT

    return {
        left: clampDetachedLeft((window.innerWidth - width) / 2, width),
        top: clampDetachedTop((window.innerHeight - height) / 2, height),
    }
}

function extractAppRegionStyle(paperSx?: SxProps<Theme>): CSSProperties {
    if (!paperSx || typeof paperSx !== 'object' || Array.isArray(paperSx)) return {}

    const webkitAppRegion = (paperSx as Record<string, unknown>).WebkitAppRegion
    if (typeof webkitAppRegion !== 'string') return {}

    return { WebkitAppRegion: webkitAppRegion } as CSSProperties
}

/** A non-modal anchored surface with configurable drag handles for resizing its content. */
export function ResizablePopper(props: ResizablePopperProps) {
    const {
        anchorElement,
        boundaryElement,
        bottomInset = VIEWPORT_MARGIN,
        children,
        closeOnEscape = true,
        constrainSizeToViewport = false,
        draggable = false,
        focusOnMount: focusOnMountProp,
        fullHeight = false,
        initialSize,
        labelId,
        minimumSize = DEFAULT_MINIMUM_SIZE,
        onActivate,
        onClose,
        open,
        paperSx,
        persistSizeOnResizeEndOnly = false,
        placement = 'bottom-start',
        resizeCorner = 'lower-right',
        resizeFromAllSides = false,
        resizeHorizontallyWhenFullHeight = false,
        resizeLabel,
        stackPosition,
        storageKey,
    } = props
    const focusOnMount = focusOnMountProp ?? stackPosition !== undefined
    const [size, setSize] = useState(() => loadSize(
        initialSize,
        minimumSize,
        constrainSizeToViewport,
        bottomInset,
        boundaryElement,
        storageKey,
    ))
    const [position, setPosition] = useState<PopperPosition | null>(() => draggable && !anchorElement ? centeredPosition(size) : null)
    const [detachedLeft, setDetachedLeft] = useState<number | null>(null)
    const anchoredLeftRef = useRef<number | null>(null)
    const focusOnMountRef = useRef(focusOnMount)
    const fullHeightRef = useRef(false)
    const paperRef = useRef<HTMLDivElement | null>(null)
    const resizeRef = useRef<AbortController | null>(null)
    const theme = useTheme()
    const { fullHeightViewportModifiers, viewportModifiers } = useMemo(
        () => buildViewportModifiers(bottomInset, boundaryElement),
        [bottomInset, boundaryElement],
    )
    const overlayTheme = useMemo<Theme>(() => ({
        ...theme,
        zIndex: {
            ...theme.zIndex,
            modal: theme.zIndex.modal + (stackPosition ?? 0) + OVERLAY_LAYER_OFFSET,
        },
    }), [stackPosition, theme])

    useEffect(() => () => resizeRef.current?.abort(), [])
    useLayoutEffect(() => {
        if (!boundaryElement) return

        const clampSize = () => setSize((current) => {
            const clamped = clampSizeToBoundary(current, minimumSize, bottomInset, boundaryElement)

            return clamped.height === current.height && clamped.width === current.width ? current : clamped
        })
        clampSize()
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', clampSize)

            return () => window.removeEventListener('resize', clampSize)
        }
        const observer = new ResizeObserver(clampSize)
        observer.observe(boundaryElement)

        return () => observer.disconnect()
    }, [bottomInset, boundaryElement, minimumSize])
    const setPaperElement = useCallback((element: HTMLDivElement | null) => {
        paperRef.current = element
        if (!element || !focusOnMountRef.current) return

        focusOnMountRef.current = false
        element.focus()
    }, [])
    useEffect(() => {
        if (!storageKey || persistSizeOnResizeEndOnly) return

        applicationStorage.setItem(storageKey, JSON.stringify(size))
    }, [persistSizeOnResizeEndOnly, size, storageKey])
    useLayoutEffect(() => {
        if (!fullHeight) {
            fullHeightRef.current = false
            return
        }
        if (!paperRef.current) return

        const bounds = paperRef.current.getBoundingClientRect()
        const width = size.width ?? bounds.width
        const anchoredLeft = anchoredLeftRef.current ?? bounds.left
        const enteredFullHeight = !fullHeightRef.current
        fullHeightRef.current = true
        setDetachedLeft((current) => clampDetachedLeft(enteredFullHeight ? anchoredLeft : current ?? anchoredLeft, width))
    }, [fullHeight, size.width])
    useEffect(() => {
        if (!fullHeight) return

        const handleViewportResize = () => {
            setDetachedLeft((current) => current === null ? current : clampDetachedLeft(current, size.width ?? MIN_WIDTH))
        }
        window.addEventListener('resize', handleViewportResize)

        return () => window.removeEventListener('resize', handleViewportResize)
    }, [fullHeight, size.width])
    useEffect(() => {
        if (!draggable || fullHeight) return

        const handleViewportResize = () => {
            setPosition((current) => current ? {
                left: clampDetachedLeft(current.left, size.width ?? MIN_WIDTH),
                top: clampDetachedTop(current.top, size.height ?? MIN_HEIGHT),
            } : current)
        }
        window.addEventListener('resize', handleViewportResize)

        return () => window.removeEventListener('resize', handleViewportResize)
    }, [draggable, fullHeight, size])

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Escape' || !closeOnEscape) return

        resizeRef.current?.abort()
        onClose?.()
    }

    const handlePaperClickCapture = () => {
        if (fullHeight || !paperRef.current) return

        anchoredLeftRef.current = paperRef.current.getBoundingClientRect().left
    }

    const startDrag = (event: ReactPointerEvent) => {
        onActivate?.()

        try {
            if (!draggable || fullHeight) return

            const target = event.target
            if (!(target instanceof Element) || !target.closest('[data-drag-handle="true"]')) return
            if (target.closest(INTERACTIVE_SELECTOR)) return

            event.preventDefault()
            resizeRef.current?.abort()
            if (!paperRef.current) throw new Error('Missing draggable popper paper element')

            const controller = new AbortController()
            const bounds = paperRef.current.getBoundingClientRect()
            const start = { left: bounds.left, top: bounds.top, x: event.clientX, y: event.clientY }
            resizeRef.current = controller

            window.addEventListener('pointermove', (move: PointerEvent) => {
                const width = size.width ?? bounds.width
                const height = size.height ?? bounds.height
                setPosition({
                    left: clampDetachedLeft(start.left + move.clientX - start.x, width),
                    top: clampDetachedTop(start.top + move.clientY - start.y, height),
                })
            }, { signal: controller.signal })
            window.addEventListener('pointerup', () => controller.abort(), { signal: controller.signal })
        } catch (error) {
            resizeRef.current?.abort()
            dialogService.error(error, { fallbackMessage: 'Popup drag could not be started' })
        }
    }

    const startResize = (event: ReactPointerEvent) => {
        try {
            event.preventDefault()
            resizeRef.current?.abort()

            if (!paperRef.current) throw new Error('Missing resizable popper paper element')

            const direction = event.currentTarget.getAttribute('data-direction') as ResizeDirection | null
            const controller = new AbortController()
            const bounds = paperRef.current.getBoundingClientRect()
            const start = {
                height: size.height ?? bounds.height,
                left: bounds.left,
                top: bounds.top,
                width: size.width ?? bounds.width,
                x: event.clientX,
                y: event.clientY,
            }
            let completedSize = { height: start.height, width: start.width }
            resizeRef.current = controller

            window.addEventListener('pointermove', (move: PointerEvent) => {
                const activeDirection = direction ?? (resizeCorner === 'lower-left' ? 'bottom-left' : 'bottom-right')
                const horizontalDelta = move.clientX - start.x
                const verticalDelta = move.clientY - start.y
                const resizesLeft = activeDirection.includes('left')
                const resizesRight = activeDirection.includes('right')
                const resizesTop = activeDirection.includes('top')
                const resizesBottom = activeDirection.includes('bottom')
                if (fullHeight && (resizesLeft || resizesRight)) {
                    const fixedRight = start.left + start.width
                    const maximumWidth = resizesLeft ? fixedRight : window.innerWidth - start.left
                    const minimumWidth = Math.min(minimumSize.width, maximumWidth)
                    const requestedWidth = start.width + (resizesLeft ? -horizontalDelta : horizontalDelta)
                    const width = Math.min(Math.max(requestedWidth, minimumWidth), maximumWidth)
                    const left = resizesLeft ? fixedRight - width : start.left

                    completedSize = { height: start.height, width }
                    setSize(completedSize)
                    setDetachedLeft(left)
                    return
                }
                const nextSize = {
                    height: Math.max(
                        minimumSize.height,
                        start.height + (resizesTop ? -verticalDelta : resizesBottom ? verticalDelta : 0),
                    ),
                    width: Math.max(
                        minimumSize.width,
                        start.width + (resizesLeft ? -horizontalDelta : resizesRight ? horizontalDelta : 0),
                    ),
                }
                const { height, width } = constrainSizeToViewport || boundaryElement
                    ? clampSizeToBoundary(nextSize, minimumSize, bottomInset, boundaryElement)
                    : nextSize

                completedSize = { height, width }
                setSize({ height, width })
                if (draggable) {
                    const left = resizesLeft ? start.left + start.width - width : start.left
                    const top = resizesTop ? start.top + start.height - height : start.top
                    setPosition({ left: clampDetachedLeft(left, width), top: clampDetachedTop(top, height) })
                }
            }, { signal: controller.signal })
            window.addEventListener('pointerup', () => {
                if (storageKey && persistSizeOnResizeEndOnly) {
                    applicationStorage.setItem(storageKey, JSON.stringify(completedSize))
                }
                controller.abort()
            }, { signal: controller.signal })
        } catch (error) {
            resizeRef.current?.abort()
            dialogService.error(error, { fallbackMessage: 'Popup resize could not be started' })
        }
    }

    const appRegionStyle = extractAppRegionStyle(paperSx)
    const paperStyle: CSSProperties = fullHeight
        ? { ...appRegionStyle, height: '100vh', left: detachedLeft ?? 0, position: 'fixed', top: 0, width: size.width }
        : position
            ? { ...appRegionStyle, ...size, left: position.left, position: 'fixed', top: position.top }
            : { ...appRegionStyle, ...size }
    const detached = position !== null || fullHeight

    return (
        <Popper
            anchorEl={anchorElement ?? (draggable ? document.body : null)}
            modifiers={fullHeight ? fullHeightViewportModifiers : viewportModifiers}
            open={open}
            placement={placement}
            popperOptions={VIEWPORT_POPPER_OPTIONS}
            sx={{
                left: detached ? '0 !important' : undefined,
                top: detached ? '0 !important' : undefined,
                transform: detached ? 'none !important' : undefined,
                zIndex: stackPosition === undefined ? 'modal' : (theme) => theme.zIndex.modal + stackPosition,
            }}
        >
            <Paper
                aria-labelledby={labelId}
                data-full-height={fullHeight ? 'true' : undefined}
                onClickCapture={handlePaperClickCapture}
                onFocusCapture={onActivate}
                onKeyDown={handleKeyDown}
                onPointerDownCapture={startDrag}
                ref={setPaperElement}
                role="dialog"
                style={paperStyle}
                tabIndex={stackPosition === undefined ? undefined : -1}
                sx={[{
                    display: 'flex',
                    maxHeight: fullHeight ? '100vh' : `calc(100vh - ${VIEWPORT_MARGIN + bottomInset}px)`,
                    maxWidth: fullHeight ? '100vw' : 'calc(100vw - 32px)',
                    overflow: 'hidden',
                    position: 'relative',
                }, paperSx] as SxProps<Theme>}
            >
                {stackPosition === undefined
                    ? children
                    : <ThemeProvider theme={overlayTheme}>{children}</ThemeProvider>}
                {fullHeight && resizeHorizontallyWhenFullHeight ? FULL_HEIGHT_RESIZE_DIRECTIONS.map((direction) => (
                    <Box
                        aria-label={`${resizeLabel} from ${direction}`}
                        data-direction={direction}
                        key={direction}
                        onPointerDown={startResize}
                        role="separator"
                        sx={{ ...directionPosition(direction), position: 'absolute', touchAction: 'none' }}
                    />
                )) : !fullHeight && resizeFromAllSides ? ALL_RESIZE_DIRECTIONS.map((direction) => (
                    <Box
                        aria-label={`${resizeLabel} from ${direction}`}
                        data-direction={direction}
                        key={direction}
                        onPointerDown={startResize}
                        role="separator"
                        sx={{ ...directionPosition(direction), position: 'absolute', touchAction: 'none' }}
                    />
                )) : !fullHeight ? (
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
                ) : null}
            </Paper>
        </Popper>
    )
}
