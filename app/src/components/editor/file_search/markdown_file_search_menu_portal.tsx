import type { MarkdownFileSearchOption } from './markdown_file_search_option'
import { MarkdownFileSearchMenu } from './markdown_file_search_menu'
import { useMarkdownFileSearchAnchorRect } from './markdown_file_search_session_context'

interface MarkdownFileSearchMenuPortalProps {
    onHighlight: (index: number) => void
    onSelect: (option: MarkdownFileSearchOption) => void
    options: MarkdownFileSearchOption[]
    selectedIndex: number | null
}

/** Connects Lexical's changing menu values to the fixed file-search session position. */
export function MarkdownFileSearchMenuPortal(props: MarkdownFileSearchMenuPortalProps) {
    const { onHighlight, onSelect, options, selectedIndex } = props
    const anchorRect = useMarkdownFileSearchAnchorRect()
    if (!anchorRect) return null

    return (
        <MarkdownFileSearchMenu
            anchorRect={anchorRect}
            onHighlight={onHighlight}
            onSelect={onSelect}
            options={options}
            selectedIndex={selectedIndex}
        />
    )
}
