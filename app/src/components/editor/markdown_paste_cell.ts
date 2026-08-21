import { Cell } from '@mdxeditor/editor'

export interface MarkdownPasteConfig {
    imagePasteHandler?: MarkdownImagePasteHandler
    insertMarkdown: (markdown: string) => void
    readOnly: boolean
}

export type MarkdownImagePasteHandler = (file: File, insertMarkdown: (markdown: string) => void) => Promise<void>

export const markdownPasteConfig$ = Cell<MarkdownPasteConfig | null>(null)
