import FormatIndentDecreaseOutlined from '@mui/icons-material/FormatIndentDecreaseOutlined'
import FormatIndentIncreaseOutlined from '@mui/icons-material/FormatIndentIncreaseOutlined'
import { IconButton, Tooltip, useMediaQuery, useTheme } from '@mui/material'
import { activeEditor$, useCellValue } from '@mdxeditor/editor'
import { INDENT_CONTENT_COMMAND, OUTDENT_CONTENT_COMMAND } from 'lexical'

/** Small-screen controls for changing selected list-item nesting. */
export function MarkdownListIndentToolbarControls() {
    const activeEditor = useCellValue(activeEditor$)
    const theme = useTheme()
    const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'))

    const handleIncreaseIndent = () => {
        activeEditor?.dispatchCommand(INDENT_CONTENT_COMMAND, undefined)
        activeEditor?.focus()
    }

    const handleDecreaseIndent = () => {
        activeEditor?.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined)
        activeEditor?.focus()
    }

    if (!isSmallScreen) return null

    return (
        <>
            <Tooltip title="Increase indent">
                <span>
                    <IconButton
                        aria-label="Increase indent"
                        disabled={!activeEditor}
                        onClick={handleIncreaseIndent}
                        size="small"
                    >
                        <FormatIndentIncreaseOutlined fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
            <Tooltip title="Decrease indent">
                <span>
                    <IconButton
                        aria-label="Decrease indent"
                        disabled={!activeEditor}
                        onClick={handleDecreaseIndent}
                        size="small"
                    >
                        <FormatIndentDecreaseOutlined fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
        </>
    )
}
