import { Cell } from '@mdxeditor/editor'
import type { ActiveMarkdownDocumentChangedDetail, MarkdownBindingKind, MarkdownDataSource } from './markdown_data_source'
import type { MarkdownDocumentHistoryStore } from './markdown_document_history_store'

export interface MarkdownDocumentHistoryConfig {
    binding: MarkdownBindingKind
    completeDocumentSwitch: (markdown: string) => void
    dataSource: MarkdownDataSource
    getDocumentId: () => string | null
    getMarkdown: () => string
    historyStore: MarkdownDocumentHistoryStore
    prepareDocumentSwitch: (detail: ActiveMarkdownDocumentChangedDetail, markdown: string) => string | null
    replaceMarkdown: (markdown: string) => void
    setPendingDocumentChangeRetry: (retry: () => void) => void
}

export const markdownDocumentHistoryConfig$ = Cell<MarkdownDocumentHistoryConfig | null>(null)
export const markdownDocumentHistoryStore$ = Cell<MarkdownDocumentHistoryStore | null>(null)
