import { Cell } from '@mdxeditor/editor'

export interface MarkdownLocalTextSearchConfig {
    overlayContainer?: HTMLElement | null
}

export const markdownLocalTextSearchConfig$ = Cell<MarkdownLocalTextSearchConfig | null>(null)
