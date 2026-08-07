import {
    LexicalTypeaheadMenuPlugin,
    type MenuRenderFn,
    type TriggerFn,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { useCellValue } from '@mdxeditor/editor'
import type { TextNode } from 'lexical'
import { createPortal } from 'react-dom'
import { useCallback, useMemo, useState } from 'react'
import { markdownFileSearchConfig$ } from './markdown_file_search_config_cell'
import { MarkdownFileSearchMenu } from './markdown_file_search_menu'
import { MarkdownFileSearchOption } from './markdown_file_search_option'
import { createFileSearchOptions } from './markdown_file_search_options'
import { replaceFileSearchQuery } from './markdown_file_search_selection'
import { matchFileSearchTriggerForFiles } from './markdown_file_search_trigger'

/** Shows repository files at the caret after the user types `@`. */
export function MarkdownFileSearchTypeaheadPlugin() {
    const { overlayContainer, repositoryFiles } = useCellValue(markdownFileSearchConfig$)
    const [query, setQuery] = useState<string | null>(null)
    const options = useMemo(
        () => createFileSearchOptions(repositoryFiles, query),
        [query, repositoryFiles],
    )

    const triggerFn = useCallback<TriggerFn>(
        (text) => matchFileSearchTriggerForFiles(text, repositoryFiles),
        [repositoryFiles],
    )

    const handleQueryChange = useCallback((nextQuery: string | null) => {
        setQuery(nextQuery)
    }, [])

    const handleSelectOption = useCallback((
        option: MarkdownFileSearchOption,
        textNodeContainingQuery: TextNode | null,
        closeMenu: () => void,
    ) => {
        replaceFileSearchQuery(option, textNodeContainingQuery, closeMenu)
    }, [])

    const renderMenu = useCallback<MenuRenderFn<MarkdownFileSearchOption>>((anchorElementRef, itemProps) => {
        if (!anchorElementRef.current || itemProps.options.length === 0) return null

        return createPortal(
            <MarkdownFileSearchMenu
                onHighlight={itemProps.setHighlightedIndex}
                onSelect={itemProps.selectOptionAndCleanUp}
                options={itemProps.options}
                selectedIndex={itemProps.selectedIndex}
            />,
            anchorElementRef.current,
        )
    }, [])

    return (
        <LexicalTypeaheadMenuPlugin<MarkdownFileSearchOption>
            menuRenderFn={renderMenu}
            onQueryChange={handleQueryChange}
            onSelectOption={handleSelectOption}
            options={options}
            parent={overlayContainer ?? undefined}
            triggerFn={triggerFn}
        />
    )
}
