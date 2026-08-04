import { createContext, useContext } from 'react'

export const MarkdownTypeaheadStackPositionContext = createContext(0)

/** Returns the owning popup's offset above the MUI modal layer. */
export function useMarkdownTypeaheadStackPosition() {
    return useContext(MarkdownTypeaheadStackPositionContext)
}
