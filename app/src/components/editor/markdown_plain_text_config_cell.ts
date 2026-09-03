import { Cell } from '@mdxeditor/editor'
import type { LexicalEditor } from 'lexical'

export interface MarkdownPlainTextConfig {
    initialText: string
    onEditorReady: (editor: LexicalEditor) => void
}

export const markdownPlainTextConfig$ = Cell<MarkdownPlainTextConfig | null>(null)
