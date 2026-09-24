import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import { IconButton, Tooltip } from '@mui/material'
import { copyTextToClipboard } from '../../../../services/clipboard_text'
import { dialogService } from '../../../../services/dialog_service'

interface ActionConversationCopyButtonProps {
    label: string
    text: string
}

/** Copies one transcript item's source representation. */
export function ActionConversationCopyButton({ label, text }: ActionConversationCopyButtonProps) {
    const handleCopy = async () => {
        try {
            await copyTextToClipboard(text)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not copy conversation item' })
        }
    }

    return (
        <Tooltip title={label}>
            <IconButton aria-label={label} onClick={handleCopy} size="small" sx={{ height: 28, width: 28 }}>
                <ContentCopyOutlined sx={{ fontSize: 16 }} />
            </IconButton>
        </Tooltip>
    )
}
