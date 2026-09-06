import { Alert, Box, Paper, Stack, Typography } from '@mui/material'
import { useSyncExternalStore } from 'react'
import {
    diagramChangeReviewService, type DiagramChangeReviewService,
} from './diagram_change_review_service'

const GENERATED_TEXT_MINIMUM_HEIGHT = 80

/** Explicitly generated report and validation result; neither observes ordinary diagram fields. */
export function DiagramChangeReviewReport({review = diagramChangeReviewService}: {
    review?: DiagramChangeReviewService
}) {
    const blockingItems = useSyncExternalStore(
        review.subscribeBlockingItems,
        review.getBlockingItemsSnapshot,
        review.getBlockingItemsSnapshot,
    )
    const generatedText = useSyncExternalStore(
        review.subscribeGeneratedText,
        review.getGeneratedTextSnapshot,
        review.getGeneratedTextSnapshot,
    )

    return (
        <Stack spacing={1.5}>
            {blockingItems.length === 0 ? (
                <Alert severity="success">Editable diagram is valid.</Alert>
            ) : (
                <Alert severity="error">
                    <Typography component="div" variant="subtitle2">Resolve blocking items before saving or sending.</Typography>
                    <Box component="ul" sx={{ mb: 0, mt: 0.5, pl: 2.5 }}>
                        {blockingItems.map((item) => <li key={item}>{item}</li>)}
                    </Box>
                </Alert>
            )}
            <Stack spacing={0.5}>
                <Typography color="custom.colHead" variant="overline">Generated text</Typography>
                <Paper
                    component="pre"
                    elevation={0}
                    sx={{
                        border: 1,
                        borderColor: 'divider',
                        m: 0,
                        minHeight: GENERATED_TEXT_MINIMUM_HEIGHT,
                        overflow: 'auto',
                        p: 1.5,
                        whiteSpace: 'pre-wrap',
                    }}
                >
                    {generatedText || 'No implementation instructions.'}
                </Paper>
            </Stack>
        </Stack>
    )
}
