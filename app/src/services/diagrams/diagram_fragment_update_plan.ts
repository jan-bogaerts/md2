import type { DiagramSequenceFragment, DiagramSequenceFragmentRegion, DiagramSequenceOperator } from './diagram_data';

export interface DiagramFragmentUpdatePlan {
    changedRegionIndexes: number[];
    operatorChanged: boolean;
    previousOperator: DiagramSequenceOperator;
    previousRegions: DiagramSequenceFragmentRegion[];
}

/** Captures the affected regions before an already validated fragment edit is applied. */
export function planFragmentUpdate(
    fragment: DiagramSequenceFragment,
    operator: DiagramSequenceOperator,
    regions: readonly DiagramSequenceFragmentRegion[],
): DiagramFragmentUpdatePlan | null {
    const operatorChanged = fragment.operator !== operator;
    const maximumRegionCount = Math.max(fragment.regions.length, regions.length);
    const changedRegionIndexes = Array.from({ length: maximumRegionCount }, (_value, index) => index).filter((index) => {
        const previousRegion = fragment.regions[index];
        const region = regions[index];
        const previousEdgeIds = previousRegion?.edgeIds ?? [];
        const edgeIds = region?.edgeIds ?? [];

        return previousRegion?.guard !== region?.guard
            || previousEdgeIds.length !== edgeIds.length
            || previousEdgeIds.some((edgeId, edgeIndex) => edgeId !== edgeIds[edgeIndex]);
    });
    if (!operatorChanged && changedRegionIndexes.length === 0) return null;

    return {
        changedRegionIndexes,
        operatorChanged,
        previousOperator: fragment.operator,
        previousRegions: fragment.regions.map(({ edgeIds, guard }) => ({ edgeIds: [...edgeIds], guard })),
    };
}
