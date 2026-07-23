import { register } from '../../services/service_injector'

const CARD_BODY_POPOVER_CHANGED_EVENT = 'changed'

export interface CardBodyPopoverSnapshot {
    anchorElement: HTMLElement | null
    cardPath: string | null
}

const CLOSED_SNAPSHOT: CardBodyPopoverSnapshot = { anchorElement: null, cardPath: null }

/** Owns transient card-body popover state without involving the card-view render tree. */
class CardBodyPopoverService extends EventTarget {
    private snapshot = CLOSED_SNAPSHOT

    constructor() {
        super()
        register('cardBodyPopoverService', this)
    }

    getSnapshot(): CardBodyPopoverSnapshot {
        return this.snapshot
    }

    toggle(cardPath: string, anchorElement: HTMLElement) {
        if (!cardPath) throw new Error('Cannot open card body without a card path')

        const isClosing = this.snapshot.cardPath === cardPath
        this.setSnapshot(isClosing ? CLOSED_SNAPSHOT : { anchorElement, cardPath })
    }

    close() {
        if (!this.snapshot.cardPath) return

        this.setSnapshot(CLOSED_SNAPSHOT)
    }

    closePath(cardPath: string) {
        if (this.snapshot.cardPath !== cardPath) return

        this.setSnapshot(CLOSED_SNAPSHOT)
    }

    private setSnapshot(snapshot: CardBodyPopoverSnapshot) {
        this.snapshot = snapshot
        this.dispatchEvent(new Event(CARD_BODY_POPOVER_CHANGED_EVENT))
    }
}

export const cardBodyPopoverService = new CardBodyPopoverService()

export function subscribeCardBodyPopover(onStoreChange: () => void) {
    cardBodyPopoverService.addEventListener(CARD_BODY_POPOVER_CHANGED_EVENT, onStoreChange)

    return () => cardBodyPopoverService.removeEventListener(CARD_BODY_POPOVER_CHANGED_EVENT, onStoreChange)
}
