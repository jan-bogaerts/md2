import type { StatsSeriesSlots } from '../../services/stats/stats_series_slots';

const CSS_COLOR_VALUE_COUNT = 0x1000000;
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const MAX_OVERFLOW_ATTEMPTS = 16;

export interface StatsSeriesPalettes {
    /** Per-agent color families, keyed by provider or agent name. */
    groups: Record<string, string[]>;
    /** Fallback list for series that belong to no known agent. */
    neutral: string[];
}

function normalizedCssColor(color: string) {
    return color.trim().toLowerCase();
}

/** Deterministic color for one label and attempt: FNV-1a hash folded into the CSS color range. */
function hashedCssColor(label: string, attempt: number) {
    let hash = FNV_OFFSET_BASIS;
    for (const character of `${label}\u0000${attempt}`) hash = Math.imul(hash ^ character.codePointAt(0)!, FNV_PRIME);
    const colorValue = (hash >>> 0) % CSS_COLOR_VALUE_COUNT;

    return `#${colorValue.toString(16).padStart(6, '0')}`;
}

function overflowColor(label: string, usedColors: Set<string>) {
    let color = hashedCssColor(label, 0);
    for (let attempt = 1; attempt < MAX_OVERFLOW_ATTEMPTS && usedColors.has(color); attempt += 1) color = hashedCssColor(label, attempt);

    return color;
}

/**
 * Turns remembered series slots into colors. Family labels take their slot of the family palette; labels without
 * a known family take the next neutral color that no family uses. Labels are resolved in registration order, so a
 * later label never changes an earlier color.
 */
export function resolveSeriesColors(slots: StatsSeriesSlots, palettes: StatsSeriesPalettes) {
    const familyPalettes = new Map(Object.entries(palettes.groups).map(([name, colors]) => [name.trim().toLowerCase(), colors]));
    const familyColors = new Set([...familyPalettes.values()].flat().map(normalizedCssColor));
    const neutralPalette = palettes.neutral.filter((color) => !familyColors.has(normalizedCssColor(color)));
    const usedColors = new Set<string>();
    const colorsByLabel = new Map<string, string>();
    const ordered = [...slots].sort(([, left], [, right]) => left.order - right.order);
    let neutralIndex = 0;

    for (const [label, { group, slot }] of ordered) {
        const familyPalette = familyPalettes.get(group);
        const paletteColor = familyPalette ? familyPalette[slot] : neutralPalette[neutralIndex];
        if (!familyPalette) neutralIndex += 1;
        const isFree = paletteColor !== undefined && !usedColors.has(normalizedCssColor(paletteColor));
        const color = isFree ? paletteColor : overflowColor(label, usedColors);
        usedColors.add(normalizedCssColor(color));
        colorsByLabel.set(label, color);
    }

    return colorsByLabel;
}
