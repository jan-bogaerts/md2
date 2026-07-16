import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    DARK_TITLE_BAR_OVERLAY,
    DEFAULT_THEME_MODE,
    LIGHT_TITLE_BAR_OVERLAY,
    isThemeMode,
    resolveThemeMode,
    resolveTitleBarOverlay,
} = require('./theme');

describe('theme', () => {
    it('recognizes valid theme modes', () => {
        expect(isThemeMode('light')).toBe(true);
        expect(isThemeMode('dark')).toBe(true);
        expect(isThemeMode('sepia')).toBe(false);
    });

    it('resolves unknown values to the default mode', () => {
        expect(resolveThemeMode('dark')).toBe('dark');
        expect(resolveThemeMode(undefined)).toBe(DEFAULT_THEME_MODE);
        expect(resolveThemeMode('bogus')).toBe(DEFAULT_THEME_MODE);
    });

    it('maps the theme mode to matching native window controls', () => {
        expect(resolveTitleBarOverlay('dark')).toEqual(DARK_TITLE_BAR_OVERLAY);
        expect(resolveTitleBarOverlay('light')).toEqual(LIGHT_TITLE_BAR_OVERLAY);
        expect(resolveTitleBarOverlay(undefined)).toEqual(LIGHT_TITLE_BAR_OVERLAY);
    });
});
