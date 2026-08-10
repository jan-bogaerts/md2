import { afterEach, describe, expect, it } from 'vitest'
import { getRemarkableBridge, validateRemarkableSettings, type RemarkableConnectionSettings } from './remarkable_bridge'

function baseSettings(overrides: Partial<RemarkableConnectionSettings> = {}): RemarkableConnectionSettings {
    return { host: 'remarkable.local', imageFolder: '/home/root/images', password: 'secret', port: 22, username: 'root', ...overrides }
}

describe('getRemarkableBridge', () => {
    afterEach(() => {
        delete window.md2Remarkable
    })

    it('returns null when the bridge is not installed', () => {
        expect(getRemarkableBridge()).toBeNull()
    })

    it('returns the installed bridge', () => {
        const bridge = {
            importFiles: async () => [],
            listImageFiles: async () => [],
            testConnection: async () => ({ message: null, ok: true }),
        }
        window.md2Remarkable = bridge

        expect(getRemarkableBridge()).toBe(bridge)
    })
})

describe('validateRemarkableSettings', () => {
    it('returns trimmed settings when valid', () => {
        const result = validateRemarkableSettings(baseSettings({ host: '  remarkable.local  ', username: ' root ' }))

        expect(result.host).toBe('remarkable.local')
        expect(result.username).toBe('root')
    })

    it('accepts a private key instead of a password', () => {
        expect(() => validateRemarkableSettings(baseSettings({ password: undefined, privateKeyPath: '/keys/id_rsa' }))).not.toThrow()
    })

    it('rejects a missing host', () => {
        expect(() => validateRemarkableSettings(baseSettings({ host: '   ' }))).toThrow(/host is required/u)
    })

    it('rejects a missing username', () => {
        expect(() => validateRemarkableSettings(baseSettings({ username: '' }))).toThrow(/username is required/u)
    })

    it('rejects an out-of-range port', () => {
        expect(() => validateRemarkableSettings(baseSettings({ port: 0 }))).toThrow(/port must be between/u)
        expect(() => validateRemarkableSettings(baseSettings({ port: 70000 }))).toThrow(/port must be between/u)
    })

    it('rejects a missing image folder', () => {
        expect(() => validateRemarkableSettings(baseSettings({ imageFolder: '  ' }))).toThrow(/image folder is required/u)
    })

    it('rejects settings without any credential', () => {
        expect(() => validateRemarkableSettings(baseSettings({ password: '', privateKeyPath: '' }))).toThrow(/password or private key/u)
    })
})
