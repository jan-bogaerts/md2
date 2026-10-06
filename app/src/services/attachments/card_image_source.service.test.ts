import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectAsset } from '../../data/data_types'
import { dataService } from '../data/data_service'
import { resolveCardImageSource } from './card_image_source'

const CARD_PATH = 'design/active/card.md'

function pngAsset(path: string): ProjectAsset {
    return { content: 'aW1hZ2U=', contentType: 'image/png', encoding: 'base64', path }
}

function mockProjectAssetLoad() {
    return vi.spyOn(dataService.projectLoading, 'loadProjectAsset').mockImplementation(async (path) => pngAsset(path))
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('resolveCardImageSource', () => {
    it.each([
        ['pasted-image-1.png', 'design/active/pasted-image-1.png'],
        ['images/nested/photo.png', 'design/active/images/nested/photo.png'],
        ['./photo.png', 'design/active/photo.png'],
        ['../shared/photo.png', 'design/shared/photo.png'],
        ['my%20photo.png', 'design/active/my photo.png'],
    ])('loads relative image %s from the card folder as a data URI', async (src, expectedPath) => {
        const loadProjectAsset = mockProjectAssetLoad()

        await expect(resolveCardImageSource(CARD_PATH, src)).resolves.toBe('data:image/png;base64,aW1hZ2U=')
        expect(loadProjectAsset).toHaveBeenCalledWith(expectedPath)
    })

    it('loads a file URL with a Windows drive path from the storage host', async () => {
        const loadImageFile = vi.spyOn(dataService.projectLoading, 'loadImageFile').mockImplementation(async (path) => pngAsset(path))

        const source = await resolveCardImageSource(CARD_PATH, 'file:///C:/Users/me/My%20Pictures/photo.png')

        expect(source).toBe('data:image/png;base64,aW1hZ2U=')
        expect(loadImageFile).toHaveBeenCalledWith('C:/Users/me/My Pictures/photo.png')
    })

    it.each([
        'http://example.com/photo.png',
        'https://example.com/photo.png',
        'data:image/png;base64,aW1hZ2U=',
        'blob:http://localhost/1234',
    ])('returns %s unchanged', async (src) => {
        const loadProjectAsset = mockProjectAssetLoad()

        await expect(resolveCardImageSource(CARD_PATH, src)).resolves.toBe(src)
        expect(loadProjectAsset).not.toHaveBeenCalled()
    })

    it('returns the original source when the image cannot be loaded', async () => {
        vi.spyOn(dataService.projectLoading, 'loadProjectAsset').mockRejectedValue(new Error('missing'))

        await expect(resolveCardImageSource(CARD_PATH, 'missing.png')).resolves.toBe('missing.png')
    })

    it('returns the original source when a relative path escapes the project root', async () => {
        const loadProjectAsset = mockProjectAssetLoad()

        await expect(resolveCardImageSource(CARD_PATH, '../../../outside.png')).resolves.toBe('../../../outside.png')
        expect(loadProjectAsset).not.toHaveBeenCalled()
    })
})
