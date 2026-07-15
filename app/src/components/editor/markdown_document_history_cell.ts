import { Cell } from '@mdxeditor/editor'
import type { MarkdownDocumentHistoryStore } from './markdown_document_history_store'

export const markdownDocumentHistoryStore$ = Cell<MarkdownDocumentHistoryStore | null>(null)
