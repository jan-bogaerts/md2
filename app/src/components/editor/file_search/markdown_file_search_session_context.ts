import { createContext, useContext } from 'react'

export interface MarkdownFileSearchAnchorRect {
    height: number
    left: number
    top: number
    width: number
}

export const MarkdownFileSearchSessionContext = createContext<MarkdownFileSearchAnchorRect | null>(null)

/** Returns the fixed opening position for the active file-search session. */
export function useMarkdownFileSearchAnchorRect() {
    return useContext(MarkdownFileSearchSessionContext)
}
