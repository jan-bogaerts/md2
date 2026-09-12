export const SENTRY_CARD_TITLE_MAX_LENGTH = 50;

/** Normalizes and limits a Sentry issue title for a new card header and filename. */
export function compactSentryCardTitle(title: string) {
    const normalizedTitle = title.trim().replace(/\s+/gu, ' ');
    if (!normalizedTitle) throw new Error('Cannot import a Sentry issue without a title');

    return [...normalizedTitle].slice(0, SENTRY_CARD_TITLE_MAX_LENGTH).join('');
}
