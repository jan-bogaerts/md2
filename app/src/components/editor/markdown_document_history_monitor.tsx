import { useCellValue } from '@mdxeditor/editor'
import { useEffect } from 'react'
import { markdownDocumentHistoryConfig$ } from './markdown_document_history_cell'
import {
    sameMarkdownTarget,
    type ActiveMarkdownDocumentChangedDetail,
    type MarkdownReplacedDetail,
} from './markdown_data_source'

/** Keeps one editor's content and document history synchronized with its data-source binding. */
export function MarkdownDocumentHistoryMonitor() {
    const config = useCellValue(markdownDocumentHistoryConfig$)

    useEffect(() => {
        if (!config) throw new Error('Cannot monitor Markdown history without configuration')

        const {
            binding,
            completeDocumentSwitch,
            dataSource,
            getTarget,
            getMarkdown,
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
            historyStore.switchDocument(detail.target, markdown, currentMarkdown, replaceMarkdown)
            completeDocumentSwitch(getMarkdown())
        }
        const handleActiveDocumentChanged = (event: Event) => {
            const detail = (event as CustomEvent<ActiveMarkdownDocumentChangedDetail>).detail
            if (detail.binding !== binding) return

            pendingDocumentChange = detail
            applyPendingDocumentChange()
        }
        const handleMarkdownReplaced = (event: Event) => {
            const detail = (event as CustomEvent<MarkdownReplacedDetail>).detail
            if (!sameMarkdownTarget(detail.target, getTarget()) || detail.originBinding === binding) return

            replaceMarkdown(dataSource.getMarkdown(detail.target))
            const markdown = getMarkdown()
            historyStore.replaceDocument(detail.target, markdown)
            completeDocumentSwitch(markdown)
        }
        dataSource.addEventListener('activeDocumentChanged', handleActiveDocumentChanged)
        dataSource.addEventListener('markdownReplaced', handleMarkdownReplaced)
        setPendingDocumentChangeRetry(applyPendingDocumentChange)

        return () => {
            setPendingDocumentChangeRetry(() => undefined)
            dataSource.removeEventListener('activeDocumentChanged', handleActiveDocumentChanged)
            dataSource.removeEventListener('markdownReplaced', handleMarkdownReplaced)
        }
    }, [config])

    return null
}
