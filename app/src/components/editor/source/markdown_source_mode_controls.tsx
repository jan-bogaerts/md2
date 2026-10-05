import { useCellValues, viewMode$ } from '@mdxeditor/editor';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useCallback, type MouseEvent } from 'react';
import { markdownSourceController$ } from './markdown_source_cell';

/** Two-state view selector; the historical diff view remains a separate read-only surface. */
export function MarkdownSourceModeControls() {
    const [mode, controller] = useCellValues(viewMode$, markdownSourceController$);
    const handleModeChange = useCallback((_event: MouseEvent<HTMLElement>, next: 'rich-text' | 'source' | null) => {
        if (next && next !== mode) controller?.setMode(next);
    }, [controller, mode]);

    return (
        <ToggleButtonGroup aria-label="Markdown view" exclusive onChange={handleModeChange} size="small" value={mode}>
            <ToggleButton value="rich-text">Rich text</ToggleButton>
            <ToggleButton value="source">Source</ToggleButton>
        </ToggleButtonGroup>
    );
}
