import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatShortcut, isApplePlatform } from './keyboard_platform'

function setNavigator(userAgent: string, platform?: string) {
    vi.stubGlobal('navigator', { userAgent, userAgentData: platform === undefined ? undefined : { platform } })
}

describe('keyboard platform', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('uses userAgentData platform when available', () => {
        setNavigator('Windows browser fallback', 'macOS')

        expect(isApplePlatform()).toBe(true)
    })

    it('falls back to userAgent when userAgentData is unavailable', () => {
        setNavigator('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')

        expect(isApplePlatform()).toBe(false)
    })

    it('formats the global search shortcut for Apple clients', () => {
        setNavigator('Mozilla/5.0 (Macintosh)', 'macOS')

        expect(formatShortcut({ alt: false, key: 'f', mod: true, shift: true })).toBe('⌘⇧F')
    })

    it('formats the global search shortcut for Windows and Linux clients', () => {
        setNavigator('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Windows')

        expect(formatShortcut({ alt: false, key: 'f', mod: true, shift: true })).toBe('Ctrl+Shift+F')
    })
})
