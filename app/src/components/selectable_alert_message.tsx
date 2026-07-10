import { Box } from '@mui/material'

const MIN_TEXTAREA_ROWS = 1
const MAX_TEXTAREA_ROWS = 6
const TEXTAREA_ROW_HEIGHT_EM = 1.5

interface SelectableAlertMessageProps {
    message: string
}

function textareaRows(message: string) {
    const lineCount = message.split('\n').length

    return Math.min(MAX_TEXTAREA_ROWS, Math.max(MIN_TEXTAREA_ROWS, lineCount))
}

/** Read-only alert text surface that remains natively selectable in Electron snackbars. */
export function SelectableAlertMessage(props: SelectableAlertMessageProps) {
    const { message } = props
    const rows = textareaRows(message)

    return (
        <Box
            aria-label="Error message"
            component="textarea"
            readOnly
            rows={rows}
            sx={{
                WebkitAppRegion: 'no-drag',
                WebkitUserSelect: 'text',
                background: 'transparent',
                border: 0,
                color: 'inherit',
                cursor: 'text',
                display: 'block',
                font: 'inherit',
                fontWeight: 'inherit',
                height: `${rows * TEXTAREA_ROW_HEIGHT_EM}em`,
                lineHeight: `${TEXTAREA_ROW_HEIGHT_EM}em`,
                m: 0,
                minWidth: 0,
                outline: 0,
                overflow: 'auto',
                p: 0,
                resize: 'none',
                userSelect: 'text',
                width: '100%',
            }}
            value={message}
        />
    )
}
