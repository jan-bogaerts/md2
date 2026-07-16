import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import { Box, IconButton, TextField, Tooltip, Typography } from '@mui/material'
import { useId, type ChangeEvent } from 'react'
import { MarkdownFormatToolbarControls } from '../editor/markdown_format_toolbar_controls'

interface ActionPhraseToolbarControlsProps {
    onDelete: () => void
    onTitleChange: (event: ChangeEvent<HTMLInputElement>) => void
    title: string
}

/** Markdown controls and phrase metadata shown above a predefined phrase editor. */
export function ActionPhraseToolbarControls(props: ActionPhraseToolbarControlsProps) {
    const { onDelete, onTitleChange, title } = props
    const titleId = useId()
    const deleteControl = (
        <Tooltip title="Delete this predefined phrase">
            <IconButton aria-label="Delete this predefined phrase" onClick={onDelete} size="small">
                <DeleteOutlineOutlined fontSize="small" />
            </IconButton>
        </Tooltip>
    )

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, width: '100%' }}>
            <Box sx={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap' }}>
                <MarkdownFormatToolbarControls endControls={deleteControl} />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Typography color="text.secondary" component="label" htmlFor={titleId} sx={{ fontWeight: 600 }} variant="caption">
                    Phrase title
                </Typography>
                <TextField fullWidth id={titleId} onChange={onTitleChange} size="small" value={title} />
            </Box>
        </Box>
    )
}
