import MoodOutlined from '@mui/icons-material/MoodOutlined'
import { Box, ButtonBase, IconButton, Popover, TextField, Tooltip, Typography } from '@mui/material'
import { activeEditor$, useCellValue } from '@mdxeditor/editor'
import { CONTROLLED_TEXT_INSERTION_COMMAND } from 'lexical'
import { useState, type ChangeEvent, type MouseEvent } from 'react'
import { EMOJI_GROUPS, EMOJIS, type Emoji } from '../../data/emojis'
import { dialogService } from '../../services/dialog_service'

interface MarkdownEmojiToolbarControlProps {
    overlayContainer?: HTMLElement | null
}

/** Case-insensitive substring match on the emoji name or any of its keywords. */
function matchesEmojiFilter(emoji: Emoji, filter: string) {
    return emoji.name.toLowerCase().includes(filter) || emoji.keywords.some((keyword) => keyword.toLowerCase().includes(filter))
}

/** Toolbar popover that inserts a Unicode emoji character at the active selection. */
export function MarkdownEmojiToolbarControl(props: MarkdownEmojiToolbarControlProps) {
    const { overlayContainer } = props
    const activeEditor = useCellValue(activeEditor$)
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const [filter, setFilter] = useState('')
    const normalizedFilter = filter.trim().toLowerCase()
    const visibleEmojis = normalizedFilter ? EMOJIS.filter((emoji) => matchesEmojiFilter(emoji, normalizedFilter)) : EMOJIS
    const visibleGroups = EMOJI_GROUPS
        .map((group) => ({ ...group, emojis: visibleEmojis.filter((emoji) => emoji.group === group.id) }))
        .filter((group) => group.emojis.length > 0)

    const handleOpen = (event: MouseEvent<HTMLElement>) => {
        setAnchorElement(event.currentTarget)
    }

    const handleClose = () => {
        setAnchorElement(null)
        setFilter('')
    }

    const handleFilterChange = (event: ChangeEvent<HTMLInputElement>) => {
        setFilter(event.target.value)
    }

    const handleEmojiClick = (event: MouseEvent<HTMLElement>) => {
        try {
            const emojiChar = event.currentTarget.dataset.emojiChar
            if (!emojiChar) throw new Error('Unknown emoji')
            if (!activeEditor) throw new Error('Cannot insert an emoji without an active Markdown editor')

            activeEditor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, emojiChar)
            activeEditor.focus()
            handleClose()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Emoji could not be inserted' })
        }
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
                <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: 400, width: 340 }}>
                    <Box sx={{ p: 1 }}>
                        <TextField autoFocus fullWidth label="Search emoji" onChange={handleFilterChange} size="small" value={filter} />
                    </Box>
                    <Box sx={{ overflowY: 'auto', px: 1, pb: 1 }}>
                        {visibleGroups.length === 0 ? (
                            <Typography color="text.secondary" sx={{ p: 1 }} variant="body2">No emoji found</Typography>
                        ) : visibleGroups.map((group) => (
                            <Box component="section" key={group.id}>
                                <Typography component="h2" sx={{ display: 'block', pt: 1 }} variant="overline">{group.label}</Typography>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)' }}>
                                    {group.emojis.map((emoji) => (
                                        <ButtonBase
                                            aria-label={emoji.name}
                                            data-emoji-char={emoji.char}
                                            key={emoji.char}
                                            onClick={handleEmojiClick}
                                            sx={{ borderRadius: 1, fontSize: 22, height: 36, '&:hover': { bgcolor: 'action.hover' } }}
                                            title={emoji.name}
                                        >
                                            {emoji.char}
                                        </ButtonBase>
                                    ))}
                                </Box>
                            </Box>
                        ))}
                    </Box>
                </Box>
            </Popover>
        </>
    )
}
