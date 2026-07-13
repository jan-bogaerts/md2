export type CardSeparator = '-' | '_'

export const DEFAULT_CARD_SEPARATOR: CardSeparator = '_'
export const LEGACY_CARD_SEPARATOR: CardSeparator = '-'

const CARD_ID_PATTERN = /^(.+?)[-_]\d+$/u

export function buildCardId(idPrefix: string, number: number, separator: CardSeparator) {
    return `${idPrefix}${separator}${number}`
}

export function getCardIdPrefix(id: string) {
    return id.match(CARD_ID_PATTERN)?.[1]
}
