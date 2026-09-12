import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiagramComparisonLayoutService } from './diagram_comparison_layout_service';
import { DiagramComparisonMenuControl } from './diagram_comparison_menu_control';

function setMobile(matches: boolean) {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn(() => ({ addEventListener: vi.fn(), matches, removeEventListener: vi.fn() })),
    });
}

beforeEach(() => setMobile(false));
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('DiagramComparisonMenuControl', () => {
    it('changes comparison mode through labelled icon controls', async () => {
        const layoutService = new DiagramComparisonLayoutService();
        const user = userEvent.setup();
        render(<DiagramComparisonMenuControl layoutService={layoutService} />);

        expect(screen.getByRole('button', { name: 'Vertical' })).toHaveAttribute('aria-pressed', 'true');
        await user.click(screen.getByRole('button', { name: 'Horizontal' }));
        expect(layoutService.getComparisonModeSnapshot()).toBe('horizontal');
        await user.click(screen.getByRole('button', { name: 'Tabbed' }));
        expect(layoutService.getComparisonModeSnapshot()).toBe('tabbed');
    });

    it('forces Tabbed and disables split controls on mobile without changing stored mode', () => {
        setMobile(true);
        const layoutService = new DiagramComparisonLayoutService();
        render(<DiagramComparisonMenuControl layoutService={layoutService} />);

        expect(screen.getByRole('button', { name: 'Vertical' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Horizontal' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Tabbed' })).toHaveAttribute('aria-pressed', 'true');
        expect(layoutService.getComparisonModeSnapshot()).toBe('vertical');
    });
});
