import { useSyncExternalStore } from 'react'
import {
    cardActionPopupService,
    subscribeCardActionPopups,
} from '../../../services/actions/card_action_popup_service'
import { CardActionPopupHostEntry } from './card_action_popup_host_entry'

/** Stable renderer for all service-owned card action popups. */
export function CardActionPopupHost() {
    const entries = useSyncExternalStore(
        subscribeCardActionPopups,
        () => cardActionPopupService.getSnapshot(),
        () => cardActionPopupService.getSnapshot(),
    )

    return entries.map((entry, stackPosition) => (
        <CardActionPopupHostEntry entry={entry} key={entry.id} stackPosition={stackPosition} />
    ))
}
