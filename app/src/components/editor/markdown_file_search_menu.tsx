import { Paper } from '@mui/material'
import { useEffect, useMemo, useRef } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import type { MarkdownFileSearchOption } from './markdown_file_search_option'
import { MarkdownFileSearchOptionItem } from './markdown_file_search_option_item'
import { useMarkdownTypeaheadStackPosition } from './markdown_typeahead_layer_context'

const FILE_SEARCH_MENU_MAX_HEIGHT = 320
const FILE_SEARCH_OPTION_ESTIMATED_HEIGHT = 52
const FILE_SEARCH_OVERSCAN = 104

interface MarkdownFileSearchMenuProps {
    onHighlight: (index: number) => void
    onSelect: (option: MarkdownFileSearchOption) => void
    options: MarkdownFileSearchOption[]
    selectedIndex: number | null
}

interface MarkdownFileSearchMenuContext {
    onHighlight: (index: number) => void
    onSelect: (option: MarkdownFileSearchOption) => void
    selectedIndex: number | null
}

function optionKey(_index: number, option: MarkdownFileSearchOption) {
    return option.key
}

function renderOption(index: number, option: MarkdownFileSearchOption, context: MarkdownFileSearchMenuContext) {
    return (
        <MarkdownFileSearchOptionItem
            index={index}
            onHighlight={context.onHighlight}
            onSelect={context.onSelect}
            selected={context.selectedIndex === index}
            selectionOption={option}
            setRefElement={option.setRefElement}
        />
    )
}

/** Virtualized project-file typeahead results. */
export function MarkdownFileSearchMenu(props: MarkdownFileSearchMenuProps) {
    const { onHighlight, onSelect, options, selectedIndex } = props
    const stackPosition = useMarkdownTypeaheadStackPosition()
    const virtuosoRef = useRef<VirtuosoHandle>(null)
    const context = useMemo(
        () => ({ onHighlight, onSelect, selectedIndex }),
        [onHighlight, onSelect, selectedIndex],
    )
    const height = Math.min(FILE_SEARCH_MENU_MAX_HEIGHT, options.length * FILE_SEARCH_OPTION_ESTIMATED_HEIGHT)

    useEffect(() => {
        if (selectedIndex === null) return

        virtuosoRef.current?.scrollIntoView({ index: selectedIndex })
    }, [options, selectedIndex])

    return (
        <Paper
            sx={(theme) => ({
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '14px',
                boxShadow: 8,
                minWidth: 320,
                overflow: 'hidden',
                position: 'relative',
                zIndex: theme.zIndex.modal + stackPosition + 1,
            })}
        >
            <Virtuoso
                aria-label="Project files"
                computeItemKey={optionKey}
                context={context}
                data={options}
                defaultItemHeight={FILE_SEARCH_OPTION_ESTIMATED_HEIGHT}
                itemContent={renderOption}
                overscan={FILE_SEARCH_OVERSCAN}
                ref={virtuosoRef}
                role="listbox"
                style={{ height }}
            />
        </Paper>
    )
}
