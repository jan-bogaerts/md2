import { ListItemButton, ListItemText } from '@mui/material'
import type { MouseEvent, RefCallback } from 'react'
import { formatActionPlaceholder, type ActionPlaceholder } from '../../data/action_placeholders'
import type { MarkdownPlaceholderOption } from './markdown_placeholder_option'

interface MarkdownPlaceholderOptionItemProps {
    index: number
    onHighlight: (index: number) => void
    onSelect: (option: MarkdownPlaceholderOption) => void
    placeholder: ActionPlaceholder
    selectionOption: MarkdownPlaceholderOption
    selected: boolean
    setRefElement: RefCallback<HTMLElement>
}

/** One mouse- and keyboard-selectable entry in the placeholder typeahead popup. */
export function MarkdownPlaceholderOptionItem(props: MarkdownPlaceholderOptionItemProps) {
    const { index, onHighlight, onSelect, placeholder, selected, selectionOption, setRefElement } = props

    const handleMouseEnter = () => {
        onHighlight(index)
    }

    const handleMouseDown = (event: MouseEvent<HTMLElement>) => {
        event.preventDefault()
    }

    const handleClick = () => {
        onSelect(selectionOption)
    }

    return (
        <ListItemButton
            aria-selected={selected}
            id={`typeahead-item-${index}`}
            onClick={handleClick}
            onMouseDown={handleMouseDown}
            onMouseEnter={handleMouseEnter}
            ref={setRefElement}
            role="option"
            selected={selected}
            sx={{ alignItems: 'flex-start', gap: 1, py: 0.75 }}
        >
            <ListItemText
                primary={formatActionPlaceholder(placeholder.name)}
                secondary={placeholder.description}
                slotProps={{ primary: { component: 'code' }, secondary: { variant: 'caption' } }}
                sx={{ m: 0 }}
            />
        </ListItemButton>
    )
}
