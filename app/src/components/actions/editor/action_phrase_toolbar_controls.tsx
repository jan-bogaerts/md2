import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import { Box, IconButton, TextField, Tooltip, Typography } from '@mui/material'
import { useId, useState, type ChangeEvent } from 'react'
import { MarkdownFormatToolbarControls } from '../../editor/markdown_format_toolbar_controls'

interface ActionPhraseToolbarControlsProps {
    onDelete: () => void
    onTitleCommit: (title: string) => void
    onTitleEdit: (title: string) => void
    title: string
}

/** Markdown controls and phrase metadata shown above a predefined phrase editor. */
export function ActionPhraseToolbarControls(props: ActionPhraseToolbarControlsProps) {
    const { onDelete, onTitleCommit, onTitleEdit, title } = props
    const [titleDraft, setTitleDraft] = useState({ baseline: title, value: title })
    const titleId = useId()
    const draftTitle = titleDraft.baseline === title ? titleDraft.value : title

    const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
        const nextTitle = event.target.value
        setTitleDraft({ baseline: title, value: nextTitle })
        onTitleEdit(nextTitle)
    }

    const handleTitleBlur = () => {
        if (draftTitle !== title) onTitleCommit(draftTitle)
    }
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
                <TextField fullWidth id={titleId} onBlur={handleTitleBlur} onChange={handleTitleChange} size="small" value={draftTitle} />
            </Box>
        </Box>
    )
}
