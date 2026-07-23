import { useCallback, useRef, useSyncExternalStore } from 'react'
import { orderByAfter, UNASSIGNED_STATUS } from '../../data/card_ordering'
import {
    CARD_ADDED_EVENT,
    CARD_CHANGED_EVENT,
    CARD_REMOVED_EVENT,
    dataService,
    type CardAddedEventDetail,
    type CardChangedEventDetail,
    type CardRemovedEventDetail,
    type DataService,
} from '../../services/data/data_service'

function cardStatus(event: Event) {
    return (event as CustomEvent<CardAddedEventDetail | CardRemovedEventDetail>).detail.card.header.status
        ?? UNASSIGNED_STATUS
}

function areSamePaths(first: string[], second: string[]) {
    return first.length === second.length && second.every((path, index) => first[index] === path)
}

/** Subscribes to ordered membership changes for one board column, not card data edits. */
export function useCardColumnCards(status: string, service: DataService = dataService) {
    const pathsRef = useRef<string[]>([])
    const subscribe = useCallback((onStoreChange: () => void) => {
        const handleCardAddedOrRemoved = (event: Event) => {
            if (cardStatus(event) === status) {
                onStoreChange()
            }
        }
        const handleCardChanged = (event: Event) => {
            const { card, previousCard } = (event as CustomEvent<CardChangedEventDetail>).detail
            const currentStatus = card.header.status ?? UNASSIGNED_STATUS
            const previousStatus = previousCard.header.status ?? UNASSIGNED_STATUS
            if (currentStatus === previousStatus && card.header.after === previousCard.header.after) return
            if (currentStatus === status || previousStatus === status) onStoreChange()
        }
        service.addEventListener(CARD_ADDED_EVENT, handleCardAddedOrRemoved)
        service.addEventListener(CARD_CHANGED_EVENT, handleCardChanged)
        service.addEventListener(CARD_REMOVED_EVENT, handleCardAddedOrRemoved)

        return () => {
            service.removeEventListener(CARD_ADDED_EVENT, handleCardAddedOrRemoved)
            service.removeEventListener(CARD_CHANGED_EVENT, handleCardChanged)
            service.removeEventListener(CARD_REMOVED_EVENT, handleCardAddedOrRemoved)
        }
    }, [service, status])
    const getSnapshot = useCallback(() => {
        const cards = service.getState().snapshot?.activeCards ?? []
        const nextPaths = orderByAfter(cards.filter((card) => (
            (card.header.status ?? UNASSIGNED_STATUS) === status
        ))).map((card) => card.path)
        if (areSamePaths(pathsRef.current, nextPaths)) return pathsRef.current

        pathsRef.current = nextPaths

        return nextPaths
    }, [service, status])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
