export const CARD_CHANGED_EVENT = 'cardChanged'

export const CARD_FIELDS = [
    'affects',
    'body',
    'conversation',
    'identity',
    'ordering',
    'policy',
    'references',
    'status',
    'title',
    'worktree',
] as const

export type CardField = typeof CARD_FIELDS[number]

/** Event name scoped to one card and one stable view projection. */
export function cardFieldChangedEvent(path: string, field: CardField) {
    return `${CARD_CHANGED_EVENT}:${encodeURIComponent(path)}:${field}`
}

/** Event name for collection projections affected by one field across cards. */
export function cardCollectionFieldChangedEvent(field: CardField) {
    return `${CARD_CHANGED_EVENT}:all:${field}`
}
