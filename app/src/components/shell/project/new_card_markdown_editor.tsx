import { memo } from 'react'
import { MarkdownEditor } from '../../editor/markdown_editor'
import { projectSessionService } from '../../../services/project/project_session_service'
import { attachFilesToNewCardMarkdown } from '../../../services/attachments/new_card_attachment_workflow'
import type { MarkdownDraft } from '../../../services/markdown/markdown_draft'

interface NewCardMarkdownEditorProps {
    draft: MarkdownDraft
    onDirtyChange: (dirty: boolean) => void
}

const handleImagePaste = (file: File, insertMarkdown: (markdown: string) => void) => (
    projectSessionService.pasteNewCardImage(file, insertMarkdown)
)
const handleAttachments = (files: File[], insertMarkdown: (markdown: string) => void) => (
    attachFilesToNewCardMarkdown(files, insertMarkdown)
)

/** Lifetime-stable Markdown editor boundary for a new-card draft. */
export const NewCardMarkdownEditor = memo(function NewCardMarkdownEditor(props: NewCardMarkdownEditorProps) {
    const { draft, onDirtyChange } = props

    return (
        <MarkdownEditor
            attachmentHandler={handleAttachments}
            draft={draft}
            hideAttachmentControl
            hideToolbar
            imagePasteHandler={handleImagePaste}
            onDirtyChange={onDirtyChange}
        />
    )
})
