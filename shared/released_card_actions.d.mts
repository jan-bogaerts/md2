interface ReleasedCardActionContext {
    cardInternalId?: string
    file?: string
    kind: string
}

export const RELEASED_CARD_RUN_MESSAGE: string
export function isReleasedCardActionContext(context: ReleasedCardActionContext, releasesFolder: string): boolean
export function assertReleasedCardActionAllowed(context: ReleasedCardActionContext, releasesFolder: string): void
