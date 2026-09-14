import { describe, expect, it } from 'vitest';
import { compactSentryCardTitle, SENTRY_CARD_TITLE_MAX_LENGTH } from './sentry_card_title';

describe('compactSentryCardTitle', () => {
    it('trims outer whitespace and collapses internal whitespace runs', () => {
        expect(compactSentryCardTitle('  Checkout\t failure\r\n in   production  ')).toBe('Checkout failure in production');
    });

    it('keeps titles at the 50-code-point boundary unchanged', () => {
        const title = 'a'.repeat(SENTRY_CARD_TITLE_MAX_LENGTH);

        expect(compactSentryCardTitle(title)).toBe(title);
    });

    it('truncates after 50 Unicode code points without splitting a surrogate pair', () => {
        const title = `${'a'.repeat(SENTRY_CARD_TITLE_MAX_LENGTH - 1)}😀tail`;
        const compactTitle = compactSentryCardTitle(title);

        expect(compactTitle).toBe(`${'a'.repeat(SENTRY_CARD_TITLE_MAX_LENGTH - 1)}😀`);
        expect([...compactTitle]).toHaveLength(SENTRY_CARD_TITLE_MAX_LENGTH);
    });

    it('rejects titles empty after normalization', () => {
        expect(() => compactSentryCardTitle(' \t\r\n ')).toThrow('Cannot import a Sentry issue without a title');
    });
});
