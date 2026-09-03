import { Box, Fab, Tooltip } from '@mui/material';
import { useRef, useState } from 'react';
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
    onActivate: (anchorElement: HTMLElement) => void;
    onDragStart?: () => void;
    tooltip: string;
}

function initialPosition(): FabPosition {
    return {
        left: Math.max(FAB_MARGIN, window.innerWidth - FAB_SIZE - FAB_MARGIN),
        top: Math.max(FAB_MARGIN, window.innerHeight - FAB_SIZE - FAB_MARGIN),
    };
}

function clampPosition(left: number, top: number): FabPosition {
    return {
        left: Math.min(Math.max(left, FAB_MARGIN), Math.max(FAB_MARGIN, window.innerWidth - FAB_SIZE - FAB_MARGIN)),
        top: Math.min(Math.max(top, FAB_MARGIN), Math.max(FAB_MARGIN, window.innerHeight - FAB_SIZE - FAB_MARGIN)),
    };
}

/** Primary floating launcher with viewport-bounded pointer dragging and click-after-drag suppression. */
export function MovableFab({ ariaLabel, children, disabled = false, onActivate, onDragStart, tooltip }: MovableFabProps) {
    const [position, setPosition] = useState(initialPosition);
    const dragRef = useRef<DragState | null>(null);

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
                >
                    {children}
                </Fab>
            </Box>
        </Tooltip>
    );
}
