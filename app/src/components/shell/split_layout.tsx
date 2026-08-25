import { Box } from '@mui/material'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { dialogService } from '../../services/dialog_service'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import { applicationStorage } from '../../services/storage/application_storage'

export const SPLIT_WIDTH_STORAGE_KEY = 'md2.splitWidth'
const MIN_LEFT_WIDTH = 160
const MAX_LEFT_WIDTH_RATIO = 0.8
const DEFAULT_LEFT_WIDTH = 280
const SEPARATOR_WIDTH = 6
const KEYBOARD_RESIZE_STEP = 24

interface SplitLayoutProps {
    left: ReactNode
    right: ReactNode
}

function readStoredWidth(): number {
    const storedValue = applicationStorage.getItem(SPLIT_WIDTH_STORAGE_KEY)
    const parsedValue = storedValue ? Number.parseInt(storedValue, 10) : Number.NaN
    return Number.isNaN(parsedValue) ? DEFAULT_LEFT_WIDTH : parsedValue
}

function clampWidth(proposedWidth: number, containerWidth: number): number {
    const maxWidth = Math.max(MIN_LEFT_WIDTH, containerWidth * MAX_LEFT_WIDTH_RATIO)
    return Math.min(Math.max(proposedWidth, MIN_LEFT_WIDTH), maxWidth)
}

function maxWidth(containerWidth: number): number {
    return Math.max(MIN_LEFT_WIDTH, containerWidth * MAX_LEFT_WIDTH_RATIO)
}

/** Desktop body layout: a left and right panel separated by a draggable splitter. */
export function SplitLayout(props: SplitLayoutProps) {
    const { left, right } = props
    const hasLeftPanel = left !== null
    const containerRef = useRef<HTMLDivElement>(null)
    const missingContainerReportedRef = useRef(false)
    const [leftWidth, setLeftWidth] = useState(readStoredWidth)
    const [isDragging, setIsDragging] = useState(false)
    const [separatorMaxWidth, setSeparatorMaxWidth] = useState<number | undefined>(undefined)

    useEffect(() => {
        const updateVisibility = () => {
            const container = containerRef.current
            if (!container) {
                if (!missingContainerReportedRef.current) {
                    missingContainerReportedRef.current = true
                    dialogService.error(new Error('Missing split layout container'), {fallbackMessage: 'Split layout could not be displayed'})
                }
                return
            }

            container.style.display = workspaceViewService.getSnapshot().viewMode === 'text' ? 'flex' : 'none'
        }

        updateVisibility()
        workspaceViewService.addEventListener('changed', updateVisibility)

        return () => workspaceViewService.removeEventListener('changed', updateVisibility)
    }, [])

    const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault()
        if (containerRef.current) setSeparatorMaxWidth(maxWidth(containerRef.current.getBoundingClientRect().width))
        setIsDragging(true)
        event.currentTarget.setPointerCapture?.(event.pointerId)
    }, [])

    const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDragging || !containerRef.current) return

        const bounds = containerRef.current.getBoundingClientRect()
        setSeparatorMaxWidth(maxWidth(bounds.width))
        setLeftWidth(clampWidth(event.clientX - bounds.left, bounds.width))
    }, [isDragging])

    const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDragging) return

        setIsDragging(false)
        event.currentTarget.releasePointerCapture?.(event.pointerId)
        setLeftWidth((currentWidth) => {
            applicationStorage.setItem(SPLIT_WIDTH_STORAGE_KEY, String(Math.round(currentWidth)))
            return currentWidth
        })
    }, [isDragging])

    const handleSeparatorKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (!containerRef.current) return

        const bounds = containerRef.current.getBoundingClientRect()
        setSeparatorMaxWidth(maxWidth(bounds.width))
        const nextWidthByKey: Record<string, number> = {
            ArrowLeft: leftWidth - KEYBOARD_RESIZE_STEP,
            ArrowRight: leftWidth + KEYBOARD_RESIZE_STEP,
            End: maxWidth(bounds.width),
            Home: MIN_LEFT_WIDTH,
        }
        const nextWidth = nextWidthByKey[event.key]
        if (nextWidth === undefined) return

        event.preventDefault()
        const clampedWidth = clampWidth(nextWidth, bounds.width)
        setLeftWidth(clampedWidth)
        applicationStorage.setItem(SPLIT_WIDTH_STORAGE_KEY, String(Math.round(clampedWidth)))
    }, [leftWidth])

    return (
        <Box ref={containerRef} sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <Box hidden={!hasLeftPanel} sx={{ flexShrink: 0, minWidth: 0, overflow: 'auto', width: leftWidth }}>
                {left}
            </Box>
            <Box
                aria-label="Resize panels"
                aria-orientation="vertical"
                aria-valuemax={separatorMaxWidth}
                aria-valuemin={MIN_LEFT_WIDTH}
                aria-valuenow={Math.round(leftWidth)}
                onKeyDown={handleSeparatorKeyDown}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                role="separator"
                hidden={!hasLeftPanel}
                sx={{
                    bgcolor: isDragging ? 'primary.main' : 'divider',
                    cursor: 'col-resize',
                    flexShrink: 0,
                    width: SEPARATOR_WIDTH,
                    '&:hover': { bgcolor: 'primary.main' },
                }}
                tabIndex={hasLeftPanel ? 0 : -1}
            />
            <Box sx={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
                {right}
            </Box>
        </Box>
    )
}
