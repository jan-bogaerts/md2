import { Cell } from '@mdxeditor/editor'

export interface MarkdownPasteConfig {
    insertMarkdown: (markdown: string) => void
}

export const markdownPasteConfig$ = Cell<MarkdownPasteConfig | null>(null)
