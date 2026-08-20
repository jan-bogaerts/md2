import { afterEach, describe, expect, it, vi } from 'vitest'
import { configService } from '../config/config_service'
import { dialogService } from '../dialog_service'
import { openFilesService } from '../open_files_service'
import { createDataService, createStorage } from '../test_support/data_service_test_support'
import {
    attachmentBase64,
    copyAndApplyAttachments,
    createAvailableAttachmentPath,
} from './card_attachment_operations'

function attachmentFile(name: string, bytes: number[] = [102, 105, 108, 101]) {
    return {
        arrayBuffer: async () => Uint8Array.from(bytes).buffer,
        name,
        type: 'application/octet-stream',
    } as File
}

describe('card attachment operations', () => {
    afterEach(() => {
        for (const document of openFilesService.getRegisteredDocuments()) openFilesService.discardDocument(document)
        configService.clear()
        vi.restoreAllMocks()
    })

    it('encodes arbitrary file bytes as base64', async () => {
        await expect(attachmentBase64(attachmentFile('archive.bin'))).resolves.toBe('ZmlsZQ==')
    })

    it('preserves the original name and adds a collision-safe suffix before its extension', () => {
        expect(createAvailableAttachmentPath(
            'design/cards/F-1-card.md',
            'research notes.pdf',
            ['design/cards/research notes.pdf', 'design/cards/research notes-1.pdf'],
        )).toEqual({
            fileName: 'research notes-2.pdf',
            path: 'design/cards/research notes-2.pdf',
        })
    })

    it('rejects attachment names that could escape the card folder', () => {
        expect(() => createAvailableAttachmentPath('design/F-1-card.md', '../report.pdf', []))
            .toThrow('Unsafe attachment file name: ../report.pdf')
    })

    it('persists arbitrary copied files before returning their relative paths', async () => {
        configService.init()
        const commit = vi.fn(async (request) => request.files)
        const service = createDataService()
        service.init({ storage: createStorage({ commit }) })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        const attachments = await service.cards.copyAttachmentsForCard('design/F-1-root.md', [
            attachmentFile('report.pdf'),
            attachmentFile('report.pdf', [115, 101, 99, 111, 110, 100]),
        ])

        expect(attachments).toEqual([
            { fileName: 'report.pdf', path: 'design/report.pdf' },
            { fileName: 'report-1.pdf', path: 'design/report-1.pdf' },
        ])
        expect(commit).toHaveBeenCalledWith({
            branch: 'main',
            files: [
                { content: 'ZmlsZQ==', encoding: 'base64', path: 'design/report.pdf' },
                { content: 'c2Vjb25k', encoding: 'base64', path: 'design/report-1.pdf' },
            ],
            message: 'Add 2 attachments',
        })
    })

    it('applies references only after copy persistence completes', async () => {
        const saved = [{ fileName: 'report.pdf', path: 'design/report.pdf' }]
        const copyFiles = vi.fn(async () => saved)
        const applyAttachments = vi.fn()

        await copyAndApplyAttachments([attachmentFile('report.pdf')], copyFiles, applyAttachments, vi.fn())

        expect(copyFiles.mock.invocationCallOrder[0]).toBeLessThan(applyAttachments.mock.invocationCallOrder[0])
        expect(applyAttachments).toHaveBeenCalledWith(saved)
    })

    it('removes copied files when applying their references fails', async () => {
        const saved = [{ fileName: 'report.pdf', path: 'design/report.pdf' }]
        const deleteFiles = vi.fn(async () => undefined)

        await expect(copyAndApplyAttachments(
            [attachmentFile('report.pdf')],
            vi.fn(async () => saved),
            () => { throw new Error('reference update failed') },
            deleteFiles,
        )).rejects.toThrow('reference update failed')

        expect(deleteFiles).toHaveBeenCalledWith(['design/report.pdf'])
    })

    it('reports cleanup failure after applying references fails', async () => {
        const cleanupError = new Error('delete failed')
        const reportError = vi.spyOn(dialogService, 'error')

        await expect(copyAndApplyAttachments(
            [attachmentFile('report.pdf')],
            vi.fn(async () => [{ fileName: 'report.pdf', path: 'design/report.pdf' }]),
            () => { throw new Error('reference update failed') },
            vi.fn(async () => { throw cleanupError }),
        )).rejects.toThrow('reference update failed')

        expect(reportError).toHaveBeenCalledWith(cleanupError, { fallbackMessage: 'Could not remove copied attachments' })
    })
})
