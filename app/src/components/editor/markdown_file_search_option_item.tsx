import { ListItemButton, ListItemText } from '@mui/material'
import type { MouseEvent, RefCallback } from 'react'
import { repositoryFileName } from './markdown_file_search'
import type { MarkdownFileSearchOption } from './markdown_file_search_option'

interface MarkdownFileSearchOptionItemProps {
    index: number
    onHighlight: (index: number) => void
    onSelect: (option: MarkdownFileSearchOption) => void
    selected: boolean
    selectionOption: MarkdownFileSearchOption
    setRefElement: RefCallback<HTMLElement>
}

/** One mouse- and keyboard-selectable repository file in the typeahead popup. */
export function MarkdownFileSearchOptionItem(props: MarkdownFileSearchOptionItemProps) {
    const { index, onHighlight, onSelect, selected, selectionOption, setRefElement } = props
    const { repositoryPath } = selectionOption

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
                primary={repositoryFileName(repositoryPath)}
                secondary={repositoryPath}
                slotProps={{ secondary: { variant: 'caption' } }}
                sx={{ m: 0 }}
            />
        </ListItemButton>
    )
}
