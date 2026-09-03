import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownDraft } from '../markdown/markdown_draft'
import { projectSessionService } from '../project/project_session_service'
import { attachmentChoiceService } from './attachment_choice_service'
import { attachFilesToNewCardMarkdown } from './new_card_attachment_workflow'

afterEach(() => {
    attachmentChoiceService.cancel()
    vi.restoreAllMocks()
})

describe('new-card attachment workflow', () => {
    it('removes copied files when no mounted editor handles draft insertion', async () => {
        const file = new File(['report'], 'report.pdf', { type: 'application/pdf' })
        const draft = new MarkdownDraft('')
        vi.spyOn(projectSessionService, 'copyNewCardAttachments').mockResolvedValue([
            { fileName: 'report.pdf', path: 'design/report.pdf' },
        ])
        const deleteAttachments = vi.spyOn(projectSessionService, 'deleteNewCardDraftAttachments').mockResolvedValue()
        const operation = attachFilesToNewCardMarkdown([file], draft.requestInsertion)
        attachmentChoiceService.select('copy')

        await expect(operation).rejects.toThrow('Markdown insertion requires a mounted editor')
        expect(deleteAttachments).toHaveBeenCalledWith(['design/report.pdf'])
    })
})
