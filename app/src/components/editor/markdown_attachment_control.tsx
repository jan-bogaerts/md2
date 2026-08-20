import { IconButton, Tooltip } from '@mui/material'
import Paperclip from 'mdi-material-ui/Paperclip'
import { useRef, type ChangeEvent } from 'react'

interface MarkdownAttachmentControlProps {
    disabled: boolean
    onFiles: (files: File[]) => void
}

/** Placement-neutral paperclip file picker for Markdown attachment workflows. */
export function MarkdownAttachmentControl(props: MarkdownAttachmentControlProps) {
    const { disabled, onFiles } = props
    const inputRef = useRef<HTMLInputElement>(null)
    const openFilePicker = () => inputRef.current?.click()
    const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
        const files = [...(event.target.files ?? [])]
        event.target.value = ''
        if (files.length > 0) onFiles(files)
    }

    return (
        <>
            <Tooltip title="Attach files">
                <span>
                    <IconButton aria-label="Attach files" disabled={disabled} onClick={openFilePicker} size="small">
                        <Paperclip sx={{ fontSize: 18 }} />
                    </IconButton>
                </span>
            </Tooltip>
            <input hidden multiple onChange={handleFilesSelected} ref={inputRef} type="file" />
        </>
    )
}
