import { describe, expect, it } from 'vitest'
import type { RemarkableConnectionSettings, RemarkableDeviceFile } from './remarkable_bridge'
import {
    diffDeviceFiles,
    parseImportMetadata,
    recordImports,
    remarkableDeviceKey,
    remarkableMetadataPath,
    serializeImportMetadata,
} from './remarkable_import_metadata'

const SETTINGS: RemarkableConnectionSettings = {
    host: 'remarkable.local',
    imageFolder: '/img',
    password: 'secret',
    port: 22,
    username: 'root',
}

const KEY = remarkableDeviceKey(SETTINGS)

function deviceFile(path: string, modifiedTime: string): RemarkableDeviceFile {
    return { modifiedTime, name: path.split('/').at(-1) ?? path, path }
}

describe('remarkableMetadataPath', () => {
    it('places the metadata file under the working folder', () => {
        expect(remarkableMetadataPath('design')).toBe('design/.remarkable-import.json')
        expect(remarkableMetadataPath('design/')).toBe('design/.remarkable-import.json')
        expect(remarkableMetadataPath('')).toBe('.remarkable-import.json')
    })
})

describe('parseImportMetadata', () => {
    it('returns empty metadata for null or blank content', () => {
        expect(parseImportMetadata(null).devices).toEqual({})
        expect(parseImportMetadata('   ').devices).toEqual({})
    })

    it('round-trips serialized metadata', () => {
        const recorded = recordImports(parseImportMetadata(null), KEY, [
            { devicePath: '/img/a.png', localPath: 'design/a.png', modifiedTime: '2026-07-01T10:00:00.000Z' },
        ], '2026-07-02T09:00:00.000Z')

        expect(parseImportMetadata(serializeImportMetadata(recorded))).toEqual(recorded)
    })

    it('throws on malformed metadata', () => {
        expect(() => parseImportMetadata('{"devices": 5}')).toThrow(/Malformed/u)
    })
})

describe('diffDeviceFiles', () => {
    const metadata = recordImports(parseImportMetadata(null), KEY, [
        { devicePath: '/img/known.png', localPath: 'design/known.png', modifiedTime: '2026-07-01T10:00:00.000Z' },
    ], '2026-07-01T11:00:00.000Z')

    it('marks a file that was never imported as new', () => {
        const diff = diffDeviceFiles([deviceFile('/img/fresh.png', '2026-07-01T10:00:00.000Z')], metadata, KEY)

        expect(diff[0].status).toBe('new')
    })

    it('marks a file with a newer device time as changed', () => {
        const diff = diffDeviceFiles([deviceFile('/img/known.png', '2026-07-05T10:00:00.000Z')], metadata, KEY)

        expect(diff[0].status).toBe('changed')
    })

    it('marks an unchanged file as imported', () => {
        const diff = diffDeviceFiles([deviceFile('/img/known.png', '2026-07-01T10:00:00.000Z')], metadata, KEY)

        expect(diff[0].status).toBe('imported')
    })

    it('scopes history to the device key', () => {
        const otherKey = remarkableDeviceKey({ ...SETTINGS, host: 'other.local' })
        const diff = diffDeviceFiles([deviceFile('/img/known.png', '2026-07-01T10:00:00.000Z')], metadata, otherKey)

        expect(diff[0].status).toBe('new')
    })
})

describe('recordImports', () => {
    it('does not mutate the input metadata', () => {
        const before = parseImportMetadata(null)
        recordImports(before, KEY, [{ devicePath: '/img/a.png', localPath: 'design/a.png', modifiedTime: '2026-07-01T10:00:00.000Z' }], '2026-07-02T09:00:00.000Z')

        expect(before.devices).toEqual({})
    })
})
