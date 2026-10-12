import { useCellValues, viewMode$ } from '@mdxeditor/editor';
import ArticleOutlined from '@mui/icons-material/ArticleOutlined';
import CodeOutlined from '@mui/icons-material/CodeOutlined';
import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
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
            <Tooltip title="Rich text">
                <ToggleButton aria-label="Rich text" value="rich-text">
                    <ArticleOutlined fontSize="small" />
                </ToggleButton>
            </Tooltip>
            <Tooltip title="Source">
                <ToggleButton aria-label="Source" value="source">
                    <CodeOutlined fontSize="small" />
                </ToggleButton>
            </Tooltip>
        </ToggleButtonGroup>
    );
}
