import { useCallback, useRef, useSyncExternalStore } from 'react'
import { orderByAfter, UNASSIGNED_STATUS } from '../../data/card_ordering'
import {
    CARD_ADDED_EVENT,
    CARD_REMOVED_EVENT,
    cardCollectionFieldChangedEvent,
    dataService,
    type CardAddedEventDetail,
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
        service.addEventListener(CARD_ADDED_EVENT, handleCardAddedOrRemoved)
        service.addEventListener(cardCollectionFieldChangedEvent('ordering'), onStoreChange)
        service.addEventListener(CARD_REMOVED_EVENT, handleCardAddedOrRemoved)

        return () => {
            service.removeEventListener(CARD_ADDED_EVENT, handleCardAddedOrRemoved)
            service.removeEventListener(cardCollectionFieldChangedEvent('ordering'), onStoreChange)
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
