import { Alert, Box, Stack, Typography } from '@mui/material'
import { useState, useSyncExternalStore } from 'react'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../../data/action_placeholders'
import { MarkdownEditor } from '../../editor/markdown_editor'
import {
    diagramChangeReviewService, type DiagramChangeReviewService,
} from './diagram_change_review_service'

/** Invalid-only report plus editable implementation Markdown. */
export function DiagramChangeReviewReport({review = diagramChangeReviewService}: {
    review?: DiagramChangeReviewService
}) {
    const [overlayContainer, setOverlayContainer] = useState<HTMLElement | null>(null)
    const blockingItems = useSyncExternalStore(
        review.subscribeBlockingItems,
        review.getBlockingItemsSnapshot,
        review.getBlockingItemsSnapshot,
    )

    return (
        <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
            {blockingItems.length > 0 ? (
                <Alert severity="error" sx={{ flexShrink: 0 }}>
                    <Typography component="div" variant="subtitle2">Resolve blocking items before saving or adding card.</Typography>
                    <Box component="ul" sx={{ mb: 0, mt: 0.5, pl: 2.5 }}>
                        {blockingItems.map((item) => <li key={item}>{item}</li>)}
                    </Box>
                </Alert>
            ) : null}
            <Typography color="custom.colHead" sx={{ flexShrink: 0 }} variant="overline">
                Implementation instructions
            </Typography>
            <Box
                aria-label="Implementation instructions"
                ref={setOverlayContainer}
                role="group"
                sx={{
                    border: 1,
                    borderColor: 'custom.borderStrong',
                    borderRadius: '9px',
                    flex: 1,
                    minHeight: 120,
                    overflow: 'auto',
                    '&:focus-within': {
                        borderColor: 'primary.main',
                        boxShadow: (theme) => `0 0 0 3px ${theme.palette.custom.primaryBg}`,
                    },
                    '&:hover:not(:focus-within)': { borderColor: 'custom.borderHover' },
                    '& > [data-sticky-toolbar]': { minHeight: '100%' },
                    '& .light-theme, & .dark-theme': { minHeight: '100%' },
                    '& .mdxeditor-content': { boxSizing: 'border-box', minHeight: '100%', p: 1.5 },
                }}
            >
                <MarkdownEditor
                    draft={review.markdownDraft}
                    hideAttachmentControl
                    hideToolbar
                    overlayContainer={overlayContainer}
                    placeholders={ACTION_PROMPT_PLACEHOLDERS}
                />
            </Box>
        </Stack>
    )
}
