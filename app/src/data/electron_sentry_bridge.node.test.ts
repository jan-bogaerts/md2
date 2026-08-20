import { afterEach, describe, expect, it } from 'vitest'
import { getElectronSentryBridge } from './electron_sentry_bridge'

describe('getElectronSentryBridge', () => {
    afterEach(() => {
        delete window.md2Sentry
    })

    it('returns null when desktop bridge is unavailable', () => {
        expect(getElectronSentryBridge()).toBeNull()
    })

    it('returns installed desktop bridge', () => {
        const bridge = { request: async () => ({ body: '{}', headers: { link: null, retryAfter: null }, status: 200 }) }
        window.md2Sentry = bridge

        expect(getElectronSentryBridge()).toBe(bridge)
    })
})
