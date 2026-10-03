import type { SearchPresentation } from '../search/search_field_styles';

export const TOOLBAR_SEARCH_WIDTH = 260;
export const TOOLBAR_ICON_WIDTH = 32;
export const TOOLBAR_PADDING = 12;
export const TOOLBAR_GROUP_GAP = 8;
export const TOOLBAR_TITLE_CLEARANCE = 16;
const MINIMUM_TITLE_WIDTH = 96;

export interface MainToolbarMeasurements {
    navigationWidth: number;
    safeAreaLeft: number;
    safeAreaWidth: number;
    searchWidths: { full: number; search: number; shortcut: number };
    titleWidth: number;
    utilitiesWidth: number;
    viewportWidth: number;
}

export interface MainToolbarLayout {
    searchPresentation: SearchPresentation;
    searchWidth: number;
    titleLeft: number;
    titleWidth: number;
}

/** Allocate measured content inside the native safe area, preserving the shortcut before title space. */
export function calculateMainToolbarLayout(measurements: MainToolbarMeasurements): MainToolbarLayout {
    const { navigationWidth, safeAreaLeft, safeAreaWidth, searchWidths, titleWidth, utilitiesWidth, viewportWidth } = measurements;
    const titleStart = TOOLBAR_PADDING + navigationWidth + TOOLBAR_TITLE_CLEARANCE;
    const rightBase = TOOLBAR_PADDING + utilitiesWidth + TOOLBAR_GROUP_GAP + TOOLBAR_TITLE_CLEARANCE;
    const availableWidth = Math.max(0, safeAreaWidth - titleStart - rightBase);
    const searchBudget = Math.max(0, availableWidth - MINIMUM_TITLE_WIDTH);
    const presentations = ['full', 'search', 'shortcut'] as const;
    const fittingPresentation = presentations.find((presentation) => searchWidths[presentation] <= searchBudget);
    const searchPresentation = fittingPresentation ?? (searchWidths.shortcut <= availableWidth ? 'shortcut' : 'icon');
    const searchWidth = fittingPresentation
        ? Math.min(TOOLBAR_SEARCH_WIDTH, searchBudget)
        : searchPresentation === 'shortcut' ? searchWidths.shortcut : TOOLBAR_ICON_WIDTH;
    const visibleTitleWidth = Math.min(titleWidth, Math.max(0, availableWidth - searchWidth));
    const maximumTitleLeft = Math.max(titleStart, safeAreaWidth - rightBase - searchWidth - visibleTitleWidth);
    const centeredTitleLeft = (viewportWidth - visibleTitleWidth) / 2 - safeAreaLeft;
    const titleLeft = Math.min(maximumTitleLeft, Math.max(titleStart, centeredTitleLeft));

    return { searchPresentation, searchWidth, titleLeft, titleWidth: visibleTitleWidth };
}
