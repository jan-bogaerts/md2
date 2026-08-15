import { copyAndApplyAttachments } from '../data/card_attachment_operations'
import { projectSessionService } from '../project/project_session_service'
import { attachmentChoiceService } from './attachment_choice_service'
import { attachmentMarkdown, type AttachmentMarkdownInserter } from './attachment_workflow'

/** Runs Markdown attachment choice with new-card draft ownership. */
export async function attachFilesToNewCardMarkdown(files: File[], insertMarkdown: AttachmentMarkdownInserter) {
    const selection = await attachmentChoiceService.choose(files)
    if (!selection) return

    if (selection.choice === 'original') {
        if (!selection.originalPaths) throw new Error('Original attachment paths are unavailable')
        await insertMarkdown(attachmentMarkdown(files, selection.originalPaths, true))
        return
    }

    await copyAndApplyAttachments(
        files,
        (selectedFiles) => projectSessionService.copyNewCardAttachments(selectedFiles),
        async (attachments) => insertMarkdown(attachmentMarkdown(
            files,
            attachments.map(({ fileName }) => fileName),
            false,
        )),
        (paths) => projectSessionService.deleteNewCardDraftAttachments(paths),
    )
}
