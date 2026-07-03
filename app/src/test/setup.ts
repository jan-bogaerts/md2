import '@testing-library/jest-dom/vitest'

if (!window.matchMedia) {
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
}
