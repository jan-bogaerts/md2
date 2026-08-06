import { CARD_PATH_CHANGED_EVENT, dataService, type CardPathChangedEventDetail } from '../../services/data/data_service'
import { register } from '../../services/service_injector'
import type { CardCommit } from '../../services/actions/card_commit_history'

const CARD_BODY_POPOVER_CHANGED_EVENT = 'changed'

export interface CardBodyPopoverSnapshot {
    anchorElement: HTMLElement | null
    cardPath: string | null
    diffSelection: CardBodyPopoverDiffSelection | null
}

export type CardBodyPopoverDiffSelection =
    | { cardInternalId: string, commit: CardCommit, kind: 'commit' }
    | { kind: 'worktree' }

const CLOSED_SNAPSHOT: CardBodyPopoverSnapshot = { anchorElement: null, cardPath: null, diffSelection: null }

/** Owns transient card-body popover state without involving the card-view render tree. */
class CardBodyPopoverService extends EventTarget {
    private snapshot = CLOSED_SNAPSHOT

    constructor() {
        super()
        register('cardBodyPopoverService', this)
        dataService.addEventListener(CARD_PATH_CHANGED_EVENT, this.handleCardPathChanged)
    }

    private readonly handleCardPathChanged = (event: Event) => {
        const { fromPath, toPath } = (event as CustomEvent<CardPathChangedEventDetail>).detail
        if (this.snapshot.cardPath !== fromPath) return

        this.setSnapshot({ ...this.snapshot, cardPath: toPath })
    }

    getSnapshot(): CardBodyPopoverSnapshot {
        return this.snapshot
    }

    toggle(cardPath: string, anchorElement: HTMLElement) {
        if (!cardPath) throw new Error('Cannot open card body without a card path')

        const isClosing = this.snapshot.cardPath === cardPath
        this.setSnapshot(isClosing ? CLOSED_SNAPSHOT : { anchorElement, cardPath, diffSelection: null })
    }

    openWorktreeDiff(cardPath: string, anchorElement: HTMLElement) {
        if (!cardPath) throw new Error('Cannot open worktree diff without a card path')

        this.setSnapshot({ anchorElement, cardPath, diffSelection: { kind: 'worktree' } })
    }

    selectDiff(diffSelection: CardBodyPopoverDiffSelection) {
        if (!this.snapshot.cardPath || !this.snapshot.anchorElement) throw new Error('Cannot select diff while card body is closed')

        this.setSnapshot({ ...this.snapshot, diffSelection })
    }

    clearDiff() {
        if (!this.snapshot.diffSelection) return

        this.setSnapshot({ ...this.snapshot, diffSelection: null })
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
