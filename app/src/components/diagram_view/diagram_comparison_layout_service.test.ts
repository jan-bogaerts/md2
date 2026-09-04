import { describe, expect, it, vi } from 'vitest';
import { DiagramComparisonLayoutService } from './diagram_comparison_layout_service';

describe('DiagramComparisonLayoutService', () => {
    it('publishes only changed divider ratios', () => {
        const service = new DiagramComparisonLayoutService();
        const listener = vi.fn();
        const unsubscribe = service.subscribeHorizontalDivider(listener);

        service.setHorizontalDividerRatio(0.75);
        service.setHorizontalDividerRatio(0.75);
        unsubscribe();
        service.setHorizontalDividerRatio(0.25);

        expect(listener).toHaveBeenCalledTimes(1);
        expect(service.getHorizontalDividerSnapshot()).toBe(0.25);
    });

    it('clamps ratios to valid bounds', () => {
        const service = new DiagramComparisonLayoutService();

        service.setHorizontalDividerRatio(-1);
        expect(service.getHorizontalDividerSnapshot()).toBe(0);

        service.setHorizontalDividerRatio(2);
        expect(service.getHorizontalDividerSnapshot()).toBe(1);
    });

    it('rejects a non-finite ratio', () => {
        const service = new DiagramComparisonLayoutService();

        expect(() => service.setHorizontalDividerRatio(Number.NaN)).toThrow('Horizontal diagram divider ratio must be finite');
    });
});
