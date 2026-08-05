import { actionContextIdentity, type ActionContext } from '../../data/action_context'
import type { DataService } from '../data/data_service'
import { dataService } from '../data/data_service'
import { register } from '../service_injector'

const CARD_ACTION_POPUPS_CHANGED_EVENT = 'changed'

export interface CardActionPopupEntry {
    anchorElement: HTMLElement
    context: ActionContext
    fallbackAnchorElement: HTMLElement
    id: string
}

function projectKey(service: DataService) {
    const project = service.getState().project

    return project ? `${project.id}:${project.branch}` : null
}

function createFallbackAnchor(anchorElement: HTMLElement) {
    const bounds = anchorElement.getBoundingClientRect()
    const fallbackAnchorElement = document.createElement('span')
    fallbackAnchorElement.setAttribute('aria-hidden', 'true')
    fallbackAnchorElement.dataset.cardActionPopupAnchor = 'true'
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

/** Owns every open card action popup independently from card component lifetimes. */
export class CardActionPopupService extends EventTarget {
    private readonly dataService: DataService
    private entries: CardActionPopupEntry[] = []
    private nextId = 1
    private currentProjectKey: string | null

    constructor(dataServiceInstance: DataService) {
        super()
        this.dataService = dataServiceInstance
        this.currentProjectKey = projectKey(this.dataService)
        this.dataService.addEventListener('changed', this.handleDataServiceChanged)
    }

    getSnapshot() {
        return this.entries
    }

    toggle(context: ActionContext, anchorElement: HTMLElement) {
        const contextIdentity = actionContextIdentity(context)
        const existing = this.entries.find((entry) => actionContextIdentity(entry.context) === contextIdentity)
        if (existing) {
            this.close(existing.id)
            return
        }

        if (!context.cardInternalId) throw new Error('Cannot open a card action popup without a card internal ID')

        const entry = {
            anchorElement,
            context: { ...context },
            fallbackAnchorElement: createFallbackAnchor(anchorElement),
            id: `card-action-popup-${this.nextId}`,
        }
        this.nextId += 1
        this.setEntries([...this.entries, entry])
    }

    close(id: string) {
        const entry = this.entries.find((candidate) => candidate.id === id)
        if (!entry) return

        entry.fallbackAnchorElement.remove()
        this.setEntries(this.entries.filter((candidate) => candidate.id !== id))
    }

    activate(id: string) {
        const entryIndex = this.entries.findIndex((entry) => entry.id === id)
        if (entryIndex < 0 || entryIndex === this.entries.length - 1) return

        const entry = this.entries[entryIndex]
        this.setEntries([...this.entries.filter((candidate) => candidate.id !== id), entry])
    }

    clear() {
        if (this.entries.length === 0) return

        this.entries.forEach(({ fallbackAnchorElement }) => fallbackAnchorElement.remove())
        this.setEntries([])
    }

    private readonly handleDataServiceChanged = () => {
        const nextProjectKey = projectKey(this.dataService)
        if (nextProjectKey === this.currentProjectKey) return

        this.currentProjectKey = nextProjectKey
        this.clear()
    }

    private setEntries(entries: CardActionPopupEntry[]) {
        this.entries = entries
        this.dispatchEvent(new Event(CARD_ACTION_POPUPS_CHANGED_EVENT))
    }
}

export const cardActionPopupService = register('cardActionPopupService', new CardActionPopupService(dataService))

export function subscribeCardActionPopups(onStoreChange: () => void) {
    cardActionPopupService.addEventListener(CARD_ACTION_POPUPS_CHANGED_EVENT, onStoreChange)

    return () => cardActionPopupService.removeEventListener(CARD_ACTION_POPUPS_CHANGED_EVENT, onStoreChange)
}
