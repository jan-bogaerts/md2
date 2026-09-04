import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppThemeProvider } from '../theme/theme_provider';
import { MovableFab } from './movable_fab';

describe('MovableFab', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    });

    afterEach(cleanup);

    it('activates on a plain click', () => {
        const onActivate = vi.fn();
        render(<MovableFab ariaLabel="Launcher" onActivate={onActivate} tooltip="Launcher">Open</MovableFab>, {wrapper: AppThemeProvider});
        const button = screen.getByRole('button', { name: 'Launcher' });

        fireEvent.click(button);

        expect(onActivate).toHaveBeenCalledWith(button);
    });

    it('starts dragging at five pixels, clamps movement, and suppresses only resulting click', () => {
        const onActivate = vi.fn();
        const onDragStart = vi.fn();
        render(
            <MovableFab ariaLabel="Launcher" onActivate={onActivate} onDragStart={onDragStart} tooltip="Launcher">Open</MovableFab>,
            { wrapper: AppThemeProvider },
        );
        const button = screen.getByRole('button', { name: 'Launcher' });
        const position = screen.getByTestId('movable-fab-position');

        fireEvent.pointerDown(button, { clientX: 1140, clientY: 740, pointerId: 1 });
        fireEvent.pointerMove(button, { clientX: 1137, clientY: 736, pointerId: 1 });
        fireEvent.pointerMove(button, { clientX: -1000, clientY: -1000, pointerId: 1 });
        fireEvent.pointerUp(button, { pointerId: 1 });
        fireEvent.click(button);

        expect(onDragStart).toHaveBeenCalledTimes(1);
        expect(position).toHaveStyle({ left: '16px', top: '16px' });
        expect(onActivate).not.toHaveBeenCalled();

        fireEvent.click(button);
        expect(onActivate).toHaveBeenCalledWith(button);
    });

    it('re-clamps both axes after viewport resize and leaves in-bounds coordinates unchanged', () => {
        render(<MovableFab ariaLabel="Launcher" onActivate={vi.fn()} tooltip="Launcher">Open</MovableFab>, {wrapper: AppThemeProvider});
        const position = screen.getByTestId('movable-fab-position');

        expect(position).toHaveStyle({ left: '1128px', top: '728px' });
        fireEvent.resize(window);
        expect(position).toHaveStyle({ left: '1128px', top: '728px' });

        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 });
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 700 });
        fireEvent.resize(window);

        expect(position).toHaveStyle({ left: '628px', top: '428px' });
    });

    it('reduces margins when viewport cannot fit normal margins', () => {
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 66 });
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 76 });

        render(<MovableFab ariaLabel="Launcher" onActivate={vi.fn()} tooltip="Launcher">Open</MovableFab>, {wrapper: AppThemeProvider});

        expect(screen.getByTestId('movable-fab-position')).toHaveStyle({ left: '10px', top: '5px' });
    });

    it('removes resize listener on unmount', () => {
        const addEventListener = vi.spyOn(window, 'addEventListener');
        const removeEventListener = vi.spyOn(window, 'removeEventListener');
        const { unmount } = render(
            <MovableFab ariaLabel="Launcher" onActivate={vi.fn()} tooltip="Launcher">Open</MovableFab>,
            {wrapper: AppThemeProvider},
        );
        const resizeListener = addEventListener.mock.calls.find(([eventType]) => String(eventType) === 'resize')?.[1];
        if (!resizeListener) throw new Error('Missing resize listener');

        unmount();

        expect(removeEventListener).toHaveBeenCalledWith('resize', resizeListener);
    });
});
