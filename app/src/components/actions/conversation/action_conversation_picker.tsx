import { MenuItem, TextField } from '@mui/material'
import type { ChangeEvent } from 'react'
import { conversationPickerLabel, type ConversationPickerConversation } from './action_conversation_picker_data'

interface ActionConversationPickerProps {
    conversations: ConversationPickerConversation[]
    disabled: boolean
    loading: boolean
    onChange: (event: ChangeEvent<HTMLInputElement>) => void
    selectedPath: string
}

/** Selects New conversation or one persisted/live conversation for popup display. */
export function ActionConversationPicker(props: ActionConversationPickerProps) {
    const { conversations, disabled, loading, onChange, selectedPath } = props

    return (
        <TextField
            disabled={disabled || loading}
            onChange={onChange}
            select
            slotProps={{ select: { displayEmpty: true, inputProps: { 'aria-label': 'Conversation history' } } }}
            sx={{
                minWidth: 150,
                '& .MuiInputBase-root': { borderRadius: 0.75, color: 'text.secondary', fontSize: 12, fontWeight: 600, height: 26, pl: 0.75 },
                '& .MuiInputBase-root:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                '& .MuiInput-root:before, & .MuiInput-root:after': { display: 'none' },
            }}
            value={selectedPath}
            variant="standard"
        >
            <MenuItem value="">New conversation</MenuItem>
            {conversations.map((conversation) => (
                <MenuItem key={conversation.path} value={conversation.path}>{conversationPickerLabel(conversation)}</MenuItem>
            ))}
        </TextField>
    )
}
