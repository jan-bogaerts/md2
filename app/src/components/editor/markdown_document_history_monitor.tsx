import { useCellValue } from '@mdxeditor/editor'
import { useEffect } from 'react'
import { useDialogError } from '../hooks/use_dialog_error'
import { markdownDocumentHistoryConfig$ } from './markdown_document_history_cell'
import {
    sameMarkdownTarget,
    type ActiveMarkdownDocumentChangedDetail,
    type MarkdownReplacedDetail,
} from './markdown_data_source'

/** Keeps one editor's content and document history synchronized with its data-source binding. */
export function MarkdownDocumentHistoryMonitor() {
    const config = useCellValue(markdownDocumentHistoryConfig$)
    const configurationError = config ? null : new Error('Cannot monitor Markdown history without configuration')
    useDialogError(configurationError, 'Markdown history monitoring is unavailable')

    useEffect(() => {
        if (!config) return

        const {
            binding,
            completeDocumentSwitch,
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
            historyStore.switchDocument(detail.target, markdown, currentMarkdown, replaceMarkdown)
            completeDocumentSwitch(markdown)
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
            completeDocumentSwitch(markdown)
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
    }, [config])

    return null
}
