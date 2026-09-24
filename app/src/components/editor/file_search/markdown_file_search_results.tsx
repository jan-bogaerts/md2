import { Typography } from '@mui/material'
import { useEffect, useMemo, useRef } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import type { MarkdownFileSearchOption } from './markdown_file_search_option'
import { MarkdownFileSearchOptionItem } from './markdown_file_search_option_item'

const FILE_SEARCH_OPTION_ESTIMATED_HEIGHT = 52
const FILE_SEARCH_OVERSCAN = 104

interface MarkdownFileSearchResultsProps {
    onHighlight: (index: number) => void
    onSelect: (option: MarkdownFileSearchOption) => void
    options: MarkdownFileSearchOption[]
    selectedIndex: number | null
}

interface MarkdownFileSearchResultsContext {
    onHighlight: (index: number) => void
    onSelect: (option: MarkdownFileSearchOption) => void
    selectedIndex: number | null
}

function optionKey(_index: number, option: MarkdownFileSearchOption) {
    return option.key
}

function renderOption(index: number, option: MarkdownFileSearchOption, context: MarkdownFileSearchResultsContext) {
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

/** Renders the changing result list for an open file-search session. */
export function MarkdownFileSearchResults(props: MarkdownFileSearchResultsProps) {
    const { onHighlight, onSelect, options, selectedIndex } = props
    const virtuosoRef = useRef<VirtuosoHandle>(null)
    const context = useMemo(
        () => ({ onHighlight, onSelect, selectedIndex }),
        [onHighlight, onSelect, selectedIndex],
    )

    useEffect(() => {
        if (selectedIndex === null) return

        virtuosoRef.current?.scrollIntoView({ index: selectedIndex })
    }, [options, selectedIndex])

    if (options.length === 0) {
        return <Typography sx={{ color: 'text.secondary', px: 2, py: 1.5 }}>No matching files</Typography>
    }

    return (
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
            style={{ flex: 1, height: '100%', minHeight: 0, width: '100%' }}
        />
    )
}

export { FILE_SEARCH_OPTION_ESTIMATED_HEIGHT }
