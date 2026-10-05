import { describe, expect, it } from 'vitest';
import { calculateMainToolbarLayout, type MainToolbarMeasurements } from './main_toolbar_layout';

const MEASUREMENTS: MainToolbarMeasurements = {
    navigationWidth: 180, safeAreaLeft: 0, safeAreaWidth: 1440,
    searchWidths: { full: 230, search: 180, shortcut: 125 },
    titleWidth: 600, utilitiesWidth: 32, viewportWidth: 1440,
};

describe('calculateMainToolbarLayout', () => {
    it('shows a complete long title when there is room between the controls', () => {
        const layout = calculateMainToolbarLayout(MEASUREMENTS);

        expect(layout.titleWidth).toBe(MEASUREMENTS.titleWidth);
        expect(layout.titleLeft + layout.titleWidth / 2).toBe(MEASUREMENTS.viewportWidth / 2);
    });

    it.each([
        ['full', 640], ['search', 580], ['shortcut', 520], ['icon', 400],
    ] as const)('uses the %s search presentation as the measured space narrows', (presentation, viewportWidth) => {
        const layout = calculateMainToolbarLayout({ ...MEASUREMENTS, safeAreaWidth: viewportWidth, viewportWidth });

        expect(layout.searchPresentation).toBe(presentation);
        if (presentation !== 'icon') expect(layout.searchWidth).toBeGreaterThanOrEqual(MEASUREMENTS.searchWidths[presentation]);
    });

    it('keeps the complete shortcut when that requires giving up the preferred title space', () => {
        const layout = calculateMainToolbarLayout({ ...MEASUREMENTS, safeAreaWidth: 460, viewportWidth: 460 });

        expect(layout.searchPresentation).toBe('shortcut');
        expect(layout.searchWidth).toBeGreaterThanOrEqual(MEASUREMENTS.searchWidths.shortcut);
        expect(layout.titleWidth).toBeLessThan(MEASUREMENTS.titleWidth);
    });

    it.each([
        ['macOS', 84, 0], ['Windows', 0, 138], ['fullscreen and web', 0, 0],
    ])('centers fitting titles on the whole %s window despite asymmetric native controls', (_platform, left, right) => {
        const measurements = { ...MEASUREMENTS, safeAreaLeft: left, safeAreaWidth: 1440 - left - right, titleWidth: 100 };
        const layout = calculateMainToolbarLayout(measurements);

        expect(layout.titleLeft + left + layout.titleWidth / 2).toBe(measurements.viewportWidth / 2);
    });

    it('moves and truncates an oversized title inside the gap instead of overlapping either control group', () => {
        const layout = calculateMainToolbarLayout({ ...MEASUREMENTS, safeAreaLeft: 84, safeAreaWidth: 700, viewportWidth: 784 });

        expect(layout.titleWidth).toBeLessThan(MEASUREMENTS.titleWidth);
        expect(layout.titleLeft).toBeGreaterThan(MEASUREMENTS.navigationWidth);
        expect(layout.titleLeft + layout.titleWidth + layout.searchWidth + MEASUREMENTS.utilitiesWidth).toBeLessThan(700);
    });

    it('does not change the complete keycap width when the keycap text is wider', () => {
        const searchWidths = { full: 300, search: 250, shortcut: 200 };
        const layout = calculateMainToolbarLayout({ ...MEASUREMENTS, safeAreaWidth: 490, searchWidths, viewportWidth: 490 });

        expect(layout.searchPresentation).toBe('shortcut');
        expect(layout.searchWidth).toBeGreaterThanOrEqual(searchWidths.shortcut);
    });
});
