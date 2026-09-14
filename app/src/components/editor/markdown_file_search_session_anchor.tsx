import { createPortal } from 'react-dom'
import type { MarkdownFileSearchAnchorRect } from './markdown_file_search_session_context'

interface MarkdownFileSearchSessionAnchorProps {
    anchorRect: MarkdownFileSearchAnchorRect
    setAnchorElement: (element: HTMLDivElement | null) => void
}

/** Renders a viewport-fixed anchor at the position where the typeahead session opened. */
export function MarkdownFileSearchSessionAnchor(props: MarkdownFileSearchSessionAnchorProps) {
    const { anchorRect, setAnchorElement } = props

    return createPortal(
        <div
            aria-hidden="true"
            data-markdown-file-search-anchor="true"
            ref={setAnchorElement}
            style={{
                height: anchorRect.height,
                left: anchorRect.left,
                pointerEvents: 'none',
                position: 'fixed',
                top: anchorRect.top,
                width: anchorRect.width,
            }}
        />,
        document.body,
    )
}
