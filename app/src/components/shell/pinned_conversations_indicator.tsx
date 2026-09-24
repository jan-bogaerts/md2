import { Button } from '@mui/material'
import PushPinOutlined from '@mui/icons-material/PushPinOutlined'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { formatConversationDateTime } from '../actions/conversation/picker/action_conversation_picker_data'
import { useActions } from '../hooks/use_actions'
import { useProjectState } from '../hooks/use_project_state'
import { cardPopupService } from '../../services/card_popup_service'
import { dataService } from '../../services/data/data_service'
import { PinnedConversationsDetails, type PinnedConversationDetailsItem } from './pinned_conversations_details'
import { StatusDetailsSurface } from './status_details_surface'

/** Provides project-wide access to pinned card and project conversations. */
export function PinnedConversationsIndicator() {
    const conversations = useSyncExternalStore(
        dataService.agents.subscribePinnedConversations,
        dataService.agents.getPinnedConversationsSnapshot,
        dataService.agents.getPinnedConversationsSnapshot,
    )
    const pinnedConversations = useSyncExternalStore(
        dataService.conversationPins.subscribe,
        dataService.conversationPins.getSnapshot,
        dataService.conversationPins.getSnapshot,
    )
    const { actions } = useActions()
    const { snapshot } = useProjectState()
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)

    useEffect(() => () => dataService.agents.setPinnedConversationsPopupOpen(false), [])

    useEffect(() => {
        if (pinnedConversations.length > 0) return

        dataService.agents.setPinnedConversationsPopupOpen(false)
    }, [pinnedConversations.length])

    const activeAnchorElement = anchorElement?.isConnected ? anchorElement : null

    const items = useMemo(() => {
        const actionLabels = new Map(actions.map(({ id, label }) => [id, label]))
        const cards = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]

        return conversations.map((conversation): PinnedConversationDetailsItem => {
            const card = conversation.cardInternalId
                ? cards.find(({ header }) => header.internalId === conversation.cardInternalId) ?? null
                : null
            const actionLabel = conversation.actionId ? actionLabels.get(conversation.actionId) ?? conversation.actionId : 'Unknown action'
            const unavailableReason = !conversation.actionId || !actionLabels.has(conversation.actionId)
                ? 'Action unavailable'
                : conversation.cardInternalId && !card
                    ? 'Card unavailable'
                    : null

            return {
                actionLabel,
                cardTitle: card?.header.title ?? null,
                conversation,
                startedAtLabel: formatConversationDateTime(conversation.startedAt),
                unavailableReason,
            }
        })
    }, [actions, conversations, snapshot])

    const handleOpen = async (event: React.MouseEvent<HTMLElement>) => {
        const button = event.currentTarget
        dataService.agents.setPinnedConversationsPopupOpen(true)
        await dataService.agents.ensurePinnedConversationsLoaded()
        if (dataService.conversationPins.getSnapshot().length > 0) {
            setAnchorElement(button)
            return
        }

        dataService.agents.setPinnedConversationsPopupOpen(false)
    }

    const handleClose = () => {
        setAnchorElement(null)
        dataService.agents.setPinnedConversationsPopupOpen(false)
    }

    const handleSelect = (item: PinnedConversationDetailsItem, rowAnchorElement: HTMLElement) => {
        const opened = cardPopupService.openPersistedConversation(item.conversation, rowAnchorElement)
        if (opened) handleClose()
    }

    if (pinnedConversations.length === 0) return null

    return (
        <>
            <Button
                aria-label={`Pinned conversations: ${pinnedConversations.length}`}
                onClick={handleOpen}
                size="small"
                startIcon={<PushPinOutlined sx={{ fontSize: '14px !important' }} />}
                sx={{ borderRadius: 99, color: 'text.secondary', fontSize: 11.5, height: 22, minWidth: 0, px: 1.25 }}
            >
                {pinnedConversations.length}
            </Button>
            <StatusDetailsSurface anchorElement={activeAnchorElement} labelId="pinned-conversations-details-title" mobile={false} onClose={handleClose}>
                <PinnedConversationsDetails items={items} onSelect={handleSelect} />
            </StatusDetailsSurface>
        </>
    )
}
