import { afterEach, describe, expect, it, vi } from 'vitest'
import { dataService } from '../data/data_service'
import { attachmentChoiceService } from './attachment_choice_service'
import { absoluteFileUrl, attachFilesToCard, attachFilesToCardMarkdown } from './attachment_workflow'

afterEach(() => {
    attachmentChoiceService.cancel()
    delete window.md2Files
    vi.restoreAllMocks()
})

describe('attachment workflow', () => {
    it('formats Windows, UNC, and POSIX absolute file URLs', () => {
        expect(absoluteFileUrl('C:\\source folder\\report.pdf')).toBe('file:///C:/source%20folder/report.pdf')
        expect(absoluteFileUrl('\\\\server\\share\\report.pdf')).toBe('file://server/share/report.pdf')
        expect(absoluteFileUrl('/var/data/report.pdf')).toBe('file:///var/data/report.pdf')
    })

    it('inserts original image and file links without repository writes', async () => {
        const files = [
            new File(['image'], 'screen shot.png', { type: 'image/png' }),
            new File(['text'], 'notes.txt', { type: 'text/plain' }),
        ]
        window.md2Files = { getPathForFile: (file) => `C:\\source folder\\${file.name}` }
        const copyAttachments = vi.spyOn(dataService.cards, 'copyAttachmentsForCard')
        const insertMarkdown = vi.fn()

        const operation = attachFilesToCardMarkdown('design/F-1.md', files, insertMarkdown)
        attachmentChoiceService.select('original')
        await operation

        expect(insertMarkdown).toHaveBeenCalledWith(
            '![screen shot.png](<file:///C:/source%20folder/screen%20shot.png>)\n'
            + '[notes.txt](<file:///C:/source%20folder/notes.txt>)',
        )
        expect(copyAttachments).not.toHaveBeenCalled()
    })

    it('removes copied files when Markdown insertion fails', async () => {
        const file = new File(['report'], 'report.pdf', { type: 'application/pdf' })
        vi.spyOn(dataService.cards, 'copyAttachmentsForCard').mockResolvedValue([
            { fileName: 'report.pdf', path: 'design/report.pdf' },
        ])
        const deleteAttachments = vi.spyOn(dataService.cards, 'deleteCopiedAttachments').mockResolvedValue()
        const insertionError = new Error('insert failed')

        const operation = attachFilesToCardMarkdown('design/F-1.md', [file], () => {
            throw insertionError
        })
        attachmentChoiceService.select('copy')

        await expect(operation).rejects.toBe(insertionError)
        expect(deleteAttachments).toHaveBeenCalledWith(['design/report.pdf'])
    })

    it('cancel leaves card references and repository unchanged', async () => {
        const addReferences = vi.spyOn(dataService.cards, 'addCardReferences')
        const copyAttachments = vi.spyOn(dataService.cards, 'copyAttachmentsForCard')
        const operation = attachFilesToCard('design/F-1.md', [new File(['one'], 'one.pdf')])

        attachmentChoiceService.cancel()

        await expect(operation).resolves.toEqual([])
        expect(addReferences).not.toHaveBeenCalled()
        expect(copyAttachments).not.toHaveBeenCalled()
    })
})
