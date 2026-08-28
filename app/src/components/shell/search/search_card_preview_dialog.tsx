import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import type { SearchMatch } from '../../../services/search/search_types'
import { MarkdownEditor } from '../../editor/markdown_editor'

interface SearchCardPreviewDialogProps {
    match: SearchMatch | null
    onClose: () => void
}

function ignoreMarkdownChange() {}

/** Read-only preview for an archived or released card selected from global search. */
export function SearchCardPreviewDialog(props: SearchCardPreviewDialogProps) {
    const { match, onClose } = props
    const card = match?.card

    return (
        <Dialog
            aria-labelledby="search-card-preview-title"
            fullWidth
            maxWidth="md"
            onClose={onClose}
            open={!!card}
        >
            <DialogTitle id="search-card-preview-title">Card preview</DialogTitle>
            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0 }}>
                {card ? (
                    <>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <Typography color="text.secondary" variant="body2">{card.header.id}</Typography>
                            <Typography variant="h6">{card.header.title}</Typography>
                            <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }} variant="body2">
                                {card.path}
                            </Typography>
                        </Box>
                        <Box sx={{ minHeight: 0, overflowY: 'auto' }}>
                            <MarkdownEditor
                                hideAttachmentControl
                                hideToolbar
                                markdown={card.content}
                                onChange={ignoreMarkdownChange}
                                readOnly
                            />
                        </Box>
                    </>
                ) : null}
            </DialogContent>
            <DialogActions sx={{ bgcolor: 'background.default', borderTop: 1, borderColor: 'divider', justifyContent: 'flex-end' }}>
                <Button onClick={onClose} variant="outlined">Close</Button>
            </DialogActions>
        </Dialog>
    )
}
