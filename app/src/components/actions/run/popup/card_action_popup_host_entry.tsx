import {
    cardPopupService,
    type CardActionPopupEntry,
} from '../../../../services/card_popup_service'
import { ActionPopup } from './action_popup'

interface CardActionPopupHostEntryProps {
    entry: CardActionPopupEntry
    stackPosition: number
    visible: boolean
}

/** Renders one service-owned card action popup with isolated local controller state. */
export function CardActionPopupHostEntry({ entry, stackPosition, visible }: CardActionPopupHostEntryProps) {
    const handleClose = () => {
        cardPopupService.close(entry.id)
    }

    const handleActivate = () => {
        cardPopupService.activate(entry.id)
    }

    const anchorElement = entry.anchorElement.isConnected ? entry.anchorElement : entry.fallbackAnchorElement

    return (
        <ActionPopup
            anchorElement={anchorElement}
            context={entry.context}
            draggable
            onActivate={handleActivate}
            onClose={handleClose}
            open={visible}
            popupEntryId={entry.id}
            stackPosition={stackPosition}
        />
    )
}
