import { memo, forwardRef } from 'react'
import { MarkdownEditor, type MarkdownEditorHandle } from '../../editor/markdown_editor'
import { projectSessionService } from '../../../services/project/project_session_service'
import { attachFilesToNewCardMarkdown } from '../../../services/attachments/new_card_attachment_workflow'

interface NewCardMarkdownEditorProps {
    onDirtyChange: (dirty: boolean) => void
}

const handleChange = () => undefined
const handleImagePaste = (file: File, insertMarkdown: (markdown: string) => void) => (
    projectSessionService.pasteNewCardImage(file, insertMarkdown)
)
const handleAttachments = (files: File[], insertMarkdown: (markdown: string) => void) => (
    attachFilesToNewCardMarkdown(files, insertMarkdown)
)

/** Lifetime-stable Markdown editor boundary for a new-card draft. */
export const NewCardMarkdownEditor = memo(forwardRef<MarkdownEditorHandle, NewCardMarkdownEditorProps>(
    function NewCardMarkdownEditor(props, ref) {
        const { onDirtyChange } = props

        return (
            <MarkdownEditor
                attachmentHandler={handleAttachments}
                hideToolbar
                imagePasteHandler={handleImagePaste}
                markdown=""
                onChange={handleChange}
                onDirtyChange={onDirtyChange}
                ref={ref}
            />
        )
    },
))
