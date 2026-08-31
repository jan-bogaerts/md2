import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class ResizeObserver {
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
}

// MDXEditor is Lexical/contenteditable-based and does not render in jsdom, so
// swap it for a textarea stub with the same markdown/onChange contract.
vi.mock('@mdxeditor/editor', () => import('./mdx_editor_stub'))
vi.mock('@mdxeditor/editor/style.css', () => ({}))
vi.mock('@lexical/react/LexicalComposerContext', async () => {
    const { useLexicalComposerContextStub } = await import('./lexical_composer_context_stub')

    return { useLexicalComposerContext: useLexicalComposerContextStub }
})

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
