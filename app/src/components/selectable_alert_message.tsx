import { Box } from '@mui/material'

const MIN_MESSAGE_ROWS = 1
const MAX_MESSAGE_ROWS = 6
const MESSAGE_ROW_HEIGHT_EM = 1.5

interface SelectableAlertMessageProps {
    message: string
}

function messageRows(message: string) {
    const lineCount = message.split('\n').length

    return Math.min(MAX_MESSAGE_ROWS, Math.max(MIN_MESSAGE_ROWS, lineCount))
}

/** Read-only alert text surface that remains natively selectable in Electron snackbars. */
export function SelectableAlertMessage(props: SelectableAlertMessageProps) {
    const { message } = props
    const rows = messageRows(message)

    return (
        <Box
            aria-label="Error message"
            component="div"
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
                height: `${rows * MESSAGE_ROW_HEIGHT_EM}em`,
                lineHeight: `${MESSAGE_ROW_HEIGHT_EM}em`,
                m: 0,
                minWidth: 0,
                outline: 0,
                overflow: 'auto',
                p: 0,
                userSelect: 'text',
                whiteSpace: 'pre-wrap',
                width: '100%',
            }}
        >
            {message}
        </Box>
    )
}
