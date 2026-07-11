import { describe, expect, it } from 'vitest'
import { DEFAULT_CARD_TYPES, DEFAULT_STATES, type MarkdownFile } from '../data/data_types'
import type { RemarkableConnectionSettings, RemarkableImportedAsset } from '../data/remarkable_bridge'
import { parseImportMetadata, remarkableDeviceKey, remarkableMetadataPath } from '../data/remarkable_import_metadata'
import { buildRemarkableImport, type BuildRemarkableImportInput } from './remarkable_import_service'

const SETTINGS: RemarkableConnectionSettings = {
    host: 'remarkable.local',
    imageFolder: '/img',
    password: 'secret',
    port: 22,
    username: 'root',
}

const CONFIG = { cardBodyTemplate: '# Goal', cardTypes: DEFAULT_CARD_TYPES, states: DEFAULT_STATES, workingFolder: 'design' }

function asset(name: string, overrides: Partial<RemarkableImportedAsset> = {}): RemarkableImportedAsset {
    return { content: btoa(name), modifiedTime: '2026-07-01T10:00:00.000Z', name, sourcePath: `/img/${name}`, ...overrides }
}

function existingCard(): MarkdownFile {
    return { content: '---\nid: F-1\ntitle: Card\n---\n\n# Goal\n', path: 'design/F-1-card.md' }
}

function baseInput(overrides: Partial<BuildRemarkableImportInput> = {}): BuildRemarkableImportInput {
    return {
        assets: [asset('note.png')],
        config: CONFIG,
        files: [existingCard()],
        importedAt: '2026-07-02T09:00:00.000Z',
        metadataContent: null,
        settings: SETTINGS,
        target: { cardPath: 'design/F-1-card.md', kind: 'existing' },
        ...overrides,
    }
}

describe('buildRemarkableImport into an existing card', () => {
    it('places assets beside the card and links them with relative markdown', () => {
        const plan = buildRemarkableImport(baseInput())

        const cardFile = plan.commitFiles.find((file) => file.path === 'design/F-1-card.md')
        const assetFile = plan.commitFiles.find((file) => file.path === 'design/note.png')

        expect(plan.cardPath).toBe('design/F-1-card.md')
        expect(assetFile?.encoding).toBe('base64')
        expect(assetFile?.content).toBe(btoa('note.png'))
        expect(cardFile?.content).toContain('![note](note.png)')
        expect(plan.importedAssetPaths).toEqual(['design/note.png'])
    })

    it('records the import in the metadata file under the working folder', () => {
        const plan = buildRemarkableImport(baseInput())
        const metadataFile = plan.commitFiles.find((file) => file.path === remarkableMetadataPath('design'))
        const metadata = parseImportMetadata(metadataFile?.content ?? null)
        const record = metadata.devices[remarkableDeviceKey(SETTINGS)].files['/img/note.png']

        expect(record.localPath).toBe('design/note.png')
        expect(record.importedModifiedTime).toBe('2026-07-01T10:00:00.000Z')
    })

    it('rejects unsupported file types before producing any files', () => {
        expect(() => buildRemarkableImport(baseInput({ assets: [asset('note.txt')] }))).toThrow(/Unsupported asset file type/u)
    })

    it('rejects a duplicate target file name', () => {
        const files = [existingCard(), { content: '', path: 'design/note.png' }]
        expect(() => buildRemarkableImport(baseInput({ files }))).toThrow(/Duplicate import target/u)
    })

    it('rejects duplicate names within one import batch', () => {
        expect(() => buildRemarkableImport(baseInput({ assets: [asset('note.png'), asset('note.png')] }))).toThrow(/Duplicate import target/u)
    })

    it('throws when the target card is not loaded', () => {
        expect(() => buildRemarkableImport(baseInput({ target: { cardPath: 'design/missing.md', kind: 'existing' } }))).toThrow(/not loaded/u)
    })
})

describe('buildRemarkableImport into a new feature card', () => {
    it('creates a new card with the imported images linked', () => {
        const plan = buildRemarkableImport(baseInput({
            files: [existingCard()],
            target: { draft: { body: '', title: 'Scanned notes', type: 'feature' }, kind: 'new' },
        }))

        const cardFile = plan.commitFiles.find((file) => file.path === plan.cardPath)

        expect(plan.cardPath).toBe('design/F-2-scanned-notes.md')
        expect(plan.message).toContain('Create design/F-2-scanned-notes.md')
        expect(cardFile?.content).toContain('![note](note.png)')
    })
})
