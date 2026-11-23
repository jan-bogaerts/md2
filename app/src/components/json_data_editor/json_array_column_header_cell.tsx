import { Box, TableCell } from '@mui/material';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { JSON_ARRAY_MIN_COLUMN_WIDTH, type JsonDataDocument } from '../../services/json/json_data_document';

const COLUMN_KEYBOARD_STEP = 24;
const SEPARATOR_HIT_TARGET_WIDTH = 12;

interface JsonArrayColumnHeaderCellProps {
    column: string;
    document: JsonDataDocument;
    width: number;
}

interface PointerResizeSession {
    pointerId: number;
    startClientX: number;
    startWidth: number;
}

/** Data column header with a keyboard- and pointer-resizable boundary. */
export function JsonArrayColumnHeaderCell({ column, document, width }: JsonArrayColumnHeaderCellProps) {
    const pointerResizeSessionRef = useRef<PointerResizeSession | null>(null);
    const [isResizing, setIsResizing] = useState(false);
    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        pointerResizeSessionRef.current = { pointerId: event.pointerId, startClientX: event.clientX, startWidth: width };
        setIsResizing(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        const session = pointerResizeSessionRef.current;
        if (session?.pointerId !== event.pointerId) return;
        document.setArrayColumnWidth(column, session.startWidth + event.clientX - session.startClientX);
    };
    const finishPointerResize = (event: PointerEvent<HTMLDivElement>) => {
        if (pointerResizeSessionRef.current?.pointerId !== event.pointerId) return;
        pointerResizeSessionRef.current = null;
        setIsResizing(false);
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const widthsByKey: Record<string, number> = {
            ArrowLeft: width - COLUMN_KEYBOARD_STEP,
            ArrowRight: width + COLUMN_KEYBOARD_STEP,
            Home: JSON_ARRAY_MIN_COLUMN_WIDTH,
        };
        const nextWidth = widthsByKey[event.key];
        if (nextWidth === undefined) return;
        event.preventDefault();
        document.setArrayColumnWidth(column, nextWidth);
    };

    return (
        <TableCell
            style={{ width }}
            sx={{ bgcolor: 'background.paper', boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
            {column}
            <Box
                aria-label={`Resize ${column} column`}
                aria-orientation="vertical"
                aria-valuemin={JSON_ARRAY_MIN_COLUMN_WIDTH}
                aria-valuenow={Math.round(width)}
                onKeyDown={handleKeyDown}
                onLostPointerCapture={finishPointerResize}
                onPointerCancel={finishPointerResize}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishPointerResize}
                role="separator"
                sx={{
                    bottom: 0,
                    cursor: 'col-resize',
                    outline: 'none',
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    touchAction: 'none',
                    width: SEPARATOR_HIT_TARGET_WIDTH,
                    '&::before': {
                        bgcolor: isResizing ? 'primary.main' : 'divider',
                        bottom: 0,
                        content: '""',
                        left: '50%',
                        position: 'absolute',
                        top: 0,
                        transform: 'translateX(-50%)',
                        width: '1px',
                    },
                    '&:hover::before, &:focus-visible::before': { bgcolor: 'primary.main' },
                }}
                tabIndex={0}
            />
        </TableCell>
    );
}
