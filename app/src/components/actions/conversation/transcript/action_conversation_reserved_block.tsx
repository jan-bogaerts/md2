import { Box } from '@mui/material'

const RESERVED_BLOCK_HEIGHT = 36

/** Keeps one collapsed-event-sized blank slot at bottom of active chat. */
export function ActionConversationReservedBlock() {
    return (
        <Box
            aria-hidden
            data-conversation-reserved-block
            sx={{ flexShrink: 0, minHeight: RESERVED_BLOCK_HEIGHT }}
        />
    )
}
