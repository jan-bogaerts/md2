import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HorizontalScrollArea, SCROLL_STEP } from './horizontal_scroll_area';

const SCROLLER_WIDTH = 300;
const OVERFLOWING_CONTENT_WIDTH = 800;
const FITTING_CONTENT_WIDTH = 200;
const WHEEL_DELTA = 120;

interface ScrollLayout {
    contentWidth: number
    scrollLeft: number
}

interface ScrollHarness {
    layout: ScrollLayout
    scrollBy: ReturnType<typeof vi.fn>
    scroller: HTMLElement
}

function renderScrollArea(contentWidth: number, scrollLeft = 0): ScrollHarness {
    render(
        <HorizontalScrollArea>
            <button type="button">First</button>
            <button type="button">Last</button>
        </HorizontalScrollArea>,
    );
    const content = screen.getByRole('button', { name: 'First' }).parentElement;
    const scroller = content?.parentElement;
    if (!content || !scroller) throw new Error('Expected scroll area structure');
    const layout: ScrollLayout = { contentWidth, scrollLeft };
    const scrollBy = vi.fn();
    Object.defineProperties(content, { scrollWidth: { configurable: true, get: () => layout.contentWidth } });
    Object.defineProperties(scroller, {
        clientWidth: { configurable: true, get: () => SCROLLER_WIDTH },
        scrollBy: { configurable: true, value: scrollBy },
        scrollLeft: {
            configurable: true,
            get: () => layout.scrollLeft,
            set: (value: number) => { layout.scrollLeft = value; },
        },
        scrollWidth: { configurable: true, get: () => layout.contentWidth },
    });
    fireEvent.scroll(scroller);

    return { layout, scrollBy, scroller };
}

function scrollEndPosition() {
    return OVERFLOWING_CONTENT_WIDTH - SCROLLER_WIDTH;
}

describe('HorizontalScrollArea', () => {
    afterEach(cleanup);

    it('shows no buttons when content fits', () => {
        renderScrollArea(FITTING_CONTENT_WIDTH);

        expect(screen.queryByRole('button', { name: 'Scroll left' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Scroll right' })).not.toBeInTheDocument();
    });

    it('shows only the right button at the start', () => {
        renderScrollArea(OVERFLOWING_CONTENT_WIDTH);

        expect(screen.queryByRole('button', { name: 'Scroll left' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Scroll right' })).toBeInTheDocument();
    });

    it('shows both buttons in the middle', () => {
        renderScrollArea(OVERFLOWING_CONTENT_WIDTH, SCROLL_STEP);

        expect(screen.getByRole('button', { name: 'Scroll left' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Scroll right' })).toBeInTheDocument();
    });

    it('shows only the left button at the end', () => {
        renderScrollArea(OVERFLOWING_CONTENT_WIDTH, scrollEndPosition());

        expect(screen.getByRole('button', { name: 'Scroll left' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Scroll right' })).not.toBeInTheDocument();
    });

    it('updates buttons when scrolled', () => {
        const { layout, scroller } = renderScrollArea(OVERFLOWING_CONTENT_WIDTH);

        layout.scrollLeft = scrollEndPosition();
        fireEvent.scroll(scroller);

        expect(screen.getByRole('button', { name: 'Scroll left' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Scroll right' })).not.toBeInTheDocument();
    });

    it('scrolls by one step when a button is clicked', () => {
        const { scrollBy } = renderScrollArea(OVERFLOWING_CONTENT_WIDTH, SCROLL_STEP);

        fireEvent.click(screen.getByRole('button', { name: 'Scroll right' }));
        fireEvent.click(screen.getByRole('button', { name: 'Scroll left' }));

        expect(scrollBy).toHaveBeenNthCalledWith(1, { behavior: 'smooth', left: SCROLL_STEP });
        expect(scrollBy).toHaveBeenNthCalledWith(2, { behavior: 'smooth', left: -SCROLL_STEP });
    });

    it('converts vertical wheel movement into horizontal scrolling when content overflows', () => {
        const { layout, scroller } = renderScrollArea(OVERFLOWING_CONTENT_WIDTH);

        const notCancelled = fireEvent.wheel(scroller, { deltaX: 0, deltaY: WHEEL_DELTA });

        expect(notCancelled).toBe(false);
        expect(layout.scrollLeft).toBe(WHEEL_DELTA);
    });

    it('leaves sideways wheel movement alone', () => {
        const { layout, scroller } = renderScrollArea(OVERFLOWING_CONTENT_WIDTH);

        const notCancelled = fireEvent.wheel(scroller, { deltaX: WHEEL_DELTA, deltaY: 0 });

        expect(notCancelled).toBe(true);
        expect(layout.scrollLeft).toBe(0);
    });

    it('does not capture the wheel when content fits', () => {
        const { layout, scroller } = renderScrollArea(FITTING_CONTENT_WIDTH);

        const notCancelled = fireEvent.wheel(scroller, { deltaX: 0, deltaY: WHEEL_DELTA });

        expect(notCancelled).toBe(true);
        expect(layout.scrollLeft).toBe(0);
    });

    it('scrolls a focused control into view', () => {
        renderScrollArea(OVERFLOWING_CONTENT_WIDTH);
        const lastButton = screen.getByRole('button', { name: 'Last' });
        const scrollIntoView = vi.fn();
        lastButton.scrollIntoView = scrollIntoView;

        fireEvent.focusIn(lastButton);

        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    });
});
