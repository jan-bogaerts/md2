import { Box, Button, Typography } from '@mui/material';
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { JsonDataDocument } from '../../services/json/json_data_document';
import { isJsonPrimitive, type JsonValue } from '../../services/json/json_types';
import { JsonScalarEditor } from './json_scalar_editor';

const DEFAULT_FIELD_NAME_WIDTH = 180;
const DEFAULT_OBJECT_EDITOR_WIDTH = 600;
const FIELD_NAME_KEYBOARD_STEP = 24;
const MIN_FIELD_NAME_WIDTH = 120;
const MIN_VALUE_WIDTH = 160;
const SPLITTER_HIT_TARGET_WIDTH = 12;

interface JsonObjectEditorProps {
    document: JsonDataDocument;
    value: { [key: string]: JsonValue };
}

interface PointerResizeSession {
    pointerId: number;
    startClientX: number;
    startFieldNameWidth: number;
}

function maximumFieldNameWidth(containerWidth: number) {
    return Math.max(MIN_FIELD_NAME_WIDTH, containerWidth - MIN_VALUE_WIDTH);
}

function clampFieldNameWidth(width: number, containerWidth: number) {
    return Math.min(Math.max(width, MIN_FIELD_NAME_WIDTH), maximumFieldNameWidth(containerWidth));
}

/** Object properties in resizable field-name and value columns with immutable names. */
export function JsonObjectEditor({ document, value }: JsonObjectEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const pointerResizeSessionRef = useRef<PointerResizeSession | null>(null);
    const [fieldNameWidth, setFieldNameWidth] = useState(DEFAULT_FIELD_NAME_WIDTH);
    const [fieldNameMaxWidth, setFieldNameMaxWidth] = useState(maximumFieldNameWidth(DEFAULT_OBJECT_EDITOR_WIDTH));
    const [isResizing, setIsResizing] = useState(false);
    const getContainerWidth = useCallback(() => {
        const measuredWidth = containerRef.current?.getBoundingClientRect().width ?? 0;
        return measuredWidth > 0 ? measuredWidth : DEFAULT_OBJECT_EDITOR_WIDTH;
    }, []);
    const resizeToPointer = useCallback((clientX: number) => {
        const pointerResizeSession = pointerResizeSessionRef.current;
        if (!pointerResizeSession) return;
        const containerWidth = getContainerWidth();
        const pointerDelta = clientX - pointerResizeSession.startClientX;
        setFieldNameMaxWidth(maximumFieldNameWidth(containerWidth));
        setFieldNameWidth(clampFieldNameWidth(pointerResizeSession.startFieldNameWidth + pointerDelta, containerWidth));
    }, [getContainerWidth]);
    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        const containerWidth = getContainerWidth();
        pointerResizeSessionRef.current = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startFieldNameWidth: fieldNameWidth,
        };
        setFieldNameMaxWidth(maximumFieldNameWidth(containerWidth));
        setIsResizing(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (pointerResizeSessionRef.current?.pointerId === event.pointerId) resizeToPointer(event.clientX);
    };
    const finishPointerResize = (event: PointerEvent<HTMLDivElement>) => {
        if (pointerResizeSessionRef.current?.pointerId !== event.pointerId) return;
        resizeToPointer(event.clientX);
        pointerResizeSessionRef.current = null;
        setIsResizing(false);
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const containerWidth = getContainerWidth();
        setFieldNameMaxWidth(maximumFieldNameWidth(containerWidth));
        const widthsByKey: Record<string, number> = {
            ArrowLeft: fieldNameWidth - FIELD_NAME_KEYBOARD_STEP,
            ArrowRight: fieldNameWidth + FIELD_NAME_KEYBOARD_STEP,
            End: maximumFieldNameWidth(containerWidth),
            Home: MIN_FIELD_NAME_WIDTH,
        };
        const nextWidth = widthsByKey[event.key];
        if (nextWidth === undefined) return;
        event.preventDefault();
        setFieldNameWidth(clampFieldNameWidth(nextWidth, containerWidth));
    };
    const fieldEntries = Object.entries(value);

    return (
        <Box sx={{ p: 2 }}>
            <Box
                aria-label="Object fields"
                ref={containerRef}
                role="group"
                sx={{
                    display: 'grid',
                    gridTemplateColumns: `${fieldNameWidth}px minmax(0, 1fr)`,
                    minWidth: 0,
                    position: 'relative',
                    '& .MuiTextField-root': { minWidth: 0, width: '100%' },
                }}
            >
                <Typography
                    color="custom.colHead"
                    role="columnheader"
                    sx={{ borderBottom: 1, borderColor: 'divider', px: 1, py: 0.75 }}
                    variant="overline"
                >
                    Field
                </Typography>
                <Typography
                    color="custom.colHead"
                    role="columnheader"
                    sx={{ borderBottom: 1, borderColor: 'divider', px: 1, py: 0.75 }}
                    variant="overline"
                >
                    Value
                </Typography>
                <Box
                    aria-label="Resize field name column"
                    aria-orientation="vertical"
                    aria-valuemax={fieldNameMaxWidth}
                    aria-valuemin={MIN_FIELD_NAME_WIDTH}
                    aria-valuenow={Math.round(fieldNameWidth)}
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
                        left: `calc(${fieldNameWidth}px - ${SPLITTER_HIT_TARGET_WIDTH / 2}px)`,
                        outline: 'none',
                        position: 'absolute',
                        top: 0,
                        touchAction: 'none',
                        width: SPLITTER_HIT_TARGET_WIDTH,
                        zIndex: 1,
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
                {fieldEntries.map(([key, fieldValue]) => {
                    const handleOpen = () => document.drillInto(key);
                    const location = [...document.getSnapshot().location, key];
                    const cellSx = { borderBottom: 1, borderColor: 'divider', minWidth: 0, px: 1, py: 1 };

                    return (
                        <Box key={key} sx={{ display: 'contents' }}>
                            <Typography color="text.secondary" sx={cellSx} variant="caption">{key}</Typography>
                            <Box sx={cellSx}>
                                {isJsonPrimitive(fieldValue) ? (
                                    <JsonScalarEditor
                                        accessibleName={key}
                                        document={document}
                                        location={location}
                                        value={fieldValue}
                                    />
                                ) : (
                                    <Button
                                        onClick={handleOpen}
                                        sx={{ minWidth: 0, p: 0, textDecoration: 'underline' }}
                                        variant="text"
                                    >
                                        Open {Array.isArray(fieldValue) ? `array (${fieldValue.length})` : 'object'}
                                    </Button>
                                )}
                            </Box>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}
