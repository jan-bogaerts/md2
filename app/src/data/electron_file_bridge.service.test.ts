import { afterEach, describe, expect, it } from 'vitest'
import { getOriginalFilePath, getOriginalFilePaths } from './electron_file_bridge'

describe('electron file bridge', () => {
    afterEach(() => {
        delete window.md2Files
    })

    it('returns the trusted original path exposed by Electron', () => {
        const file = new File(['report'], 'report.pdf')
        window.md2Files = { getPathForFile: () => 'C:\\Documents\\report.pdf' }

        expect(getOriginalFilePath(file)).toBe('C:\\Documents\\report.pdf')
    })

    it('returns null outside Electron or when Electron cannot resolve the path', () => {
        const file = new File(['report'], 'report.pdf')

        expect(getOriginalFilePath(file)).toBeNull()
        window.md2Files = { getPathForFile: () => '' }
        expect(getOriginalFilePath(file)).toBeNull()
    })

    it('disables original-location use when any dropped file lacks a trusted path', () => {
        const first = new File(['first'], 'first.pdf')
        const second = new File(['second'], 'second.pdf')
        window.md2Files = { getPathForFile: (file) => file === first ? 'C:\\Files\\first.pdf' : '' }

        expect(getOriginalFilePaths([first, second])).toBeNull()
    })
})
