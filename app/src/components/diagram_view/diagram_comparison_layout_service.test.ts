import { describe, expect, it, vi } from 'vitest';
import { DiagramComparisonLayoutService } from './diagram_comparison_layout_service';

describe('DiagramComparisonLayoutService', () => {
    it('publishes comparison mode changes independently', () => {
        const service = new DiagramComparisonLayoutService();
        const modeListener = vi.fn();
        const activeTabListener = vi.fn();
        const horizontalDividerListener = vi.fn();
        const verticalDividerListener = vi.fn();
        const unsubscribe = service.subscribeComparisonMode(modeListener);
        service.subscribeActiveTab(activeTabListener);
        service.subscribeHorizontalDivider(horizontalDividerListener);
        service.subscribeVerticalDivider(verticalDividerListener);

        expect(service.getComparisonModeSnapshot()).toBe('vertical');

        service.setComparisonMode('horizontal');
        service.setComparisonMode('horizontal');
        unsubscribe();
        service.setComparisonMode('tabbed');

        expect(modeListener).toHaveBeenCalledTimes(1);
        expect(activeTabListener).not.toHaveBeenCalled();
        expect(horizontalDividerListener).not.toHaveBeenCalled();
        expect(verticalDividerListener).not.toHaveBeenCalled();
        expect(service.getComparisonModeSnapshot()).toBe('tabbed');
    });

    it('publishes active tab changes without publishing divider changes', () => {
        const service = new DiagramComparisonLayoutService();
        const activeTabListener = vi.fn();
        const dividerListener = vi.fn();
        const unsubscribeActiveTab = service.subscribeActiveTab(activeTabListener);
        service.subscribeHorizontalDivider(dividerListener);

        service.setActiveTab('new');
        service.setActiveTab('new');
        unsubscribeActiveTab();
        service.setActiveTab('current');

        expect(activeTabListener).toHaveBeenCalledTimes(1);
        expect(dividerListener).not.toHaveBeenCalled();
        expect(service.getActiveTabSnapshot()).toBe('current');
    });

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

    it('publishes vertical divider changes independently', () => {
        const service = new DiagramComparisonLayoutService();
        const horizontalListener = vi.fn();
        const verticalListener = vi.fn();
        service.subscribeHorizontalDivider(horizontalListener);
        const unsubscribe = service.subscribeVerticalDivider(verticalListener);

        service.setVerticalDividerRatio(0.75);
        service.setVerticalDividerRatio(0.75);
        unsubscribe();
        service.setVerticalDividerRatio(0.25);

        expect(horizontalListener).not.toHaveBeenCalled();
        expect(verticalListener).toHaveBeenCalledTimes(1);
        expect(service.getVerticalDividerSnapshot()).toBe(0.25);
    });

    it('clamps vertical ratios and rejects non-finite values', () => {
        const service = new DiagramComparisonLayoutService();

        service.setVerticalDividerRatio(-1);
        expect(service.getVerticalDividerSnapshot()).toBe(0);

        service.setVerticalDividerRatio(2);
        expect(service.getVerticalDividerSnapshot()).toBe(1);
        expect(() => service.setVerticalDividerRatio(Number.NaN)).toThrow('Vertical diagram divider ratio must be finite');
    });
});
