import { describe, expect, it } from 'vitest';
import type { DiagramSequenceFragment } from './diagram_data';
import { planFragmentUpdate } from './diagram_fragment_update_plan';

const fragment: DiagramSequenceFragment = {
    id: 'conditional',
    operator: 'opt',
    regions: [{ edgeIds: ['first', 'second'], guard: 'ready' }],
};

describe('planFragmentUpdate', () => {
    it('finds reordered edges and captures their previous order', () => {
        const plan = planFragmentUpdate(fragment, 'opt', [{ edgeIds: ['second', 'first'], guard: 'ready' }]);

        expect(plan?.changedRegionIndexes).toEqual([0]);
        expect(plan?.previousRegions[0].edgeIds).toEqual(['first', 'second']);
        expect(plan?.previousRegions[0].edgeIds).not.toBe(fragment.regions[0].edgeIds);
    });

    it('returns no plan for an unchanged fragment', () => {
        expect(planFragmentUpdate(fragment, 'opt', fragment.regions)).toBeNull();
    });
});
