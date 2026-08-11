import { Cell } from '@mdxeditor/editor'

export interface MarkdownPasteConfig {
    getSelectionMarkdown: () => string
    insertMarkdown: (markdown: string) => void
    readOnly: boolean
}

export const markdownPasteConfig$ = Cell<MarkdownPasteConfig | null>(null)
