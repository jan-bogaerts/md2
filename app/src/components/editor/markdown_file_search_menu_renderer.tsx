import type { MenuRenderFn } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { createPortal } from 'react-dom'
import { MarkdownFileSearchMenu } from './markdown_file_search_menu'
import type { MarkdownFileSearchOption } from './markdown_file_search_option'

/**
 * Renders the file-reference popup for the running typeahead session.
 *
 * An empty option list keeps the popup mounted so a query that matches nothing shows the
 * empty-state message instead of closing and reopening at a new anchor once matches return.
 */
export const renderFileSearchMenu: MenuRenderFn<MarkdownFileSearchOption> = (anchorElementRef, itemProps) => {
    if (!anchorElementRef.current) return null

    return createPortal(
        <MarkdownFileSearchMenu
            anchorElement={anchorElementRef.current}
            onHighlight={itemProps.setHighlightedIndex}
            onSelect={itemProps.selectOptionAndCleanUp}
            options={itemProps.options}
            selectedIndex={itemProps.selectedIndex}
        />,
        anchorElementRef.current,
    )
}
