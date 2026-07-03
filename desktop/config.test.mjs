import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { DEFAULT_APP_URL, resolveAppUrl } = require('./config')

describe('resolveAppUrl', () => {
    it('defaults to the Vite dev server URL', () => {
        expect(resolveAppUrl({})).toBe(DEFAULT_APP_URL)
    })

    it('uses MD2_APP_URL when configured', () => {
        expect(resolveAppUrl({ MD2_APP_URL: 'https://md2.example.test' })).toBe('https://md2.example.test')
    })
})
