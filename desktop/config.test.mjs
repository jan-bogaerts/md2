import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
    DEFAULT_APP_URL,
    DEFAULT_DESKTOP_AGENT,
    DEFAULT_PROJECT_LOCATION_MODE,
    DESKTOP_CONFIG_STORE_KEY,
    readDesktopConfig,
    resolveAppUrl,
    resolveDesktopConfig,
    writeDesktopConfig,
} = require('./config')

function createFakeStore(initial = {}) {
    let data = initial

    return {
        get: (key) => data[key],
        set: (key, value) => {
            data = { ...data, [key]: value }
        },
    }
}

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

describe('readDesktopConfig', () => {
    it('returns env defaults when nothing is stored', () => {
        const store = createFakeStore()

        expect(readDesktopConfig(store, {})).toEqual({
            agent: DEFAULT_DESKTOP_AGENT,
            projectLocationMode: DEFAULT_PROJECT_LOCATION_MODE,
        })
    })

    it('lets a stored value override the env default for one field while the other falls back', () => {
        const store = createFakeStore({ [DESKTOP_CONFIG_STORE_KEY]: { agent: 'system' } })

        expect(readDesktopConfig(store, { MD2_PROJECT_LOCATION_MODE: 'current-directory' })).toEqual({
            agent: 'system',
            projectLocationMode: 'current-directory',
        })
    })
})

describe('writeDesktopConfig', () => {
    it('persists values so a subsequent readDesktopConfig reflects them', () => {
        const store = createFakeStore()

        writeDesktopConfig(store, { agent: 'system' })

        expect(readDesktopConfig(store, {})).toEqual({
            agent: 'system',
            projectLocationMode: DEFAULT_PROJECT_LOCATION_MODE,
        })
    })

    it('merges with a previous write instead of overwriting it', () => {
        const store = createFakeStore()

        writeDesktopConfig(store, { agent: 'system' })
        writeDesktopConfig(store, { projectLocationMode: 'current-directory' })

        expect(readDesktopConfig(store, {})).toEqual({
            agent: 'system',
            projectLocationMode: 'current-directory',
        })
    })
})
