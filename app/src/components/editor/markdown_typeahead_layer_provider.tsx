import type { ReactNode } from 'react'
import { MarkdownTypeaheadStackPositionContext } from './markdown_typeahead_layer_context'

interface MarkdownTypeaheadLayerProviderProps {
    children: ReactNode
    stackPosition: number
}

/** Supplies the owning popup stack position to Markdown caret menus. */
export function MarkdownTypeaheadLayerProvider(props: MarkdownTypeaheadLayerProviderProps) {
    const { children, stackPosition } = props

    return (
        <MarkdownTypeaheadStackPositionContext.Provider value={stackPosition}>
            {children}
        </MarkdownTypeaheadStackPositionContext.Provider>
    )
}
