import { Typography } from '@mui/material'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
const FILE_SEARCH_MENU_SIZE = { height: FILE_SEARCH_MENU_MAX_HEIGHT, width: FILE_SEARCH_MENU_DEFAULT_WIDTH }

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

/**
 * Places the frozen anchor on the caret, converting out of the page coordinate space Lexical
 * writes onto its own anchor.
 *
 * Lexical adds the scroll offsets to the caret's viewport rect, so `source.style.left` / `top`
 * are page coordinates. Both anchors are `position: absolute`, so the browser resolves those
 * numbers against the nearest positioned ancestor. Inside the card details popup that ancestor is
 * the popper Paper, which shifts the popup by the Paper's own position. Converting page ->
 * viewport -> containing-block-local puts the popup back under the caret. Only the placement
 * matters, so the frozen element stays zero-width.
 */
function copyAnchorPlacement(source: HTMLElement, target: HTMLElement) {
    const pageLeft = parseFloat(source.style.left)
    const pageTop = parseFloat(source.style.top)
    if (Number.isNaN(pageLeft) || Number.isNaN(pageTop)) return

    const offsetParent = target.offsetParent
    let left = pageLeft
    let top = pageTop
    if (offsetParent) {
        const parentRect = offsetParent.getBoundingClientRect()
        // Page -> viewport, then viewport -> the offset parent's padding box, which is where
        // absolute offsets start while getBoundingClientRect measures the border box.
        left = pageLeft - window.scrollX - parentRect.left + offsetParent.scrollLeft - offsetParent.clientLeft
        top = pageTop - window.scrollY - parentRect.top + offsetParent.scrollTop - offsetParent.clientTop
    }

    target.style.left = `${left}px`
    target.style.top = `${top}px`
    target.style.height = source.style.height
}

/**
 * Returns a stationary stand-in for Lexical's typeahead anchor.
 *
 * Lexical resizes and repositions its own anchor on every keystroke after `@`, which drags the
 * popup along with it. The stand-in lives in the same scrolling container, so it still travels
 * with the editor, but its coordinates are captured once per typeahead session and never again.
 * The capture waits one animation frame because Lexical positions its anchor in the plugin's
 * effect, which React runs after this portalled menu's own mount effect.
 */
function useFrozenAnchorElement(anchorElement: HTMLElement) {
    const [frozenAnchor, setFrozenAnchor] = useState<HTMLElement | null>(null)

    useLayoutEffect(() => {
        const container = anchorElement.parentElement ?? anchorElement
        const frozen = anchorElement.ownerDocument.createElement('div')
        frozen.dataset.markdownFileSearchAnchor = 'true'
        frozen.style.position = 'absolute'
        frozen.style.width = '0px'
        frozen.style.pointerEvents = 'none'
        container.append(frozen)
        const frame = window.requestAnimationFrame(() => {
            copyAnchorPlacement(anchorElement, frozen)
            setFrozenAnchor(frozen)
        })

        return () => {
            window.cancelAnimationFrame(frame)
            frozen.remove()
            setFrozenAnchor(null)
        }
    }, [anchorElement])

    return frozenAnchor
}

/** Virtualized project-file typeahead results. */
export function MarkdownFileSearchMenu(props: MarkdownFileSearchMenuProps) {
    const { anchorElement, onHighlight, onSelect, options, selectedIndex } = props
    const stackPosition = useMarkdownTypeaheadStackPosition()
    const virtuosoRef = useRef<VirtuosoHandle>(null)
    const frozenAnchor = useFrozenAnchorElement(anchorElement)
    const context = useMemo(
        () => ({ onHighlight, onSelect, selectedIndex }),
        [onHighlight, onSelect, selectedIndex],
    )

    useEffect(() => {
        if (selectedIndex === null) return

        virtuosoRef.current?.scrollIntoView({ index: selectedIndex })
    }, [options, selectedIndex])

    if (!frozenAnchor) return null

    return (
        <ResizablePopper
            anchorElement={frozenAnchor}
            closeOnEscape={false}
            constrainSizeToViewport
            focusOnMount={false}
            initialSize={FILE_SEARCH_MENU_SIZE}
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
            {options.length === 0 ? (
                <Typography sx={{ color: 'text.secondary', px: 2, py: 1.5 }}>No matching files</Typography>
            ) : (
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
            )}
        </ResizablePopper>
    )
}
