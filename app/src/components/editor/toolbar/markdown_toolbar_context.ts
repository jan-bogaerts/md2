/** Editor-owned toolbar capabilities handed to custom toolbar contents. */
export interface MarkdownToolbarContext {
    onAttachFiles?: (files: File[]) => void
}
