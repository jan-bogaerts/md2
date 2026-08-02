import {
    LexicalTypeaheadMenuPlugin,
    type MenuRenderFn,
    type TriggerFn,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { List, Paper } from '@mui/material'
import { useCellValue } from '@mdxeditor/editor'
import type { TextNode } from 'lexical'
import { createPortal } from 'react-dom'
import { useCallback, useMemo, useState } from 'react'
import { repositoryFileMatchesQuery } from './markdown_file_search'
import { markdownFileSearchConfig$ } from './markdown_file_search_config_cell'
import { MarkdownFileSearchOption } from './markdown_file_search_option'
import { MarkdownFileSearchOptionItem } from './markdown_file_search_option_item'
import { replaceFileSearchQuery } from './markdown_file_search_selection'
import { matchFileSearchTriggerForFiles } from './markdown_file_search_trigger'

/** Shows repository files at the caret after the user types `@`. */
export function MarkdownFileSearchTypeaheadPlugin() {
    const { overlayContainer, repositoryFiles } = useCellValue(markdownFileSearchConfig$)
    const [query, setQuery] = useState('')
    const options = useMemo(
        () => repositoryFiles
            .filter((repositoryPath) => repositoryFileMatchesQuery(repositoryPath, query))
            .map((repositoryPath) => new MarkdownFileSearchOption(repositoryPath)),
        [query, repositoryFiles],
    )

    const triggerFn = useCallback<TriggerFn>(
        (text) => matchFileSearchTriggerForFiles(text, repositoryFiles),
        [repositoryFiles],
    )

    const handleQueryChange = useCallback((nextQuery: string | null) => {
        setQuery(nextQuery ?? '')
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
            <Paper
                sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: '14px',
                    boxShadow: 8,
                    minWidth: 320,
                    overflow: 'hidden',
                }}
            >
                <List aria-label="Project files" dense disablePadding role="listbox" sx={{ maxHeight: 320, overflowY: 'auto' }}>
                    {itemProps.options.map((option, index) => (
                        <MarkdownFileSearchOptionItem
                            index={index}
                            key={option.key}
                            onHighlight={itemProps.setHighlightedIndex}
                            onSelect={itemProps.selectOptionAndCleanUp}
                            selected={itemProps.selectedIndex === index}
                            selectionOption={option}
                            setRefElement={option.setRefElement}
                        />
                    ))}
                </List>
            </Paper>,
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
