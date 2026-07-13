import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertAppContentIsReleaseSafe, assertPackageEntries, resolveArtifactPaths } from './verify_windows_package.mjs'

const validEntries = [
    'desktop/main.js',
    'desktop/preload.js',
    'desktop/renderer/index.html',
    'desktop/renderer/assets/index.js',
    'desktop/renderer_security.js',
    'shared/action_definitions.mjs',
    'node_modules/@aptabase/electron/package.json',
    'node_modules/@sentry/electron/package.json',
    'node_modules/electron-store/package.json',
    'node_modules/ssh2/package.json',
    'node_modules/ws/package.json',
]

describe('Windows package verification', () => {
    it('uses predictable versioned x64 artifact paths', () => {
        expect(resolveArtifactPaths('2.3.4', 'C:\\release')).toEqual({
            asarPath: path.join('C:\\release', 'MD2-2.3.4-win-x64-unpacked', 'resources', 'app.asar'),
            environmentPath: path.join('C:\\release', 'MD2-2.3.4-win-x64-unpacked', 'resources', '.env'),
            executablePath: path.join('C:\\release', 'MD2-2.3.4-win-x64-unpacked', 'md2.exe'),
            installerPath: path.join('C:\\release', 'MD2-Setup-2.3.4-x64.exe'),
            sourceUnpackedDirectory: path.join('C:\\release', 'win-unpacked'),
            unpackedDirectory: path.join('C:\\release', 'MD2-2.3.4-win-x64-unpacked'),
        })
    })

    it('accepts required runtime and renderer files', () => {
        expect(assertPackageEntries(validEntries)).toEqual(validEntries)
    })

    it('rejects missing renderer assets and certificate material', () => {
        expect(() => assertPackageEntries(validEntries.filter((entry) => !entry.startsWith('desktop/renderer/assets/'))))
            .toThrow('Packaged application missing renderer assets')
        expect(() => assertPackageEntries([...validEntries, 'build/signing.pfx']))
            .toThrow('Forbidden packaged files: build/signing.pfx')
    })

    it('rejects development URLs and signing-password names in app content', () => {
        const extractFile = (_asarPath, entry) => Buffer.from(entry === 'desktop/main.js' ? 'http://localhost:5173' : 'release')

        expect(() => assertAppContentIsReleaseSafe('app.asar', validEntries, extractFile))
            .toThrow('Forbidden release content in desktop/main.js: http://localhost:5173')
    })
})
