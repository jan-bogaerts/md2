import { Box, IconButton, type Theme } from '@mui/material';
import ChevronLeft from 'mdi-material-ui/ChevronLeft';
import ChevronRight from 'mdi-material-ui/ChevronRight';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/** Width of each floating scroll button and of the placeholders reserving space for it. */
export const SCROLL_BUTTON_WIDTH = 32;
/** Distance scrolled by one scroll button click. */
export const SCROLL_STEP = 200;
/** Sub-pixel tolerance used when deciding whether the scroll end has been reached. */
const SCROLL_EDGE_TOLERANCE = 1;

interface HorizontalScrollAreaProps {
    children: ReactNode
}

interface ScrollState {
    canScrollEnd: boolean
    canScrollStart: boolean
    overflowing: boolean
}

const NO_SCROLL: ScrollState = { canScrollEnd: false, canScrollStart: false, overflowing: false };

/** Reads overflow and scroll-direction availability from the scroller and its content. */
function measureScrollState(scroller: HTMLElement, content: HTMLElement): ScrollState {
    const overflowing = content.scrollWidth > scroller.clientWidth;
    if (!overflowing) return NO_SCROLL;
    const canScrollStart = scroller.scrollLeft > SCROLL_EDGE_TOLERANCE;
    const canScrollEnd = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - SCROLL_EDGE_TOLERANCE;

    return { canScrollEnd, canScrollStart, overflowing };
}

function isSameScrollState(left: ScrollState, right: ScrollState) {
    return left.canScrollEnd === right.canScrollEnd
        && left.canScrollStart === right.canScrollStart
        && left.overflowing === right.overflowing;
}

function startFade(theme: Theme) {
    return `linear-gradient(to right, ${theme.palette.background.paper} 60%, transparent)`;
}

function endFade(theme: Theme) {
    return `linear-gradient(to left, ${theme.palette.background.paper} 60%, transparent)`;
}

const buttonContainerSx = {
    alignItems: 'center',
    bottom: 0,
    display: 'flex',
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    width: SCROLL_BUTTON_WIDTH,
    zIndex: 1,
} as const;
const startButtonContainerSx = { ...buttonContainerSx, background: startFade, left: 0 };
const endButtonContainerSx = { ...buttonContainerSx, background: endFade, right: 0 };
const placeholderSx = { flexShrink: 0, width: SCROLL_BUTTON_WIDTH };
const scrollerSx = {
    display: 'flex',
    gap: 'inherit',
    height: '100%',
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'none',
    scrollPaddingInline: `${SCROLL_BUTTON_WIDTH}px`,
    '&::-webkit-scrollbar': { display: 'none' },
} as const;
const rowSx = { alignItems: 'center', display: 'flex', gap: 'inherit', minWidth: '100%', width: 'max-content' };
const contentSx = { alignItems: 'center', display: 'flex', flex: '1 0 auto', gap: 'inherit' };
const rootSx = { flex: 1, gap: 'inherit', minWidth: 0, position: 'relative' };

/** Horizontal scroller without native scrollbars: floating start/end buttons, wheel and focus scrolling. */
export function HorizontalScrollArea(props: HorizontalScrollAreaProps) {
    const { children } = props;
    const scrollerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [scrollState, setScrollState] = useState<ScrollState>(NO_SCROLL);

    const updateScrollState = useCallback(() => {
        const scroller = scrollerRef.current;
        const content = contentRef.current;
        if (!scroller || !content) return;
        const nextState = measureScrollState(scroller, content);
        setScrollState(current => isSameScrollState(current, nextState) ? current : nextState);
    }, []);

    useEffect(() => {
        const scroller = scrollerRef.current;
        const content = contentRef.current;
        if (!scroller || !content) return;

        const handleWheel = (event: WheelEvent) => {
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            if (content.scrollWidth <= scroller.clientWidth) return;
            event.preventDefault();
            scroller.scrollLeft += event.deltaY;
        };
        const handleFocusIn = (event: FocusEvent) => {
            if (!(event.target instanceof HTMLElement)) return;
            event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        };
        const resizeObserver = new ResizeObserver(updateScrollState);
        resizeObserver.observe(scroller);
        resizeObserver.observe(content);
        scroller.addEventListener('scroll', updateScrollState);
        scroller.addEventListener('wheel', handleWheel, { passive: false });
        scroller.addEventListener('focusin', handleFocusIn);
        updateScrollState();

        return () => {
            resizeObserver.disconnect();
            scroller.removeEventListener('scroll', updateScrollState);
            scroller.removeEventListener('wheel', handleWheel);
            scroller.removeEventListener('focusin', handleFocusIn);
        };
    }, [updateScrollState]);

    const scrollToStart = useCallback(() => {
        scrollerRef.current?.scrollBy({ behavior: 'smooth', left: -SCROLL_STEP });
    }, []);
    const scrollToEnd = useCallback(() => {
        scrollerRef.current?.scrollBy({ behavior: 'smooth', left: SCROLL_STEP });
    }, []);

    const { canScrollEnd, canScrollStart, overflowing } = scrollState;

    return (
        <Box sx={rootSx}>
            {canScrollStart ? (
                <Box sx={startButtonContainerSx}>
                    <IconButton aria-label="Scroll left" onClick={scrollToStart} size="small">
                        <ChevronLeft fontSize="small" />
                    </IconButton>
                </Box>
            ) : null}
            <Box ref={scrollerRef} sx={scrollerSx}>
                <Box sx={rowSx}>
                    {overflowing ? <Box data-testid="scroll-placeholder-start" sx={placeholderSx} /> : null}
                    <Box ref={contentRef} sx={contentSx}>
                        {children}
                    </Box>
                    {overflowing ? <Box data-testid="scroll-placeholder-end" sx={placeholderSx} /> : null}
                </Box>
            </Box>
            {canScrollEnd ? (
                <Box sx={endButtonContainerSx}>
                    <IconButton aria-label="Scroll right" onClick={scrollToEnd} size="small">
                        <ChevronRight fontSize="small" />
                    </IconButton>
                </Box>
            ) : null}
        </Box>
    );
}
