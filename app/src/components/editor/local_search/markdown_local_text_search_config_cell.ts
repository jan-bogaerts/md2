import { Cell } from '@mdxeditor/editor'

export interface MarkdownLocalTextSearchConfig {
    overlayContainer?: HTMLElement | null
    readOnly?: boolean
}

export const markdownLocalTextSearchConfig$ = Cell<MarkdownLocalTextSearchConfig | null>(null)
