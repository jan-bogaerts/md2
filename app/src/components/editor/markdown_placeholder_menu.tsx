import { List, Paper } from '@mui/material'
import { MarkdownPlaceholderOption } from './markdown_placeholder_option'
import { MarkdownPlaceholderOptionItem } from './markdown_placeholder_option_item'
import { useMarkdownTypeaheadStackPosition } from './markdown_typeahead_layer_context'

interface MarkdownPlaceholderMenuProps {
    onHighlight: (index: number) => void
    onSelect: (option: MarkdownPlaceholderOption) => void
    options: MarkdownPlaceholderOption[]
    selectedIndex: number | null
}

/** Placeholder typeahead results rendered above the owning popup. */
export function MarkdownPlaceholderMenu(props: MarkdownPlaceholderMenuProps) {
    const { onHighlight, onSelect, options, selectedIndex } = props
    const stackPosition = useMarkdownTypeaheadStackPosition()

    return (
        <Paper
            sx={(theme) => ({
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '14px',
                boxShadow: 8,
                minWidth: 280,
                overflow: 'hidden',
                position: 'relative',
                zIndex: theme.zIndex.modal + stackPosition + 1,
            })}
        >
            <List aria-label="Available placeholders" dense disablePadding role="listbox">
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
    )
}
