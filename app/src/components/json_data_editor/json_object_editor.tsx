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
const SPLITTER_WIDTH = 6;

interface JsonObjectEditorProps {
    document: JsonDataDocument;
    value: { [key: string]: JsonValue };
}

function maximumFieldNameWidth(containerWidth: number) {
    return Math.max(MIN_FIELD_NAME_WIDTH, containerWidth - MIN_VALUE_WIDTH - SPLITTER_WIDTH);
}

function clampFieldNameWidth(width: number, containerWidth: number) {
    return Math.min(Math.max(width, MIN_FIELD_NAME_WIDTH), maximumFieldNameWidth(containerWidth));
}

/** Object properties in resizable field-name and value columns with immutable names. */
export function JsonObjectEditor({ document, value }: JsonObjectEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [fieldNameWidth, setFieldNameWidth] = useState(DEFAULT_FIELD_NAME_WIDTH);
    const [fieldNameMaxWidth, setFieldNameMaxWidth] = useState(maximumFieldNameWidth(DEFAULT_OBJECT_EDITOR_WIDTH));
    const [isResizing, setIsResizing] = useState(false);
    const getContainerWidth = useCallback(() => {
        const measuredWidth = containerRef.current?.getBoundingClientRect().width ?? 0;
        return measuredWidth > 0 ? measuredWidth : DEFAULT_OBJECT_EDITOR_WIDTH;
    }, []);
    const resizeToPointer = useCallback((clientX: number) => {
        const bounds = containerRef.current?.getBoundingClientRect();
        if (!bounds) return;
        setFieldNameMaxWidth(maximumFieldNameWidth(bounds.width));
        setFieldNameWidth(clampFieldNameWidth(clientX - bounds.left, bounds.width));
    }, []);
    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsResizing(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (isResizing) resizeToPointer(event.clientX);
    };
    const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
        if (!isResizing) return;
        resizeToPointer(event.clientX);
        setIsResizing(false);
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };
    const handleLostPointerCapture = () => setIsResizing(false);
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
        <Box
            aria-label="Object fields"
            ref={containerRef}
            role="group"
            sx={{
                alignItems: 'center',
                display: 'grid',
                gap: 1.5,
                gridTemplateColumns: `${fieldNameWidth}px ${SPLITTER_WIDTH}px minmax(0, 1fr)`,
                p: 2,
            }}
        >
            <Box
                aria-label="Resize field name column"
                aria-orientation="vertical"
                aria-valuemax={fieldNameMaxWidth}
                aria-valuemin={MIN_FIELD_NAME_WIDTH}
                aria-valuenow={Math.round(fieldNameWidth)}
                onKeyDown={handleKeyDown}
                onLostPointerCapture={handleLostPointerCapture}
                onPointerCancel={handlePointerUp}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                role="separator"
                sx={{
                    alignSelf: 'stretch',
                    bgcolor: isResizing ? 'primary.main' : 'divider',
                    cursor: 'col-resize',
                    gridColumn: 2,
                    gridRow: `1 / span ${Math.max(fieldEntries.length, 1)}`,
                    touchAction: 'none',
                    '&:hover, &:focus-visible': { bgcolor: 'primary.main' },
                }}
                tabIndex={0}
            />
            {fieldEntries.map(([key, fieldValue], index) => {
                const handleOpen = () => document.drillInto(key);
                const location = [...document.getSnapshot().location, key];
                const row = index + 1;

                return (
                    <Box key={key} sx={{ display: 'contents' }}>
                        <Typography color="text.secondary" sx={{ gridColumn: 1, gridRow: row }} variant="caption">{key}</Typography>
                        <Box sx={{ gridColumn: 3, gridRow: row, minWidth: 0 }}>
                            {isJsonPrimitive(fieldValue) ? (
                                <JsonScalarEditor
                                    accessibleName={key}
                                    document={document}
                                    location={location}
                                    value={fieldValue}
                                />
                            ) : (
                                <Button onClick={handleOpen} variant="outlined">
                                    Open {Array.isArray(fieldValue) ? `array (${fieldValue.length})` : 'object'}
                                </Button>
                            )}
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
}
