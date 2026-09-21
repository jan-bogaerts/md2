import { ListItemButton, ListItemText } from '@mui/material'
import type { PinnedConversationDetailsItem } from './pinned_conversations_details'

interface PinnedConversationDetailsRowProps {
    item: PinnedConversationDetailsItem
    onSelect: (item: PinnedConversationDetailsItem, anchorElement: HTMLElement) => void
}

/** Displays one pinned conversation while keeping unavailable rows selectable for their reason dialog. */
export function PinnedConversationDetailsRow({ item, onSelect }: PinnedConversationDetailsRowProps) {
    const handleSelect = (event: React.MouseEvent<HTMLElement>) => {
        onSelect(item, event.currentTarget)
    }
    const context = item.cardTitle ? `${item.actionLabel} · ${item.cardTitle}` : item.actionLabel
    const secondary = item.unavailableReason
        ? `${item.startedAtLabel} · ${context} · ${item.unavailableReason}`
        : `${item.startedAtLabel} · ${context}`

    return (
        <ListItemButton aria-disabled={!!item.unavailableReason} onClick={handleSelect}>
            <ListItemText
                primary={item.conversation.title}
                secondary={secondary}
                slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }}
            />
        </ListItemButton>
    )
}
