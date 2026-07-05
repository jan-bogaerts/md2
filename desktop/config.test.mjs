import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { DEFAULT_APP_URL, DEFAULT_DESKTOP_AGENT, DEFAULT_PROJECT_LOCATION_MODE, resolveAppUrl, resolveDesktopConfig } = require('./config')

describe('resolveAppUrl', () => {
    it('defaults to the Vite dev server URL', () => {
        expect(resolveAppUrl({})).toBe(DEFAULT_APP_URL)
    })

    it('uses MD2_APP_URL when configured', () => {
        expect(resolveAppUrl({ MD2_APP_URL: 'https://md2.example.test' })).toBe('https://md2.example.test')
    })
})

describe('resolveDesktopConfig', () => {
    it('defaults desktop config values', () => {
        expect(resolveDesktopConfig({})).toEqual({
            agent: DEFAULT_DESKTOP_AGENT,
            projectLocationMode: DEFAULT_PROJECT_LOCATION_MODE,
        })
    })

    it('uses configured desktop values', () => {
        expect(resolveDesktopConfig({ MD2_AGENT: 'system', MD2_PROJECT_LOCATION_MODE: 'current-directory' })).toEqual({
            agent: 'system',
            projectLocationMode: 'current-directory',
        })
    })
})
