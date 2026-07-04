import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// MDXEditor is Lexical/contenteditable-based and does not render in jsdom, so
// swap it for a textarea stub with the same markdown/onChange contract.
vi.mock('@mdxeditor/editor', () => import('./mdx_editor_stub'))
vi.mock('@mdxeditor/editor/style.css', () => ({}))

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
