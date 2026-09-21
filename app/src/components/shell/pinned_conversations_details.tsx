import { Box, List, Typography } from '@mui/material'
import type { AgentConversation } from '../../data/data_types'
import { PinnedConversationDetailsRow } from './pinned_conversation_details_row'

export interface PinnedConversationDetailsItem {
    actionLabel: string
    cardTitle: string | null
    conversation: AgentConversation
    startedAtLabel: string
    unavailableReason: string | null
}

interface PinnedConversationsDetailsProps {
    items: PinnedConversationDetailsItem[]
    onSelect: (item: PinnedConversationDetailsItem, anchorElement: HTMLElement) => void
}

/** Lists current-project pinned conversations in newest-first service order. */
export function PinnedConversationsDetails({ items, onSelect }: PinnedConversationsDetailsProps) {
    return (
        <Box sx={{ maxWidth: 420, minWidth: 320 }}>
            <Typography id="pinned-conversations-details-title" component="h2" sx={{ color: 'text.primary', fontWeight: 700, px: 2, pt: 2 }} variant="subtitle2">
                Pinned conversations
            </Typography>
            <List dense>
                {items.map((item) => (
                    <PinnedConversationDetailsRow item={item} key={item.conversation.id} onSelect={onSelect} />
                ))}
            </List>
        </Box>
    )
}
