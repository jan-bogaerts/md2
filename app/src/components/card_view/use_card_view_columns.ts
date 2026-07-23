import { useMemo, useSyncExternalStore } from 'react'
import { UNASSIGNED_STATUS } from '../../data/card_ordering'
import { defaultColumnAccent, type ProjectCard, type StateConfig } from '../../data/data_types'
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

export interface VisibleCardColumn {
    color: string
    status: string
}

function statusOf(card: ProjectCard) {
    return card.header.status ?? UNASSIGNED_STATUS
}

function areSameColumns(first: VisibleCardColumn[], second: VisibleCardColumn[]) {
    return first.length === second.length && second.every((column, index) => (
        first[index].color === column.color && first[index].status === column.status
    ))
}

class CardViewColumnStore {
    private columns: VisibleCardColumn[]
    private listener: (() => void) | null = null
    private readonly service: DataService
    private readonly states: StateConfig[]
    private readonly statusCounts: Map<string, number>

    constructor(states: StateConfig[], service: DataService) {
        this.service = service
        this.states = states
        this.statusCounts = new Map()
        const cards = service.getState().snapshot?.activeCards ?? []
        for (const card of cards) this.incrementStatus(statusOf(card))
        this.columns = this.visibleColumns()
    }

    readonly getSnapshot = () => this.columns

    readonly subscribe = (listener: () => void) => {
        this.listener = listener
        this.service.addEventListener(CARD_ADDED_EVENT, this.handleCardAdded)
        this.service.addEventListener(CARD_CHANGED_EVENT, this.handleCardChanged)
        this.service.addEventListener(CARD_REMOVED_EVENT, this.handleCardRemoved)

        return () => {
            this.listener = null
            this.service.removeEventListener(CARD_ADDED_EVENT, this.handleCardAdded)
            this.service.removeEventListener(CARD_CHANGED_EVENT, this.handleCardChanged)
            this.service.removeEventListener(CARD_REMOVED_EVENT, this.handleCardRemoved)
        }
    }

    private readonly handleCardAdded = (event: Event) => {
        const { card } = (event as CustomEvent<CardAddedEventDetail>).detail
        this.incrementStatus(statusOf(card))
        this.publishVisibleColumns()
    }

    private readonly handleCardChanged = (event: Event) => {
        const { card, previousCard } = (event as CustomEvent<CardChangedEventDetail>).detail
        const currentStatus = statusOf(card)
        const previousStatus = statusOf(previousCard)
        if (currentStatus === previousStatus) return

        this.decrementStatus(previousStatus)
        this.incrementStatus(currentStatus)
        this.publishVisibleColumns()
    }

    private readonly handleCardRemoved = (event: Event) => {
        const { card } = (event as CustomEvent<CardRemovedEventDetail>).detail
        this.decrementStatus(statusOf(card))
        this.publishVisibleColumns()
    }

    private incrementStatus(status: string) {
        this.statusCounts.set(status, (this.statusCounts.get(status) ?? 0) + 1)
    }

    private decrementStatus(status: string) {
        const nextCount = (this.statusCounts.get(status) ?? 0) - 1
        if (nextCount > 0) {
            this.statusCounts.set(status, nextCount)
        } else {
            this.statusCounts.delete(status)
        }
    }

    private publishVisibleColumns() {
        const nextColumns = this.visibleColumns()
        if (areSameColumns(this.columns, nextColumns)) return

        this.columns = nextColumns
        this.listener?.()
    }

    private visibleColumns() {
        return this.states
            .map(({ alwaysVisible, color, state }, index) => ({
                alwaysVisible,
                color: color ?? defaultColumnAccent(index),
                status: state,
            }))
            .filter(({ alwaysVisible, status }) => alwaysVisible || this.statusCounts.has(status))
            .map(({ color, status }) => ({ color, status }))
    }
}

/** Subscribes only to changes in which configured board columns must be visible. */
export function useCardViewColumns(states: StateConfig[], service: DataService = dataService) {
    const store = useMemo(() => new CardViewColumnStore(states, service), [service, states])

    return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
