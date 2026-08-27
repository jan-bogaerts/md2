import { useEffect } from 'react'
import {
    MARKDOWN_FLUSH_REQUESTED_EVENT,
    MARKDOWN_INSERTION_REQUESTED_EVENT,
    type MarkdownDraftBinding,
    type MarkdownInsertionRequest,
} from '../../services/markdown/markdown_draft'

/** Applies external replacements and insertion requests from one Markdown draft to its mounted editor. */
export function useMarkdownDraft(
    draft: MarkdownDraftBinding | undefined,
    insertMarkdown: (markdown: string) => void,
    replaceMarkdown: (markdown: string) => void,
    flush: () => boolean,
    bindDraft: (draft: MarkdownDraftBinding | undefined) => void,
) {
    useEffect(() => {
        if (!draft) {
            bindDraft(undefined)

            return undefined
        }

        replaceMarkdown(draft.getSnapshot())
        bindDraft(draft)

        return draft.subscribeEditor(() => replaceMarkdown(draft.getSnapshot()))
    }, [bindDraft, draft, replaceMarkdown])

    useEffect(() => {
        if (!draft) return undefined

        const handleInsertionRequest = (event: Event) => {
            const request = (event as CustomEvent<MarkdownInsertionRequest>).detail
            try {
                insertMarkdown(request.markdown)
                request.acknowledge()
            } catch (error) {
                request.reject(error)
            }
        }
        draft.addEventListener(MARKDOWN_INSERTION_REQUESTED_EVENT, handleInsertionRequest)

        return () => draft.removeEventListener(MARKDOWN_INSERTION_REQUESTED_EVENT, handleInsertionRequest)
    }, [draft, insertMarkdown])

    useEffect(() => {
        if (!draft) return undefined

        const handleFlushRequest = () => {
            flush()
        }
        draft.addEventListener(MARKDOWN_FLUSH_REQUESTED_EVENT, handleFlushRequest)

        return () => draft.removeEventListener(MARKDOWN_FLUSH_REQUESTED_EVENT, handleFlushRequest)
    }, [draft, flush])
}
