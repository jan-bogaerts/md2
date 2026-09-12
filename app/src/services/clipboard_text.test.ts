import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from './clipboard_text'

function stubClipboard(clipboard: unknown) {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard, writable: true })
}

describe('copyTextToClipboard', () => {
    afterEach(() => {
        stubClipboard(undefined)
        vi.restoreAllMocks()
        document.body.innerHTML = ''
    })

    it('writes through the async clipboard API in a secure context', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        stubClipboard({ writeText })
        const execCommand = vi.fn().mockReturnValue(true)
        document.execCommand = execCommand

        await copyTextToClipboard('design/F_116.md')

        expect(writeText).toHaveBeenCalledWith('design/F_116.md')
        expect(execCommand).not.toHaveBeenCalled()
        expect(document.querySelector('textarea')).toBeNull()
    })

    it('falls back to execCommand when navigator.clipboard is missing', async () => {
        stubClipboard(undefined)
        let copiedSelection: string | undefined
        document.execCommand = vi.fn(() => {
            copiedSelection = document.querySelector('textarea')?.value
            return true
        })

        await copyTextToClipboard('design/F_116.md')

        expect(copiedSelection).toBe('design/F_116.md')
        expect(document.querySelector('textarea')).toBeNull()
    })

    it('falls back to execCommand when the clipboard write rejects', async () => {
        const writeText = vi.fn().mockRejectedValue(new Error('Clipboard denied'))
        stubClipboard({ writeText })
        const execCommand = vi.fn().mockReturnValue(true)
        document.execCommand = execCommand

        await copyTextToClipboard('C:\\repo\\design\\F_116.md')

        expect(writeText).toHaveBeenCalledTimes(1)
        expect(execCommand).toHaveBeenCalledWith('copy')
        expect(document.querySelector('textarea')).toBeNull()
    })

    it('rejects and cleans up when execCommand refuses the copy', async () => {
        stubClipboard(undefined)
        document.execCommand = vi.fn().mockReturnValue(false)

        await expect(copyTextToClipboard('design/F_116.md')).rejects.toThrow(/refused/u)
        expect(document.querySelector('textarea')).toBeNull()
    })

    it('removes the textarea when execCommand throws', async () => {
        stubClipboard(undefined)
        document.execCommand = vi.fn(() => {
            throw new Error('execCommand unavailable')
        })

        await expect(copyTextToClipboard('design/F_116.md')).rejects.toThrow('execCommand unavailable')
        expect(document.querySelector('textarea')).toBeNull()
    })
})
