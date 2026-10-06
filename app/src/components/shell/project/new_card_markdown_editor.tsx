import { memo } from 'react'
import { MarkdownEditor } from '../../editor/markdown_editor'
import { projectSessionService } from '../../../services/project/project_session_service'
import { attachFilesToNewCardMarkdown } from '../../../services/attachments/new_card_attachment_workflow'
import { resolveCardImageSource } from '../../../services/attachments/card_image_source'
import { dataService } from '../../../services/data/data_service'
import type { MarkdownDraft } from '../../../services/markdown/markdown_draft'

interface NewCardMarkdownEditorProps {
    draft: MarkdownDraft
    overlayContainer: HTMLElement | null
}

const handleImagePaste = (file: File, insertMarkdown: (markdown: string) => void) => (
    projectSessionService.pasteNewCardImage(file, insertMarkdown)
)
const handleAttachments = (files: File[], insertMarkdown: (markdown: string) => void) => (
    attachFilesToNewCardMarkdown(files, insertMarkdown)
)
/** Resolves images beside the draft path, where pasted new-card images are saved. */
const handleImagePreview = async (src: string) => {
    const config = dataService.getConfig()
    if (!config) return src

    return resolveCardImageSource(`${config.workingFolder}/new-card-draft.md`, src)
}

/** Lifetime-stable Markdown editor boundary for a new-card draft. */
export const NewCardMarkdownEditor = memo(function NewCardMarkdownEditor(props: NewCardMarkdownEditorProps) {
    const { draft, overlayContainer } = props

    return (
        <MarkdownEditor
            attachmentHandler={handleAttachments}
            draft={draft}
            hideAttachmentControl
            hideToolbar
            imagePasteHandler={handleImagePaste}
            imagePreviewHandler={handleImagePreview}
            overlayContainer={overlayContainer}
        />
    )
})
