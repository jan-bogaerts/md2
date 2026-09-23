import { Box, MenuItem } from '@mui/material'
import type { MenuItemProps } from '@mui/material'
import PushPinOutlined from '@mui/icons-material/PushPinOutlined'
import { useConversationPinned } from '../../hooks/use_conversation_pinned'
import type { ConversationPickerConversation } from './action_conversation_picker_data'

interface ActionConversationPickerOptionProps extends Omit<MenuItemProps, 'children' | 'value'> {
    children: string
    conversation: ConversationPickerConversation
    value: string
}

/** Renders one history option with live confirmed pin state. */
export function ActionConversationPickerOption({ children, conversation, ...menuItemProps }: ActionConversationPickerOptionProps) {
    const pinned = useConversationPinned(conversation)

    return (
        <MenuItem {...menuItemProps}>
            <Box component="span" sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
            {pinned && <PushPinOutlined aria-label="Pinned" sx={{ fontSize: 15, ml: 1 }} />}
        </MenuItem>
    )
}
