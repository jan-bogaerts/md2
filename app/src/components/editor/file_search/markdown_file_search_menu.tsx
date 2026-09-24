import { Typography } from '@mui/material'
import { useCallback, useState } from 'react'
import { ResizablePopper } from '../../resizable_popper'
import type { MarkdownFileSearchOption } from './markdown_file_search_option'
import { FILE_SEARCH_OPTION_ESTIMATED_HEIGHT, MarkdownFileSearchResults } from './markdown_file_search_results'
import { MarkdownFileSearchSessionAnchor } from './markdown_file_search_session_anchor'
import type { MarkdownFileSearchAnchorRect } from './markdown_file_search_session_context'
import { useMarkdownTypeaheadStackPosition } from '../typeahead/markdown_typeahead_layer_context'

const FILE_SEARCH_MENU_MAX_HEIGHT = 320
const FILE_SEARCH_MENU_DEFAULT_WIDTH = 320
const FILE_SEARCH_MENU_MIN_WIDTH = 280
const FILE_SEARCH_TITLE_ID = 'markdown-file-search-title'
const FILE_SEARCH_MENU_SIZE = { height: FILE_SEARCH_MENU_MAX_HEIGHT, width: FILE_SEARCH_MENU_DEFAULT_WIDTH }

export const MARKDOWN_FILE_SEARCH_SIZE_STORAGE_KEY = 'md2.markdownFileSearchMenuSize'

interface MarkdownFileSearchMenuProps {
    anchorRect: MarkdownFileSearchAnchorRect
    onHighlight: (index: number) => void
    onSelect: (option: MarkdownFileSearchOption) => void
    options: MarkdownFileSearchOption[]
    selectedIndex: number | null
}

/** Virtualized project-file typeahead results. */
export function MarkdownFileSearchMenu(props: MarkdownFileSearchMenuProps) {
    const { anchorRect, onHighlight, onSelect, options, selectedIndex } = props
    const stackPosition = useMarkdownTypeaheadStackPosition()
    const [sessionAnchor, setSessionAnchor] = useState<HTMLDivElement | null>(null)
    const handleAnchorElement = useCallback((element: HTMLDivElement | null) => {
        setSessionAnchor(element)
    }, [])

    return (
        <>
            <MarkdownFileSearchSessionAnchor anchorRect={anchorRect} setAnchorElement={handleAnchorElement} />
            <ResizablePopper
                anchorElement={sessionAnchor}
                closeOnEscape={false}
                constrainSizeToViewport
                focusOnMount={false}
                initialSize={FILE_SEARCH_MENU_SIZE}
                labelId={FILE_SEARCH_TITLE_ID}
                minimumSize={{ height: FILE_SEARCH_OPTION_ESTIMATED_HEIGHT, width: FILE_SEARCH_MENU_MIN_WIDTH }}
                open={!!sessionAnchor}
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
                persistSizeOnResizeEndOnly
                stackPosition={stackPosition + 1}
                storageKey={MARKDOWN_FILE_SEARCH_SIZE_STORAGE_KEY}
            >
                <Typography
                    id={FILE_SEARCH_TITLE_ID}
                    sx={{ clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', height: 1, overflow: 'hidden', position: 'absolute', whiteSpace: 'nowrap', width: 1 }}
                >
                    Project files
                </Typography>
                <MarkdownFileSearchResults
                    onHighlight={onHighlight}
                    onSelect={onSelect}
                    options={options}
                    selectedIndex={selectedIndex}
                />
            </ResizablePopper>
        </>
    )
}
