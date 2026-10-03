import '@testing-library/jest-dom/vitest'

class TestResizeObserver implements ResizeObserver {
    private readonly observedElements = new Set<Element>()

    disconnect() {
        this.observedElements.clear()
    }

    observe(target: Element) {
        this.observedElements.add(target)
    }

    unobserve(target: Element) {
        this.observedElements.delete(target)
    }
}

window.matchMedia = (query: string) => ({
    addEventListener: () => {},
    addListener: () => {},
    dispatchEvent: () => false,
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: () => {},
    removeListener: () => {},
}) as unknown as MediaQueryList

globalThis.ResizeObserver = TestResizeObserver

// jsdom has no layout, so scrollIntoView does not exist.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

// CodeMirror measures text ranges; jsdom has no layout APIs for those ranges.
if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => new DOMRect();
if (!Range.prototype.getClientRects) Range.prototype.getClientRects = () => Object.assign([], { item: () => null });
