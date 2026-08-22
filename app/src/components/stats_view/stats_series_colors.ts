import type { StatsChartRow } from '../../services/stats/project_stats_types';

const CSS_COLOR_VALUE_COUNT = 0x1000000;
const NEUTRAL_GROUP = '';

export interface StatsSeriesPalettes {
    /** Per-agent color families, keyed by provider or agent name. */
    groups: Record<string, string[]>;
    /** Fallback list for series that belong to no known agent. */
    neutral: string[];
}

export interface StatsSeriesColorInput {
    /** Palette family key, or the empty string for the neutral list. */
    group: string;
    identity: string;
    key: string;
}

function colorKey(group: string, identity: string) {
    return `${group}\u0000${identity}`;
}

function effectiveSeriesIdentity(row: StatsChartRow) {
    return row.seriesIdentity ?? row.identity;
}

function normalizedCssColor(color: string) {
    return color.trim().toLowerCase();
}

function randomCssColor() {
    const colorValue = Math.floor(Math.random() * CSS_COLOR_VALUE_COUNT);

    return `#${colorValue.toString(16).padStart(6, '0')}`;
}

function matchedGroup(groupNames: string[], colorGroup: string | null) {
    if (!colorGroup) return NEUTRAL_GROUP;
    const normalized = colorGroup.trim().toLowerCase();

    return groupNames.find((name) => name.trim().toLowerCase() === normalized) ?? NEUTRAL_GROUP;
}

/**
 * Sorted, order-independent palette assignment inputs: one entry per distinct effective series
 * identity, carrying the agent family it belongs to.
 */
export function seriesColorInputs(rows: StatsChartRow[], groupNames: string[]): StatsSeriesColorInput[] {
    const inputsByKey = new Map<string, StatsSeriesColorInput>();
    for (const row of rows) {
        const identity = effectiveSeriesIdentity(row);
        const group = matchedGroup(groupNames, row.provider ?? row.agent);
        const key = colorKey(group, identity);
        inputsByKey.set(key, { group, identity, key });
    }

    return [...inputsByKey.values()]
        .sort((left, right) => left.group.localeCompare(right.group) || left.identity.localeCompare(right.identity));
}

/** Looks up one row's group-scoped color identity. */
export function seriesColorKey(row: StatsChartRow, groupNames: string[]) {
    const group = matchedGroup(groupNames, row.provider ?? row.agent);

    return colorKey(group, effectiveSeriesIdentity(row));
}

/** Assigns one stable color per series identity: agent families first, neutral list last. */
export function allocateSeriesColors(inputs: StatsSeriesColorInput[], palettes: StatsSeriesPalettes) {
    const usedColors = new Set<string>();
    const colorsByIdentity = new Map<string, string>();
    const takenByGroup = new Map<string, number>();
    // Neutral entries are allocated last so an agent family never loses its color to a shared one.
    const ordered = [
        ...inputs.filter(({ group }) => group !== NEUTRAL_GROUP),
        ...inputs.filter(({ group }) => group === NEUTRAL_GROUP),
    ];

    for (const { group, key } of ordered) {
        const palette = group === NEUTRAL_GROUP ? palettes.neutral : palettes.groups[group] ?? palettes.neutral;
        let index = takenByGroup.get(group) ?? 0;
        let color = palette[index];
        while (color !== undefined && usedColors.has(normalizedCssColor(color))) {
            index += 1;
            color = palette[index];
        }
        takenByGroup.set(group, index + 1);
        let assigned = color ?? randomCssColor();

        while (usedColors.has(normalizedCssColor(assigned))) assigned = randomCssColor();

        usedColors.add(normalizedCssColor(assigned));
        colorsByIdentity.set(key, assigned);
    }

    return colorsByIdentity;
}

/** Same agent, same color in every chart: the family and the slot come from the identity, not row order. */
export function assignSeriesColors(rows: StatsChartRow[], palettes: StatsSeriesPalettes) {
    return allocateSeriesColors(seriesColorInputs(rows, Object.keys(palettes.groups)), palettes);
}

/** Serialized-argument entry point so charts can memoize on identities and palettes alone. */
export function assignSeriesColorsFromKeys(inputsKey: string, palettesKey: string) {
    return allocateSeriesColors(JSON.parse(inputsKey) as StatsSeriesColorInput[], JSON.parse(palettesKey) as StatsSeriesPalettes);
}
