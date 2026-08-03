import { Cell } from '@mdxeditor/editor'

export interface MarkdownFileSearchConfig {
    overlayContainer?: HTMLElement | null
    repositoryFiles: readonly string[]
}

export const markdownFileSearchConfig$ = Cell<MarkdownFileSearchConfig>({ repositoryFiles: [] })
