import DataObjectOutlined from '@mui/icons-material/DataObjectOutlined'
import { IconButton, Menu, MenuItem, Tooltip } from '@mui/material'
import { activeEditor$, useCellValue } from '@mdxeditor/editor'
import { CONTROLLED_TEXT_INSERTION_COMMAND } from 'lexical'
import { useState, type MouseEvent } from 'react'
import type { ActionPlaceholder } from '../../data/action_placeholders'
import { formatActionPlaceholder } from '../../data/action_placeholders'

interface MarkdownPlaceholderToolbarControlProps {
    overlayContainer?: HTMLElement | null
    placeholders: readonly ActionPlaceholder[]
}

/** Toolbar menu that inserts a supported action placeholder at the active selection. */
export function MarkdownPlaceholderToolbarControl(props: MarkdownPlaceholderToolbarControlProps) {
    const { overlayContainer, placeholders } = props
    const activeEditor = useCellValue(activeEditor$)
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)

    const handleOpen = (event: MouseEvent<HTMLElement>) => {
        setAnchorElement(event.currentTarget)
    }

    const handleClose = () => {
        setAnchorElement(null)
    }

    const handlePlaceholderClick = (event: MouseEvent<HTMLElement>) => {
        const placeholderName = event.currentTarget.dataset.placeholderName
        const placeholder = placeholders.find(({ name }) => name === placeholderName)
        if (!placeholder) throw new Error(`Unknown Markdown placeholder: ${placeholderName}`)
        if (!activeEditor) throw new Error('Cannot insert a placeholder without an active Markdown editor')

        activeEditor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, formatActionPlaceholder(placeholder.name))
        activeEditor.focus()
        handleClose()
    }

    return (
        <>
            <Tooltip title="Insert placeholder">
                <span>
                    <IconButton
                        aria-controls={anchorElement ? 'markdown-placeholder-menu' : undefined}
                        aria-expanded={!!anchorElement}
                        aria-haspopup="menu"
                        aria-label="Insert placeholder"
                        disabled={!activeEditor}
                        onClick={handleOpen}
                        size="small"
                    >
                        <DataObjectOutlined fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
            <Menu
                anchorEl={anchorElement}
                container={overlayContainer ?? undefined}
                id="markdown-placeholder-menu"
                onClose={handleClose}
                open={!!anchorElement}
            >
                {placeholders.map((placeholder) => (
                    <MenuItem
                        data-placeholder-name={placeholder.name}
                        key={placeholder.name}
                        onClick={handlePlaceholderClick}
                        sx={{ alignItems: 'flex-start', display: 'flex', flexDirection: 'column' }}
                    >
                        <code>{formatActionPlaceholder(placeholder.name)}</code>
                        <small>{placeholder.description}</small>
                    </MenuItem>
                ))}
            </Menu>
        </>
    )
}
