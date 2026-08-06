import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { AgentConversation, AgentConversationError, Card, CardHeader } from '../../data/data_types'
import {
    CARD_ADDED_EVENT,
    CARD_REMOVED_EVENT,
    cardFieldChangedEvent,
    dataService,
    type CardAddedEventDetail,
    type CardField,
    type CardRemovedEventDetail,
    type DataService,
} from '../../services/data/data_service'

export interface CardWorktreeSnapshot {
    error: string | null | undefined
    value: string | null | undefined
    worktree: number | null | undefined
}

export interface CardConversationSnapshot {
    conversations: AgentConversation[]
    errors: AgentConversationError[]
}

export interface CardMetadataSnapshot {
    header: Omit<CardHeader, 'affects' | 'agentLogReferences'>
    isActive: boolean
    path: string
}

export interface CardAffectsSnapshot {
    affects: string[]
    id: string
    path: string
}

function findCard(path: string | null, service: DataService) {
    if (!path) return null

    return service.getState().snapshot?.activeCards.find((card) => card.path === path) ?? null
}

export function getProjectCard(path: string, service: DataService = dataService) {
    return findCard(path, service)
}

function eventMatchesPath(event: Event, path: string | null) {
    const { card } = (event as CustomEvent<CardAddedEventDetail | CardRemovedEventDetail>).detail

    return card.path === path
}

function useCardField<T>(path: string | null, field: CardField, select: (card: Card | null) => T, service: DataService) {
    const subscribe = useCallback((onStoreChange: () => void) => {
        const handleLifecycle = (event: Event) => {
            if (eventMatchesPath(event, path)) onStoreChange()
        }
        const fieldEvent = path ? cardFieldChangedEvent(path, field) : null
        if (fieldEvent) service.addEventListener(fieldEvent, onStoreChange)
        service.addEventListener(CARD_ADDED_EVENT, handleLifecycle)
        service.addEventListener(CARD_REMOVED_EVENT, handleLifecycle)

        return () => {
            if (fieldEvent) service.removeEventListener(fieldEvent, onStoreChange)
            service.removeEventListener(CARD_ADDED_EVENT, handleLifecycle)
            service.removeEventListener(CARD_REMOVED_EVENT, handleLifecycle)
        }
    }, [field, path, service])
    const getSnapshot = useCallback(() => select(findCard(path, service)), [path, select, service])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

const selectTitle = (card: Card | null) => card?.header.title ?? null
const selectBody = (card: Card | null) => card?.content ?? null
const selectPolicy = (card: Card | null) => card?.header.policy ?? null
const CARD_METADATA_FIELDS: CardField[] = ['identity', 'policy', 'status', 'title', 'worktree']

/** Reads only title primitive for one card. */
export function useCardTitle(path: string | null, service: DataService = dataService) {
    return useCardField(path, 'title', selectTitle, service)
}

/** Reads only body primitive for one card. */
export function useCardBody(path: string | null, service: DataService = dataService) {
    return useCardField(path, 'body', selectBody, service)
}

/** Reads only policy map reference for one card. */
export function useCardPolicy(path: string | null, service: DataService = dataService) {
    return useCardField(path, 'policy', selectPolicy, service)
}

/** Reads stable worktree projection for one card. */
export function useCardWorktree(path: string | null, service: DataService = dataService) {
    const snapshotRef = useRef<CardWorktreeSnapshot | null>(null)
    const select = useCallback((card: Card | null) => {
        if (!card) return null
        const next = { error: card.header.worktreeError, value: card.header.worktreeValue, worktree: card.header.worktree }
        const previous = snapshotRef.current
        const unchanged = previous
            && previous.error === next.error
            && previous.value === next.value
            && previous.worktree === next.worktree
        if (unchanged) return previous

        snapshotRef.current = next

        return next
    }, [])

    return useCardField(path, 'worktree', select, service)
}

/** Reads conversation state independently from persisted card fields. */
export function useCardConversations(path: string | null, service: DataService = dataService) {
    const snapshotRef = useRef<CardConversationSnapshot | null>(null)
    const select = useCallback((card: Card | null) => {
        if (!card) return null
        const previous = snapshotRef.current
        const unchanged = previous
            && previous.conversations === card.agentConversations
            && previous.errors === card.agentConversationErrors
        if (unchanged) return previous

        const next = { conversations: card.agentConversations, errors: card.agentConversationErrors }
        snapshotRef.current = next

        return next
    }, [])

    return useCardField(path, 'conversation', select, service)
}

function sameCardMetadata(previous: CardMetadataSnapshot, card: Card) {
    const header = previous.header
    return previous.path === card.path
        && previous.isActive === card.isActive
        && header.id === card.header.id
        && header.internalId === card.header.internalId
        && header.status === card.header.status
        && header.title === card.header.title
        && header.policy === card.header.policy
        && header.worktree === card.header.worktree
        && header.worktreeError === card.header.worktreeError
        && header.worktreeValue === card.header.worktreeValue
}

function cardMetadataSnapshot(card: Card): CardMetadataSnapshot {
    const { header: source } = card
    const header = {
        after: source.after,
        author: source.author,
        id: source.id,
        internalId: source.internalId,
        owner: source.owner,
        policy: source.policy,
        status: source.status,
        title: source.title,
        worktree: source.worktree,
        worktreeError: source.worktreeError,
        worktreeValue: source.worktreeValue,
    }

    return {
        header,
        isActive: card.isActive,
        path: card.path,
    }
}

/** Stable metadata-only projection. Body and activity changes cannot update it. */
export function useCardMetadata(path: string | null, service: DataService = dataService) {
    const cardRef = useRef<CardMetadataSnapshot | null>(null)
    const select = useCallback((card: Card | null) => {
        if (card && cardRef.current && sameCardMetadata(cardRef.current, card)) return cardRef.current
        cardRef.current = card ? cardMetadataSnapshot(card) : null

        return cardRef.current
    }, [])
    const subscribe = useCallback((onStoreChange: () => void) => {
        const handleLifecycle = (event: Event) => {
            if (eventMatchesPath(event, path)) onStoreChange()
        }
        const fieldEvents = path ? CARD_METADATA_FIELDS.map((field) => cardFieldChangedEvent(path, field)) : []
        fieldEvents.forEach((eventName) => service.addEventListener(eventName, onStoreChange))
        service.addEventListener(CARD_ADDED_EVENT, handleLifecycle)
        service.addEventListener(CARD_REMOVED_EVENT, handleLifecycle)

        return () => {
            fieldEvents.forEach((eventName) => service.removeEventListener(eventName, onStoreChange))
            service.removeEventListener(CARD_ADDED_EVENT, handleLifecycle)
            service.removeEventListener(CARD_REMOVED_EVENT, handleLifecycle)
        }
    }, [path, service])
    const getSnapshot = useCallback(() => select(findCard(path, service)), [path, select, service])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Stable affects-only projection for affects editor. */
export function useCardAffects(path: string | null, service: DataService = dataService) {
    const snapshotRef = useRef<CardAffectsSnapshot | null>(null)
    const select = useCallback((card: Card | null) => {
        if (!card) return null
        const previous = snapshotRef.current
        const unchanged = previous
            && previous.affects === card.header.affects
            && previous.id === card.header.id
            && previous.path === card.path
        if (unchanged) return previous

        const next = { affects: card.header.affects, id: card.header.id, path: card.path }
        snapshotRef.current = next

        return next
    }, [])

    return useCardField(path, 'affects', select, service)
}
