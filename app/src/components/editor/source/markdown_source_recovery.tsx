import { markdownProcessingError$, useCellValues, viewMode$ } from '@mdxeditor/editor';
import { Box } from '@mui/material';
import { useEffect } from 'react';
import { dialogService } from '../../../services/dialog_service';
import { markdownSourceCompact$ } from './markdown_source_cell';
import { MarkdownSourceModeControls } from './markdown_source_mode_controls';

/** Preserves unsupported documents in Source and reports conversion errors after rendering. */
export function MarkdownSourceRecovery() {
    const [error, compact, mode] = useCellValues(markdownProcessingError$, markdownSourceCompact$, viewMode$);
    useEffect(() => {
        if (error) dialogService.error(new Error(error.error), { fallbackMessage: 'Rich text is unavailable; edit this document in Source' });
    }, [error]);

    return (
        <>
            {compact && (error || mode === 'source') ? <Box sx={{ p: 1 }}><MarkdownSourceModeControls /></Box> : null}
        </>
    );
}
