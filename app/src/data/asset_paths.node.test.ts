import { describe, expect, it } from 'vitest'
import { cardFolder, isSafeAssetFileName, isSupportedAssetFileName, resolveCardAssetPath } from './asset_paths'

describe('cardFolder', () => {
    it('returns the folder containing the card', () => {
        expect(cardFolder('design/F-1-card.md')).toBe('design')
        expect(cardFolder('design/history/F-2-card.md')).toBe('design/history')
    })

    it('normalizes windows separators and handles root-level cards', () => {
        expect(cardFolder('design\\F-1-card.md')).toBe('design')
        expect(cardFolder('F-1-card.md')).toBe('')
    })
})

describe('isSafeAssetFileName', () => {
    it('accepts bare file names', () => {
        expect(isSafeAssetFileName('note.png')).toBe(true)
    })

    it('rejects names that traverse or escape the folder', () => {
        expect(isSafeAssetFileName('')).toBe(false)
        expect(isSafeAssetFileName('..')).toBe(false)
        expect(isSafeAssetFileName('sub/note.png')).toBe(false)
        expect(isSafeAssetFileName('..\\note.png')).toBe(false)
    })
})

describe('isSupportedAssetFileName', () => {
    it('accepts known image extensions case-insensitively', () => {
        expect(isSupportedAssetFileName('note.PNG')).toBe(true)
        expect(isSupportedAssetFileName('scan.jpeg')).toBe(true)
    })

    it('rejects unsupported types', () => {
        expect(isSupportedAssetFileName('note.txt')).toBe(false)
        expect(isSupportedAssetFileName('note')).toBe(false)
    })
})

describe('resolveCardAssetPath', () => {
    it('places the asset beside the target card', () => {
        expect(resolveCardAssetPath('design/F-1-card.md', 'note.png')).toBe('design/note.png')
        expect(resolveCardAssetPath('F-1-card.md', 'note.png')).toBe('note.png')
    })

    it('rejects unsafe file names so imports cannot escape the project', () => {
        expect(() => resolveCardAssetPath('design/F-1-card.md', '../secret.png')).toThrow(/Unsafe asset file name/u)
    })

    it('rejects unsupported file types', () => {
        expect(() => resolveCardAssetPath('design/F-1-card.md', 'note.txt')).toThrow(/Unsupported asset file type/u)
    })
})
