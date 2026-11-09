import type { MarkdownDocumentHistoryConfig } from './markdown_document_history_cell'
import {
    sameMarkdownTarget,
    type ActiveMarkdownDocumentChangedDetail,
    type MarkdownReplacedDetail,
} from '../data_sources/markdown_data_source'

/** Starts data-source monitoring after its history store is attached. */
export function monitorMarkdownDocumentHistory(config: MarkdownDocumentHistoryConfig) {
    const {
        binding,
        cancelDocumentSwitch,
        dataSource,
        getTarget,
        historyStore,
        prepareDocumentSwitch,
        replaceMarkdown,
        setPendingDocumentChangeRetry,
    } = config
    let pendingDocumentChange: ActiveMarkdownDocumentChangedDetail | null = null

    const applyPendingDocumentChange = () => {
        const detail = pendingDocumentChange
        if (!detail) return

        const markdown = detail.target ? dataSource.getMarkdown(detail.target) : ''
        const currentMarkdown = prepareDocumentSwitch(detail, markdown)
        if (currentMarkdown === null) return

        pendingDocumentChange = null
        try {
            historyStore.switchDocument(detail.target, markdown, currentMarkdown, replaceMarkdown)
        } catch (error) {
            cancelDocumentSwitch()
            throw error
        }
    }
    const handleActiveDocumentChanged = (event: Event) => {
        const detail = (event as CustomEvent<ActiveMarkdownDocumentChangedDetail>).detail
        if (detail.binding !== binding) return

        pendingDocumentChange = detail
        applyPendingDocumentChange()
    }
    const reconcileActiveDocument = () => {
        const target = dataSource.getActiveTarget(binding)
        if (sameMarkdownTarget(target, getTarget())) return
        if (!pendingDocumentChange || !sameMarkdownTarget(pendingDocumentChange.target, target)) {
            pendingDocumentChange = { binding, target }
        }
        applyPendingDocumentChange()
    }
    const handleMarkdownReplaced = (event: Event) => {
        const detail = (event as CustomEvent<MarkdownReplacedDetail>).detail
        if (!sameMarkdownTarget(detail.target, getTarget()) || detail.originBinding === binding) return

        const markdown = dataSource.getMarkdown(detail.target)
        replaceMarkdown(markdown)
        historyStore.replaceDocument(detail.target, markdown)
    }
    dataSource.addEventListener('activeDocumentChanged', handleActiveDocumentChanged)
    dataSource.addEventListener('markdownReplaced', handleMarkdownReplaced)
    setPendingDocumentChangeRetry(applyPendingDocumentChange)
    reconcileActiveDocument()

    return () => {
        setPendingDocumentChangeRetry(() => undefined)
        dataSource.removeEventListener('activeDocumentChanged', handleActiveDocumentChanged)
        dataSource.removeEventListener('markdownReplaced', handleMarkdownReplaced)
    }
}
