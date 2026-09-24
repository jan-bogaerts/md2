import type { ReactNode } from 'react'
import { MarkdownFileSearchSessionContext } from './markdown_file_search_session_context'
import type { MarkdownFileSearchAnchorRect } from './markdown_file_search_session_context'

interface MarkdownFileSearchSessionProviderProps {
    anchorRect: MarkdownFileSearchAnchorRect | null
    children: ReactNode
}

/** Supplies the fixed opening position for the active file-search session. */
export function MarkdownFileSearchSessionProvider(props: MarkdownFileSearchSessionProviderProps) {
    const { anchorRect, children } = props

    return (
        <MarkdownFileSearchSessionContext.Provider value={anchorRect}>
            {children}
        </MarkdownFileSearchSessionContext.Provider>
    )
}
