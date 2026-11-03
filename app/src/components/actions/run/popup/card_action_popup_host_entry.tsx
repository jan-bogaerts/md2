import { memo, useCallback } from 'react'
import {
    cardPopupService,
    subscribeCardPopupFocusRequest,
    type CardActionPopupEntry,
} from '../../../../services/card_popup_service'
import { ActionPopup } from './action_popup'

interface CardActionPopupHostEntryProps {
    entry: CardActionPopupEntry
    stackPosition: number
    visible: boolean
}

/**
 * Renders one service-owned card action popup with isolated local controller state. Memoized so
 * opening or closing another popup entry does not render this one.
 */
export const CardActionPopupHostEntry = memo(function CardActionPopupHostEntry(
    { entry, stackPosition, visible }: CardActionPopupHostEntryProps,
) {
    const handleClose = useCallback(() => {
        cardPopupService.close(entry.id)
    }, [entry.id])

    const handleActivate = useCallback(() => {
        cardPopupService.activate(entry.id)
    }, [entry.id])

    const subscribeFocusRequest = useCallback(
        (listener: () => void) => subscribeCardPopupFocusRequest(entry.id, listener),
        [entry.id],
    )

    const anchorElement = entry.anchorElement.isConnected ? entry.anchorElement : entry.fallbackAnchorElement

    return (
        <ActionPopup
            anchorElement={anchorElement}
            context={entry.context}
            draggable
            initialActionId={entry.requestedActionId ?? undefined}
            initialConversationPath={entry.requestedConversationPath ?? undefined}
            initialRunId={entry.requestedRunId ?? undefined}
            onActivate={handleActivate}
            onClose={handleClose}
            open={visible}
            popupEntryId={entry.id}
            popupVisible={visible}
            stackPosition={stackPosition}
            subscribeFocusRequest={subscribeFocusRequest}
        />
    )
})
