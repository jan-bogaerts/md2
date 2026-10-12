import { markdownProcessingError$, useCellValues, viewMode$ } from '@mdxeditor/editor';
import { Box } from '@mui/material';
import { useEffect } from 'react';
import { dialogService } from '../../../services/dialog_service';
import { markdownSourceCompact$ } from './markdown_source_cell';
import { MarkdownSourceModeControls } from './markdown_source_mode_controls';

/** Reports genuine conversion errors and exposes explicit Source recovery, including compact editors. */
export function MarkdownSourceRecovery() {
    const [error, compact, mode] = useCellValues(markdownProcessingError$, markdownSourceCompact$, viewMode$);
    useEffect(() => {
        if (error) dialogService.error(new Error(error.error), { fallbackMessage: 'Rich text conversion failed; complete source is preserved' });
    }, [error]);

    return (
        <>
            {compact && (error || mode === 'source') ? <Box sx={{ p: 1 }}><MarkdownSourceModeControls /></Box> : null}
        </>
    );
}
