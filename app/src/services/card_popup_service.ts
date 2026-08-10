import { actionContextIdentity, type ActionContext } from '../data/action_context'
import type { CardCommit } from './actions/card_commit_history'
import {
    CARD_PATH_CHANGED_EVENT,
    dataService,
    type CardPathChangedEventDetail,
    type DataService,
} from './data/data_service'
import { register } from './service_injector'

const CARD_POPUPS_CHANGED_EVENT = 'changed'

interface CardPopupEntryBase {
    anchorElement: HTMLElement
    fallbackAnchorElement: HTMLElement
    id: string
}

export interface CardActionPopupEntry extends CardPopupEntryBase {
    context: ActionContext
    kind: 'action'
}

export type CardDetailsDiffSelection =
    | { cardInternalId: string, commit: CardCommit, kind: 'commit' }
    | { kind: 'worktree' }

export interface CardDetailsPopupEntry extends CardPopupEntryBase {
    cardInternalId: string
    cardPath: string
    diffSelection: CardDetailsDiffSelection | null
    kind: 'card-details'
}

export type CardPopupEntry = CardActionPopupEntry | CardDetailsPopupEntry

function projectKey(service: DataService) {
    const project = service.getState().project

    return project ? `${project.id}:${project.branch}` : null
}

function createFallbackAnchor(anchorElement: HTMLElement) {
    const bounds = anchorElement.getBoundingClientRect()
    const fallbackAnchorElement = document.createElement('span')
    fallbackAnchorElement.setAttribute('aria-hidden', 'true')
    fallbackAnchorElement.dataset.cardPopupAnchor = 'true'
    Object.assign(fallbackAnchorElement.style, {
        height: `${bounds.height}px`,
        left: `${bounds.left}px`,
        pointerEvents: 'none',
        position: 'fixed',
        top: `${bounds.top}px`,
        visibility: 'hidden',
        width: `${bounds.width}px`,
    })
    document.body.append(fallbackAnchorElement)

    return fallbackAnchorElement
}

/** Owns ordered action and card-details popup entries across card component lifetimes. */
export class CardPopupService extends EventTarget {
    private readonly dataService: DataService
    private entries: CardPopupEntry[] = []
    private nextId = 1
    private currentProjectKey: string | null

    constructor(dataServiceInstance: DataService) {
        super()
        this.dataService = dataServiceInstance
        this.currentProjectKey = projectKey(this.dataService)
        this.dataService.addEventListener('changed', this.handleDataServiceChanged)
        this.dataService.addEventListener(CARD_PATH_CHANGED_EVENT, this.handleCardPathChanged)
    }

    getSnapshot() {
        return this.entries
    }

    toggleAction(context: ActionContext, anchorElement: HTMLElement) {
        const contextIdentity = actionContextIdentity(context)
        const existing = this.entries.find((entry) => (
            entry.kind === 'action' && actionContextIdentity(entry.context) === contextIdentity
        ))
        if (existing) {
            this.close(existing.id)
            return
        }
        if (!context.cardInternalId) throw new Error('Cannot open a card action popup without a card internal ID')

        const entry: CardActionPopupEntry = {
            anchorElement,
            context: { ...context },
            fallbackAnchorElement: createFallbackAnchor(anchorElement),
            id: `card-action-popup-${this.nextId}`,
            kind: 'action',
        }
        this.nextId += 1
        this.setEntries([...this.entries, entry])
    }

    toggleCardDetails(cardInternalId: string, cardPath: string, anchorElement: HTMLElement) {
        if (!cardInternalId) throw new Error('Cannot open card details without a card internal ID')
        if (!cardPath) throw new Error('Cannot open card details without a card path')

        const existing = this.findCardDetails(cardInternalId)
        if (existing) {
            this.close(existing.id)
            return
        }

        this.openCardDetails(cardInternalId, cardPath, anchorElement, null)
    }

    openWorktreeDiff(cardInternalId: string, cardPath: string, anchorElement: HTMLElement) {
        if (!cardInternalId) throw new Error('Cannot open worktree diff without a card internal ID')
        if (!cardPath) throw new Error('Cannot open worktree diff without a card path')

        const existing = this.findCardDetails(cardInternalId)
        if (!existing) {
            this.openCardDetails(cardInternalId, cardPath, anchorElement, { kind: 'worktree' })
            return
        }

        const updatedEntry = { ...existing, cardPath, diffSelection: { kind: 'worktree' } as const }
        this.setEntries([
            ...this.entries.filter((entry) => entry.id !== existing.id),
            updatedEntry,
        ])
    }

    selectDiff(id: string, diffSelection: CardDetailsDiffSelection) {
        const entry = this.requireCardDetails(id)
        this.replaceEntry({ ...entry, diffSelection })
    }

    clearDiff(id: string) {
        const entry = this.requireCardDetails(id)
        if (!entry.diffSelection) return

        this.replaceEntry({ ...entry, diffSelection: null })
    }

    close(id: string) {
        const entry = this.entries.find((candidate) => candidate.id === id)
        if (!entry) return

        entry.fallbackAnchorElement.remove()
        this.setEntries(this.entries.filter((candidate) => candidate.id !== id))
    }

    closeCardDetailsPath(cardPath: string) {
        this.removeEntries((entry) => entry.kind === 'card-details' && entry.cardPath === cardPath)
    }

    closeCardDetails() {
        this.removeEntries((entry) => entry.kind === 'card-details')
    }

    activate(id: string) {
        const entryIndex = this.entries.findIndex((entry) => entry.id === id)
        if (entryIndex < 0 || entryIndex === this.entries.length - 1) return

        const entry = this.entries[entryIndex]
        this.setEntries([...this.entries.filter((candidate) => candidate.id !== id), entry])
    }

    clear() {
        this.removeEntries(() => true)
    }

    private readonly handleCardPathChanged = (event: Event) => {
        const { fromPath, toPath } = (event as CustomEvent<CardPathChangedEventDetail>).detail
        const changedEntries = this.entries.map((entry) => (
            entry.kind === 'card-details' && entry.cardPath === fromPath ? { ...entry, cardPath: toPath } : entry
        ))
        if (changedEntries.every((entry, index) => entry === this.entries[index])) return

        this.setEntries(changedEntries)
    }

    private readonly handleDataServiceChanged = () => {
        const nextProjectKey = projectKey(this.dataService)
        if (nextProjectKey === this.currentProjectKey) return

        this.currentProjectKey = nextProjectKey
        this.clear()
    }

    private findCardDetails(cardInternalId: string) {
        return this.entries.find((entry): entry is CardDetailsPopupEntry => (
            entry.kind === 'card-details' && entry.cardInternalId === cardInternalId
        ))
    }

    private openCardDetails(
        cardInternalId: string,
        cardPath: string,
        anchorElement: HTMLElement,
        diffSelection: CardDetailsDiffSelection | null,
    ) {
        const entry: CardDetailsPopupEntry = {
            anchorElement,
            cardInternalId,
            cardPath,
            diffSelection,
            fallbackAnchorElement: createFallbackAnchor(anchorElement),
            id: `card-details-popup-${this.nextId}`,
            kind: 'card-details',
        }
        this.nextId += 1
        this.setEntries([...this.entries, entry])
    }

    private removeEntries(shouldRemove: (entry: CardPopupEntry) => boolean) {
        const removedEntries = this.entries.filter(shouldRemove)
        if (removedEntries.length === 0) return

        removedEntries.forEach(({ fallbackAnchorElement }) => fallbackAnchorElement.remove())
        this.setEntries(this.entries.filter((entry) => !shouldRemove(entry)))
    }

    private replaceEntry(replacement: CardPopupEntry) {
        this.setEntries(this.entries.map((entry) => entry.id === replacement.id ? replacement : entry))
    }

    private requireCardDetails(id: string) {
        const entry = this.entries.find((candidate): candidate is CardDetailsPopupEntry => (
            candidate.id === id && candidate.kind === 'card-details'
        ))
        if (!entry) throw new Error(`Card details popup does not exist: ${id}`)

        return entry
    }

    private setEntries(entries: CardPopupEntry[]) {
        this.entries = entries
        this.dispatchEvent(new Event(CARD_POPUPS_CHANGED_EVENT))
    }
}

export const cardPopupService = register('cardPopupService', new CardPopupService(dataService))

export function subscribeCardPopups(onStoreChange: () => void) {
    cardPopupService.addEventListener(CARD_POPUPS_CHANGED_EVENT, onStoreChange)

    return () => cardPopupService.removeEventListener(CARD_POPUPS_CHANGED_EVENT, onStoreChange)
}
