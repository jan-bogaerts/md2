import { Cell } from '@mdxeditor/editor'
import type { ActionPlaceholder } from '../../data/action_placeholders'

export interface MarkdownPlaceholderConfig {
    overlayContainer?: HTMLElement | null
    placeholders: readonly ActionPlaceholder[]
}

export const markdownPlaceholderConfig$ = Cell<MarkdownPlaceholderConfig>({ placeholders: [] })
