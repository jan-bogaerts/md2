import { useCallback, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../../data/action_context'
import {
    CARD_ADDED_EVENT,
    CARD_REMOVED_EVENT,
    cardCollectionFieldChangedEvent,
    dataService,
} from '../../../../services/data/data_service'

const TARGET_EVENTS = [
    cardCollectionFieldChangedEvent('identity'),
    cardCollectionFieldChangedEvent('title'),
    CARD_ADDED_EVENT,
    CARD_REMOVED_EVENT,
]

function findTargetCard(cardInternalId: string) {
    const snapshot = dataService.getState().snapshot
    const cards = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]

    return cards.find(({ header }) => header.internalId === cardInternalId) ?? null
}

function subscribeTargetEvents(listener: () => void) {
    TARGET_EVENTS.forEach((eventName) => dataService.addEventListener(eventName, listener))

    return () => TARGET_EVENTS.forEach((eventName) => dataService.removeEventListener(eventName, listener))
}

function subscribeNothing() {
    return () => undefined
}

/**
 * Badge id plus tooltip title, resolved by canonical card identity. The title follows a card renamed
 * while the popup stays open and falls back to the title captured in the context.
 */
export function usePopupTarget(context: ActionContext) {
    const cardInternalId = context.kind === 'card' ? context.cardInternalId ?? null : null
    const subscribe = cardInternalId ? subscribeTargetEvents : subscribeNothing
    const getId = useCallback(() => cardInternalId ? findTargetCard(cardInternalId)?.header.id ?? null : null, [cardInternalId])
    const getTitle = useCallback(() => cardInternalId ? findTargetCard(cardInternalId)?.header.title ?? null : null, [cardInternalId])
    const id = useSyncExternalStore(subscribe, getId, getId)
    const title = useSyncExternalStore(subscribe, getTitle, getTitle)
    if (context.kind === 'project') return { id: 'Project', title: null }
    if (context.kind !== 'card') return { id: null, title: null }

    return { id, title: title ?? context.title ?? null }
}
