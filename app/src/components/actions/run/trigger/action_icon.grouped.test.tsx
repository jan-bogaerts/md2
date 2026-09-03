import { afterEach, describe, expect, it, vi } from 'vitest'
import { dataService } from '../../../../services/data/data_service'
import { resolveActionIcon, sanitizeInlineSvg } from './action_icon_resolver'

describe('action icon resolution', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('resolves safe inline SVG to a data URI', async () => {
        const result = await resolveActionIcon('<svg viewBox="0 0 1 1"><path d="M0 0h1v1H0z" /></svg>')

        expect(result.dataUri).toMatch(/^data:image\/svg\+xml/u)
    })

    it('loads project-relative image paths as data URIs', async () => {
        const loadProjectAsset = vi.spyOn(dataService.projectLoading, 'loadProjectAsset').mockResolvedValue({
            content: 'aWNvbg==',
            contentType: 'image/png',
            encoding: 'base64',
            path: 'actions/icon.png',
        })

        const result = await resolveActionIcon('actions/icon.png')

        expect(loadProjectAsset).toHaveBeenCalledWith('actions/icon.png')
        expect(result.dataUri).toBe('data:image/png;base64,aWNvbg==')
    })

    it('falls back when a path cannot be loaded', async () => {
        vi.spyOn(dataService.projectLoading, 'loadProjectAsset').mockRejectedValue(new Error('missing'))

        await expect(resolveActionIcon('actions/missing.svg')).resolves.toEqual({ dataUri: null })
    })

    it('rejects active inline SVG content', () => {
        expect(sanitizeInlineSvg('<svg><script>alert(1)</script></svg>')).toBeNull()
        expect(sanitizeInlineSvg('<svg><foreignObject /></svg>')).toBeNull()
        expect(sanitizeInlineSvg('<svg onclick="alert(1)" />')).toBeNull()
        expect(sanitizeInlineSvg('<svg><a href="javascript:alert(1)" /></svg>')).toBeNull()
    })
})
