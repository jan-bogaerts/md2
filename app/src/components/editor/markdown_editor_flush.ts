/**
 * Registry of mounted markdown editors with unflushed edits. Editors register a
 * flush callback while mounted; app-level lifecycle hooks (window blur, hide,
 * close, Electron quit) call `flushMarkdownEditors` so pending editor content
 * reaches `DataService` before commits are flushed.
 */

const flushCallbacks = new Set<() => void>()

export function registerMarkdownEditorFlush(flush: () => void) {
    flushCallbacks.add(flush)

    return () => {
        flushCallbacks.delete(flush)
    }
}

export function flushMarkdownEditors() {
    for (const flush of [...flushCallbacks]) flush()
}
