import { Box } from '@mui/material';
import { useSyncExternalStore } from 'react';
import {
    diagramSelectionService,
    type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service';

interface DiagramSelectionRectangleProps {
    selection?: DiagramSelectionService;
}

/** Renders only transient rectangle view state and observes no selection membership or diagram data. */
export function DiagramSelectionRectangle({selection = diagramSelectionService}: DiagramSelectionRectangleProps) {
    const rectangle = useSyncExternalStore(
        selection.subscribeRectangle,
        selection.getRectangleSnapshot,
        selection.getRectangleSnapshot,
    );
    if (!rectangle) return null;

    return (
        <Box
            aria-hidden="true"
            data-testid="diagram-selection-rectangle"
            sx={{
                bgcolor: 'custom.primaryBg',
                border: '1px dashed',
                borderColor: 'primary.main',
                boxSizing: 'border-box',
                height: rectangle.height,
                left: rectangle.x,
                pointerEvents: 'none',
                position: 'absolute',
                top: rectangle.y,
                width: rectangle.width,
                zIndex: 3,
            }}
        />
    );
}
