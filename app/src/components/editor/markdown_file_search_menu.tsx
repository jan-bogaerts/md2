import { Typography } from '@mui/material'
import { useEffect, useMemo, useRef } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { ResizablePopper } from '../resizable_popper'
import type { MarkdownFileSearchOption } from './markdown_file_search_option'
import { MarkdownFileSearchOptionItem } from './markdown_file_search_option_item'
import { useMarkdownTypeaheadStackPosition } from './markdown_typeahead_layer_context'

const FILE_SEARCH_MENU_MAX_HEIGHT = 320
const FILE_SEARCH_MENU_DEFAULT_WIDTH = 320
const FILE_SEARCH_MENU_MIN_WIDTH = 280
const FILE_SEARCH_OPTION_ESTIMATED_HEIGHT = 52
const FILE_SEARCH_OVERSCAN = 104
const FILE_SEARCH_TITLE_ID = 'markdown-file-search-title'

export const MARKDOWN_FILE_SEARCH_SIZE_STORAGE_KEY = 'md2.markdownFileSearchMenuSize'

interface MarkdownFileSearchMenuProps {
    anchorElement: HTMLElement
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
    const { anchorElement, onHighlight, onSelect, options, selectedIndex } = props
    const stackPosition = useMarkdownTypeaheadStackPosition()
    const virtuosoRef = useRef<VirtuosoHandle>(null)
    const context = useMemo(
        () => ({ onHighlight, onSelect, selectedIndex }),
        [onHighlight, onSelect, selectedIndex],
    )
    const height = Math.min(FILE_SEARCH_MENU_MAX_HEIGHT, Math.max(FILE_SEARCH_OPTION_ESTIMATED_HEIGHT, options.length * FILE_SEARCH_OPTION_ESTIMATED_HEIGHT))

    useEffect(() => {
        if (selectedIndex === null) return

        virtuosoRef.current?.scrollIntoView({ index: selectedIndex })
    }, [options, selectedIndex])

    return (
        <ResizablePopper
            anchorElement={anchorElement}
            closeOnEscape={false}
            constrainSizeToViewport
            focusOnMount={false}
            initialSize={{ height, width: FILE_SEARCH_MENU_DEFAULT_WIDTH }}
            labelId={FILE_SEARCH_TITLE_ID}
            minimumSize={{ height: FILE_SEARCH_OPTION_ESTIMATED_HEIGHT, width: FILE_SEARCH_MENU_MIN_WIDTH }}
            open
            paperSx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '14px',
                boxShadow: 8,
                flexDirection: 'column',
                overflow: 'hidden',
            }}
            resizeFromAllSides
            resizeLabel="Resize file selector"
            stackPosition={stackPosition + 1}
            storageKey={MARKDOWN_FILE_SEARCH_SIZE_STORAGE_KEY}
        >
            <Typography
                id={FILE_SEARCH_TITLE_ID}
                sx={{ clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', height: 1, overflow: 'hidden', position: 'absolute', whiteSpace: 'nowrap', width: 1 }}
            >
                Project files
            </Typography>
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
        </ResizablePopper>
    )
}
