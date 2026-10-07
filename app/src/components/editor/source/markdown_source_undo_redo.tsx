import { useCellValues } from '@mdxeditor/editor';
import Redo from '@mui/icons-material/Redo';
import Undo from '@mui/icons-material/Undo';
import { IconButton, Tooltip } from '@mui/material';
import { useCallback } from 'react';
import { markdownSourceCanRedo$, markdownSourceCanUndo$, markdownSourceController$ } from './markdown_source_cell';

/** Source undo and redo act on CodeMirror rather than the hidden rich editor. */
export function MarkdownSourceUndoRedo() {
    const [controller, canUndo, canRedo] = useCellValues(markdownSourceController$, markdownSourceCanUndo$, markdownSourceCanRedo$);
    const handleUndo = useCallback(() => controller?.undo(), [controller]);
    const handleRedo = useCallback(() => controller?.redo(), [controller]);

    return (
        <>
            <Tooltip title="Undo Source edit"><span><IconButton aria-label="Undo Source edit" disabled={!canUndo} onClick={handleUndo} size="small">
                <Undo fontSize="small" />
            </IconButton></span></Tooltip>
            <Tooltip title="Redo Source edit"><span><IconButton aria-label="Redo Source edit" disabled={!canRedo} onClick={handleRedo} size="small">
                <Redo fontSize="small" />
            </IconButton></span></Tooltip>
        </>
    );
}
