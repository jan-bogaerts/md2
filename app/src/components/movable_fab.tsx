import { Box, Fab, Tooltip } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactNode, PointerEvent as ReactPointerEvent } from 'react';

const FAB_MARGIN = 16;
const FAB_SIZE = 56;
const DRAG_THRESHOLD = 5;

interface FabPosition {
    left: number;
    top: number;
}

interface DragState extends FabPosition {
    dragged: boolean;
    pointerId: number;
    startX: number;
    startY: number;
}

interface MovableFabProps {
    ariaLabel: string;
    children: ReactNode;
    disabled?: boolean;
    fabSx?: SxProps<Theme>;
    onActivate: (anchorElement: HTMLElement) => void;
    onDragStart?: () => void;
    tooltip: string;
}

function initialPosition(): FabPosition {
    return clampPosition(window.innerWidth - FAB_SIZE - FAB_MARGIN, window.innerHeight - FAB_SIZE - FAB_MARGIN);
}

function clampAxisPosition(position: number, viewportSize: number) {
    const availableSpace = Math.max(0, viewportSize - FAB_SIZE);
    const margin = Math.min(FAB_MARGIN, availableSpace / 2);

    return Math.min(Math.max(position, margin), availableSpace - margin);
}

function clampPosition(left: number, top: number): FabPosition {
    return {
        left: clampAxisPosition(left, window.innerWidth),
        top: clampAxisPosition(top, window.innerHeight),
    };
}

/** Primary floating launcher with viewport-bounded pointer dragging and click-after-drag suppression. */
export function MovableFab({ ariaLabel, children, disabled = false, fabSx, onActivate, onDragStart, tooltip }: MovableFabProps) {
    const [position, setPosition] = useState(initialPosition);
    const dragRef = useRef<DragState | null>(null);
    const handleResize = useCallback(() => {
        setPosition((current) => {
            const clamped = clampPosition(current.left, current.top);

            return clamped.left === current.left && clamped.top === current.top ? current : clamped;
        });
    }, []);

    useEffect(() => {
        window.addEventListener('resize', handleResize);

        return () => window.removeEventListener('resize', handleResize);
    }, [handleResize]);

    const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
        dragRef.current = {
            ...position,
            dragged: false,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        const deltaX = event.clientX - drag.startX;
        const deltaY = event.clientY - drag.startY;
        if (!drag.dragged && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
        if (!drag.dragged) onDragStart?.();

        drag.dragged = true;
        setPosition(clampPosition(drag.left + deltaX, drag.top + deltaY));
    };

    const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
    };

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
        if (dragRef.current?.dragged) {
            event.preventDefault();
            dragRef.current = null;

            return;
        }

        dragRef.current = null;
        onActivate(event.currentTarget);
    };

    return (
        <Tooltip title={tooltip}>
            <Box
                component="span"
                data-testid="movable-fab-position"
                sx={{ left: position.left, position: 'fixed', top: position.top, touchAction: 'none', zIndex: 'appBar' }}
            >
                <Fab
                    aria-label={ariaLabel}
                    color="primary"
                    disabled={disabled}
                    onClick={handleClick}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    sx={fabSx}
                >
                    {children}
                </Fab>
            </Box>
        </Tooltip>
    );
}
