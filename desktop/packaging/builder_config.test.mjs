import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { APP_ID, EXECUTABLE_NAME, PRODUCT_NAME, createBuilderConfig, createSigntoolOptions } = require('./builder_config')

describe('electron-builder configuration', () => {
    it('defines signed Windows x64 NSIS metadata and bundled runtime inputs', () => {
        const config = createBuilderConfig({})

        expect(config).toMatchObject({
            appId: APP_ID,
            asar: true,
            extraMetadata: { main: 'desktop/main.js' },
            forceCodeSigning: true,
            productName: PRODUCT_NAME,
            win: {
                executableName: EXECUTABLE_NAME,
                icon: 'build/md2.ico',
                target: [{ arch: ['x64'], target: 'nsis' }],
            },
        })
        expect(config.files).toContainEqual(expect.objectContaining({ from: '.', to: 'desktop' }))
        expect(config.files).toContainEqual(expect.objectContaining({ from: '../app/dist', to: 'desktop/renderer' }))
        expect(config.files).toContainEqual(expect.objectContaining({ from: '../shared', to: 'shared' }))
        expect(config.extraResources).toEqual([{ from: '.env', to: '.env' }])
    })

    it('selects a certificate-store identity only when configured', () => {
        expect(createSigntoolOptions({})).not.toHaveProperty('certificateSubjectName')
        expect(createSigntoolOptions({
            WIN_CSC_PUBLISHER_NAME: 'Example Publisher',
            WIN_CSC_SHA1: 'ABC123',
            WIN_CSC_SUBJECT_NAME: 'Example Certificate',
        })).toMatchObject({
            certificateSha1: 'ABC123',
            certificateSubjectName: 'Example Certificate',
            publisherName: 'Example Publisher',
            signingHashAlgorithms: ['sha256'],
        })
    })
})
