import { afterEach, describe, expect, it } from 'vitest'
import { attachmentChoiceService } from './attachment_choice_service'

afterEach(() => {
    attachmentChoiceService.cancel()
    delete window.md2Files
})

describe('AttachmentChoiceService', () => {
    it('exposes one choice and returns trusted original paths', async () => {
        window.md2Files = { getPathForFile: (file) => `C:\\source\\${file.name}` }
        const selection = attachmentChoiceService.choose([
            new File(['one'], 'one.pdf'),
            new File(['two'], 'two.zip'),
        ])

        expect(attachmentChoiceService.getSnapshot()).toMatchObject({
            fileCount: 2,
            originalLocationAvailable: true,
        })
        attachmentChoiceService.select('original')

        await expect(selection).resolves.toEqual({
            choice: 'original',
            originalPaths: ['C:\\source\\one.pdf', 'C:\\source\\two.zip'],
        })
    })

    it('disables original locations when any trusted path is unavailable and cancel changes nothing', async () => {
        const selection = attachmentChoiceService.choose([new File(['one'], 'one.pdf')])

        expect(attachmentChoiceService.getSnapshot()?.originalLocationAvailable).toBe(false)
        expect(() => attachmentChoiceService.select('original')).toThrow('Original file locations are unavailable')
        attachmentChoiceService.cancel()

        await expect(selection).resolves.toBeNull()
    })
})
