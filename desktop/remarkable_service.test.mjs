import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startTestSftpServer } from './test_sftp_server.mjs'

const require = createRequire(import.meta.url)
const { importFiles, listImageFiles, testConnection } = require('./remarkable_service')

describe('remarkable-service', () => {
    let rootDir
    let server
    let settings

    beforeEach(async () => {
        rootDir = await mkdtemp(join(tmpdir(), 'md2-remarkable-'))
        await mkdir(join(rootDir, 'sub'))
        await writeFile(join(rootDir, 'note.png'), Buffer.from('fake-png-bytes'))
        await writeFile(join(rootDir, 'scan.jpg'), Buffer.from('fake-jpg-bytes'))
        await writeFile(join(rootDir, 'notes.txt'), 'not an image')

        server = await startTestSftpServer()
        settings = {
            host: '127.0.0.1',
            imageFolder: rootDir.replace(/\\/gu, '/'),
            password: server.password,
            port: server.port,
            username: server.username,
        }
    })

    afterEach(async () => {
        await server.stop()
        await rm(rootDir, { force: true, recursive: true })
    })

    it('reports a successful connection when the image folder is reachable', async () => {
        await expect(testConnection(settings)).resolves.toEqual({ message: null, ok: true })
    })

    it('reports a failed connection with a message when auth is rejected', async () => {
        const result = await testConnection({ ...settings, password: 'wrong' })

        expect(result.ok).toBe(false)
        expect(typeof result.message).toBe('string')
    })

    it('lists only supported image files with modified times, excluding folders and other types', async () => {
        const files = await listImageFiles(settings)

        expect(files.map((file) => file.name).sort()).toEqual(['note.png', 'scan.jpg'])
        expect(files.every((file) => !Number.isNaN(Date.parse(file.modifiedTime)))).toBe(true)
    })

    it('imports selected files as base64-encoded assets', async () => {
        const assets = await importFiles({
            paths: [`${settings.imageFolder}/note.png`],
            settings,
        })

        expect(assets).toHaveLength(1)
        expect(assets[0].name).toBe('note.png')
        expect(assets[0].sourcePath).toBe(`${settings.imageFolder}/note.png`)
        expect(Buffer.from(assets[0].content, 'base64').toString()).toBe('fake-png-bytes')
    })
})
