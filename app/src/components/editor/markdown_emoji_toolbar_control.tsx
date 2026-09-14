import MoodOutlined from '@mui/icons-material/MoodOutlined'
import { IconButton, Popover, Tooltip } from '@mui/material'
import { activeEditor$, useCellValue } from '@mdxeditor/editor'
import { useState, type MouseEvent } from 'react'
import { MarkdownEmojiPickerContent } from './markdown_emoji_picker_content'

interface MarkdownEmojiToolbarControlProps {
    overlayContainer?: HTMLElement | null
}

/** Toolbar popover that inserts a Unicode emoji character at the active selection. */
export function MarkdownEmojiToolbarControl(props: MarkdownEmojiToolbarControlProps) {
    const { overlayContainer } = props
    const activeEditor = useCellValue(activeEditor$)
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)

    const handleOpen = (event: MouseEvent<HTMLElement>) => {
        setAnchorElement(event.currentTarget)
    }

    const handleClose = () => {
        setAnchorElement(null)
    }

    return (
        <>
            <Tooltip title="Insert emoji">
                <span>
                    <IconButton
                        aria-controls={anchorElement ? 'markdown-emoji-picker' : undefined}
                        aria-expanded={!!anchorElement}
                        aria-haspopup="dialog"
                        aria-label="Insert emoji"
                        disabled={!activeEditor}
                        onClick={handleOpen}
                        size="small"
                    >
                        <MoodOutlined fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
            <Popover
                anchorEl={anchorElement}
                anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
                container={overlayContainer ?? undefined}
                id="markdown-emoji-picker"
                onClose={handleClose}
                open={!!anchorElement}
                slotProps={{ paper: { 'aria-label': 'Emoji picker', role: 'dialog' } }}
            >
                {anchorElement ? <MarkdownEmojiPickerContent activeEditor={activeEditor} onClose={handleClose} /> : null}
            </Popover>
        </>
    )
}
