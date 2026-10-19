import { List, Paper, Popper } from '@mui/material'
import { useMemo } from 'react'
import { MarkdownPlaceholderOption } from './markdown_placeholder_option'
import { MarkdownPlaceholderOptionItem } from './markdown_placeholder_option_item'
import { useMarkdownTypeaheadStackPosition } from '../typeahead/markdown_typeahead_layer_context'

const PLACEHOLDER_MENU_MAX_HEIGHT = 320

interface MarkdownPlaceholderMenuProps {
    anchorRect: DOMRect
    onHighlight: (index: number) => void
    onSelect: (option: MarkdownPlaceholderOption) => void
    options: MarkdownPlaceholderOption[]
    selectedIndex: number | null
}

/** Creates a Popper anchor at a fixed viewport rectangle. */
function createVirtualAnchor(anchorRect: DOMRect) {
    return { getBoundingClientRect: () => anchorRect }
}

/** Placeholder typeahead results rendered at the caret, above the owning popup. */
export function MarkdownPlaceholderMenu(props: MarkdownPlaceholderMenuProps) {
    const { anchorRect, onHighlight, onSelect, options, selectedIndex } = props
    const stackPosition = useMarkdownTypeaheadStackPosition()
    const virtualAnchor = useMemo(() => createVirtualAnchor(anchorRect), [anchorRect])

    return (
        <Popper
            anchorEl={virtualAnchor}
            open
            placement="bottom-start"
            sx={(theme) => ({ zIndex: theme.zIndex.modal + stackPosition + 1 })}
        >
            <Paper
                sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: '14px',
                    boxShadow: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: PLACEHOLDER_MENU_MAX_HEIGHT,
                    minWidth: 280,
                    overflow: 'hidden',
                }}
            >
                <List aria-label="Available placeholders" dense disablePadding role="listbox" sx={{ minHeight: 0, overflowY: 'auto' }}>
                    {options.map((option, index) => (
                        <MarkdownPlaceholderOptionItem
                            index={index}
                            key={option.key}
                            onHighlight={onHighlight}
                            onSelect={onSelect}
                            placeholder={option.placeholder}
                            selectionOption={option}
                            selected={selectedIndex === index}
                            setRefElement={option.setRefElement}
                        />
                    ))}
                </List>
            </Paper>
        </Popper>
    )
}
