import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { ProjectCard } from '../../data/data_types'
import {
    CARD_CHANGED_EVENT,
    CARD_REMOVED_EVENT,
    dataService,
    type CardChangedEventDetail,
    type CardRemovedEventDetail,
    type DataService,
} from '../../services/data/data_service'

function cardViewSignature(card: ProjectCard) {
    const { header } = card

    return JSON.stringify({
        affects: header.affects,
        agentConversationErrors: card.agentConversationErrors,
        agentConversations: card.agentConversations,
        agentLogReferences: header.agentLogReferences,
        author: header.author,
        id: header.id,
        internalId: header.internalId,
        isActive: card.isActive,
        owner: header.owner,
        path: card.path,
        policy: header.policy,
        status: header.status,
        title: header.title,
        worktree: header.worktree,
        worktreeError: header.worktreeError,
        worktreeValue: header.worktreeValue,
    })
}

/** Subscribes to one card and suppresses object-only and body-content changes irrelevant to card chrome. */
export function useProjectCard(path: string | null, service: DataService = dataService) {
    const cardRef = useRef<ProjectCard | null>(null)
    const signatureRef = useRef<string | null>(null)
    const subscribe = useCallback((onStoreChange: () => void) => {
        const handleCardChanged = (event: Event) => {
            const { card } = (event as CustomEvent<CardChangedEventDetail>).detail
            if (card.path === path) onStoreChange()
        }
        const handleCardRemoved = (event: Event) => {
            const { card } = (event as CustomEvent<CardRemovedEventDetail>).detail
            if (card.path === path) onStoreChange()
        }
        service.addEventListener(CARD_CHANGED_EVENT, handleCardChanged)
        service.addEventListener(CARD_REMOVED_EVENT, handleCardRemoved)

        return () => {
            service.removeEventListener(CARD_CHANGED_EVENT, handleCardChanged)
            service.removeEventListener(CARD_REMOVED_EVENT, handleCardRemoved)
        }
    }, [path, service])
    const getSnapshot = useCallback(() => {
        const card = path
            ? service.getState().snapshot?.activeCards.find((candidate) => candidate.path === path) ?? null
            : null
        const signature = card ? cardViewSignature(card) : null
        if (signatureRef.current === signature) return cardRef.current

        cardRef.current = card ? { ...card, header: { ...card.header } } : null
        signatureRef.current = signature

        return card
    }, [path, service])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
