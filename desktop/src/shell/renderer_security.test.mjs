import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { DEFAULT_APP_URL } = require('./config')
const { isTrustedRendererLocation, registerNavigationGuards, resolveRendererTarget } = require('./renderer_security')

describe('renderer target resolution', () => {
    it('defaults to the local Vite server while unpackaged', () => {
        expect(resolveRendererTarget(false, 'ignored', {})).toEqual({
            trustedLocation: DEFAULT_APP_URL,
            type: 'url',
            url: DEFAULT_APP_URL,
        })
    })

    it('uses the configured Vite URL while unpackaged', () => {
        expect(resolveRendererTarget(false, 'ignored', { MD2_APP_URL: 'http://localhost:5173' })).toEqual({
            trustedLocation: 'http://localhost:5173',
            type: 'url',
            url: 'http://localhost:5173',
        })
    })

    it('ignores MD2_APP_URL and resolves bundled React while packaged', () => {
        const appDirectory = path.join('C:', 'Program Files', 'MD²', 'resources', 'app.asar')
        const filePath = path.join(appDirectory, 'renderer', 'index.html')

        expect(resolveRendererTarget(true, appDirectory, { MD2_APP_URL: 'https://evil.example' })).toEqual({
            filePath,
            trustedLocation: pathToFileURL(filePath).href,
            type: 'file',
        })
    })
})

describe('renderer navigation guards', () => {
    function createWebContents() {
        const listeners = {}
        const webContents = {
            on: vi.fn((event, listener) => { listeners[event] = listener }),
            setWindowOpenHandler: vi.fn((handler) => { webContents.windowOpenHandler = handler }),
            windowOpenHandler: null,
        }

        return { listeners, webContents }
    }

    it('allows only the trusted renderer document navigation', () => {
        expect(isTrustedRendererLocation('file:///C:/Program%20Files/MD2/index.html#board', 'file:///C:/Program%20Files/MD2/index.html')).toBe(true)
        expect(isTrustedRendererLocation('https://evil.example', 'file:///C:/Program%20Files/MD2/index.html')).toBe(false)
    })

    it('blocks remote navigation and opens approved links externally', () => {
        const { listeners, webContents } = createWebContents()
        const openExternal = vi.fn(async () => undefined)
        const event = { preventDefault: vi.fn() }
        registerNavigationGuards(webContents, 'file:///C:/MD2/index.html', openExternal)

        listeners['will-navigate'](event, 'https://docs.example/path')

        expect(event.preventDefault).toHaveBeenCalled()
        expect(openExternal).toHaveBeenCalledWith('https://docs.example/path')
    })

    it('denies popups and does not launch unapproved protocols', () => {
        const { webContents } = createWebContents()
        const openExternal = vi.fn(async () => undefined)
        registerNavigationGuards(webContents, 'file:///C:/MD2/index.html', openExternal)

        expect(webContents.windowOpenHandler({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' })
        expect(openExternal).not.toHaveBeenCalled()
    })
})
