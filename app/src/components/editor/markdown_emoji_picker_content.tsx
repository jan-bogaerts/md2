import { Box, ButtonBase, TextField, Typography } from '@mui/material'
import { CONTROLLED_TEXT_INSERTION_COMMAND, type LexicalEditor } from 'lexical'
import { useState, type ChangeEvent, type MouseEvent } from 'react'
import { EMOJI_GROUPS, EMOJIS, type Emoji } from '../../data/emojis'
import { dialogService } from '../../services/dialog_service'

interface MarkdownEmojiPickerContentProps {
    activeEditor: LexicalEditor | null
    onClose: () => void
}

/** Case-insensitive substring match on the emoji name or any keyword. */
function matchesEmojiFilter(emoji: Emoji, filter: string) {
    return emoji.name.toLowerCase().includes(filter) || emoji.keywords.some((keyword) => keyword.toLowerCase().includes(filter))
}

/** Searchable grouped emoji catalogue for an open picker. */
export function MarkdownEmojiPickerContent(props: MarkdownEmojiPickerContentProps) {
    const { activeEditor, onClose } = props
    const [filter, setFilter] = useState('')
    const normalizedFilter = filter.trim().toLowerCase()
    const visibleEmojis = normalizedFilter ? EMOJIS.filter((emoji) => matchesEmojiFilter(emoji, normalizedFilter)) : EMOJIS
    const visibleGroups = EMOJI_GROUPS
        .map((group) => ({ ...group, emojis: visibleEmojis.filter((emoji) => emoji.group === group.id) }))
        .filter((group) => group.emojis.length > 0)

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
            onClose()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Emoji could not be inserted' })
        }
    }

    return (
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
    )
}
