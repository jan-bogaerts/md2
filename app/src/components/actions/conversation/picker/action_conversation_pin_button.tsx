import { IconButton, Tooltip } from '@mui/material'
import PushPinOutlined from '@mui/icons-material/PushPinOutlined'
import type { ConversationPickerConversation } from './action_conversation_picker_data'
import { useConversationPinned } from '../../../hooks/use_conversation_pinned'

interface ActionConversationPinButtonProps {
    conversation: ConversationPickerConversation | null
    disabled: boolean
    onToggle: () => void
}

/** Pins or unpins currently displayed conversation after backend confirmation. */
export function ActionConversationPinButton(props: ActionConversationPinButtonProps) {
    const { conversation, disabled, onToggle } = props
    const pinned = useConversationPinned(conversation)
    const label = pinned ? 'Unpin conversation' : 'Pin conversation'

    return (
        <Tooltip title={label}>
            <span>
                <IconButton
                    aria-label={label}
                    disabled={!conversation || disabled}
                    onClick={onToggle}
                    size="small"
                    sx={{
                        borderRadius: 0.75,
                        height: 26,
                        p: { sm: 0.625, xs: 0 },
                        width: { sm: 26, xs: 18 },
                        '&:hover': { bgcolor: 'action.hover', color: 'primary.main' },
                    }}
                >
                    <PushPinOutlined sx={{ fontSize: 16, transform: pinned ? 'none' : 'rotate(45deg)' }} />
                </IconButton>
            </span>
        </Tooltip>
    )
}
