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
