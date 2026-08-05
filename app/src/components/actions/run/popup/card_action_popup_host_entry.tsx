import {
    cardActionPopupService,
    type CardActionPopupEntry,
} from '../../../../services/actions/card_action_popup_service'
import { ActionPopup } from './action_popup'

interface CardActionPopupHostEntryProps {
    entry: CardActionPopupEntry
    stackPosition: number
}

/** Renders one service-owned card action popup with isolated local controller state. */
export function CardActionPopupHostEntry({ entry, stackPosition }: CardActionPopupHostEntryProps) {
    const handleClose = () => {
        cardActionPopupService.close(entry.id)
    }

    const handleActivate = () => {
        cardActionPopupService.activate(entry.id)
    }

    const anchorElement = entry.anchorElement.isConnected ? entry.anchorElement : entry.fallbackAnchorElement

    return (
        <ActionPopup
            anchorElement={anchorElement}
            context={entry.context}
            draggable
            onActivate={handleActivate}
            onClose={handleClose}
            popupEntryId={entry.id}
            stackPosition={stackPosition}
        />
    )
}
