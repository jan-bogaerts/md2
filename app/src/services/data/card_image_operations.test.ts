import { afterEach, describe, expect, it, vi } from 'vitest'
import { configService } from '../config/config_service'
import { openFilesService } from '../open_files_service'
import { createDataService, createStorage } from '../test_support/data_service_test_support'
import {
    clipboardImageBase64,
    clipboardImageExtension,
    createAvailablePastedImagePath,
    saveAndInsertPastedImage,
} from './card_image_operations'
import { dialogService } from '../dialog_service'

function clipboardFile(type: string, bytes: number[] = [105, 109, 97, 103, 101]) {
    return {
        arrayBuffer: async () => Uint8Array.from(bytes).buffer,
        type,
    } as File
}

describe('card image operations', () => {
    afterEach(() => {
        for (const document of openFilesService.getRegisteredDocuments()) openFilesService.discardDocument(document)
        configService.clear()
        vi.restoreAllMocks()
    })

    it('maps supported clipboard MIME types and rejects unsupported image types', () => {
        expect(clipboardImageExtension('image/png')).toBe('.png')
        expect(clipboardImageExtension('image/jpeg')).toBe('.jpg')
        expect(clipboardImageExtension('image/gif')).toBe('.gif')
        expect(clipboardImageExtension('image/webp')).toBe('.webp')
        expect(clipboardImageExtension('image/svg+xml')).toBe('.svg')
        expect(() => clipboardImageExtension('image/bmp')).toThrow('Unsupported clipboard image type: image/bmp')
    })

    it('encodes clipboard image bytes as base64', async () => {
        await expect(clipboardImageBase64(clipboardFile('image/png'))).resolves.toBe('aW1hZ2U=')
    })

    it('generates a collision-safe bare name beside the card', () => {
        const identifiers = ['collision', 'available']
        const savedImage = createAvailablePastedImagePath(
            'design/cards/F-1-card.md',
            'image/png',
            ['design/cards/pasted-image-collision.png'],
            () => identifiers.shift() ?? 'unexpected',
        )

        expect(savedImage).toEqual({
            fileName: 'pasted-image-available.png',
            path: 'design/cards/pasted-image-available.png',
        })
        expect(savedImage.fileName).not.toContain('/')
    })

    it('generates a default image identifier when randomUUID is unavailable', () => {
        const { getRandomValues } = globalThis.crypto
        vi.stubGlobal('crypto', { getRandomValues: getRandomValues.bind(globalThis.crypto) })
        try {
            const savedImage = createAvailablePastedImagePath('design/cards/F-1-card.md', 'image/png', [])

            expect(savedImage.fileName).toMatch(/^pasted-image-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/u)
            expect(savedImage.path).toBe(`design/cards/${savedImage.fileName}`)
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('persists a card image beside its card with base64 encoding', async () => {
        configService.init()
        const commit = vi.fn(async (request) => request.files)
        const storage = createStorage({ commit })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        const savedImage = await service.cards.savePastedImageForCard('design/F-1-root.md', clipboardFile('image/png'))

        expect(savedImage.path).toMatch(/^design\/pasted-image-.+\.png$/u)
        expect(commit).toHaveBeenCalledWith({
            branch: 'main',
            files: [{ content: 'aW1hZ2U=', encoding: 'base64', path: savedImage.path }],
            message: `Add ${savedImage.path}`,
        })
    })

    it('persists a new-card image in the configured working folder and deletes it during cleanup', async () => {
        configService.init()
        const commit = vi.fn(async (request) => request.files)
        const deleteFile = vi.fn()
        const storage = createStorage({ commit, deleteFile })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        const savedImage = await service.cards.savePastedImageForNewCard(clipboardFile('image/jpeg'))
        await service.cards.deletePastedImage(savedImage.path)

        expect(savedImage.path).toMatch(/^design\/pasted-image-.+\.jpg$/u)
        expect(deleteFile).toHaveBeenCalledWith({
            branch: 'main',
            message: `Delete ${savedImage.path}`,
            path: savedImage.path,
        })
        expect(service.getState().snapshot?.repositoryFiles).not.toContain(savedImage.path)
    })

    it('deletes the saved image when Markdown insertion fails', async () => {
        const savedImage = { fileName: 'saved.png', path: 'design/saved.png' }
        const deleteImage = vi.fn(async () => undefined)

        await expect(saveAndInsertPastedImage(
            clipboardFile('image/png'),
            () => { throw new Error('insert failed') },
            vi.fn(async () => savedImage),
            deleteImage,
        )).rejects.toThrow('insert failed')

        expect(deleteImage).toHaveBeenCalledWith(savedImage.path)
    })

    it('reports cleanup failure after Markdown insertion fails', async () => {
        const savedImage = { fileName: 'saved.png', path: 'design/saved.png' }
        const cleanupError = new Error('delete failed')
        const reportError = vi.spyOn(dialogService, 'error')

        await expect(saveAndInsertPastedImage(
            clipboardFile('image/png'),
            () => { throw new Error('insert failed') },
            vi.fn(async () => savedImage),
            vi.fn(async () => { throw cleanupError }),
        )).rejects.toThrow('insert failed')

        expect(reportError).toHaveBeenCalledWith(cleanupError, { fallbackMessage: `Could not remove ${savedImage.path}` })
    })
})
