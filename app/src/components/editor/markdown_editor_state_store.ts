/** Publishes one Markdown editor instance's dirty-buffer state. */
export class MarkdownEditorStateStore extends EventTarget {
    private dirty = false

    getSnapshot = () => this.dirty

    setDirty(dirty: boolean) {
        if (this.dirty === dirty) return

        this.dirty = dirty
        this.dispatchEvent(new Event('changed'))
    }

    subscribe = (onStoreChange: () => void) => {
        this.addEventListener('changed', onStoreChange)

        return () => this.removeEventListener('changed', onStoreChange)
    }
}
