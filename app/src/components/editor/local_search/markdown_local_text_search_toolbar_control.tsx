import SearchOutlined from '@mui/icons-material/SearchOutlined'
import { IconButton, Tooltip } from '@mui/material'
import { activeEditor$, useCellValue } from '@mdxeditor/editor'
import { OPEN_MARKDOWN_LOCAL_TEXT_SEARCH_COMMAND } from './markdown_local_text_search_command'

/** Opens local visible-text search for the active Markdown editor. */
export function MarkdownLocalTextSearchToolbarControl() {
    const activeEditor = useCellValue(activeEditor$)

    const handleOpen = () => {
        activeEditor?.dispatchCommand(OPEN_MARKDOWN_LOCAL_TEXT_SEARCH_COMMAND, undefined)
    }

    return (
        <Tooltip title="Find text">
            <span>
                <IconButton
                    aria-label="Find text"
                    disabled={!activeEditor}
                    onClick={handleOpen}
                    size="small"
                >
                    <SearchOutlined fontSize="small" />
                </IconButton>
            </span>
        </Tooltip>
    )
}
