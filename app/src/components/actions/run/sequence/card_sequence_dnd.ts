export const CARD_SEQUENCE_DROP_ID = 'card-sequence:drop'
const CARD_SEQUENCE_ITEM_PREFIX = 'card-sequence:item:'

export function cardSequenceItemId(cardInternalId: string) {
    return `${CARD_SEQUENCE_ITEM_PREFIX}${cardInternalId}`
}

export function cardInternalIdFromSequenceItem(id: string) {
    return id.startsWith(CARD_SEQUENCE_ITEM_PREFIX) ? id.slice(CARD_SEQUENCE_ITEM_PREFIX.length) : null
}

export function isCardSequenceDropId(id: string) {
    return id === CARD_SEQUENCE_DROP_ID || id.startsWith(CARD_SEQUENCE_ITEM_PREFIX)
}
