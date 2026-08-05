import { normalizePath } from './path_utils.mjs'

export const RELEASED_CARD_RUN_MESSAGE = 'Released cards are read-only. Create a new card for more work.'

/** True when a card-backed action context points inside the configured releases folder. */
export function isReleasedCardActionContext(context, releasesFolder) {
    if (!context || typeof context !== 'object') throw new Error('Missing action context')
    if (typeof releasesFolder !== 'string' || releasesFolder.length === 0) throw new Error('Missing releasesFolder')
    if (typeof context.cardInternalId !== 'string' || context.cardInternalId.length === 0) return false
    if (typeof context.file !== 'string' || context.file.length === 0) return false

    const normalizedFile = normalizePath(context.file).replace(/^\/+|\/+$/gu, '')
    const normalizedFolder = normalizePath(releasesFolder).replace(/^\/+|\/+$/gu, '')

    return normalizedFile.startsWith(`${normalizedFolder}/`)
}

/** Reject action execution for historical released cards. */
export function assertReleasedCardActionAllowed(context, releasesFolder) {
    if (isReleasedCardActionContext(context, releasesFolder)) throw new Error(RELEASED_CARD_RUN_MESSAGE)
}
