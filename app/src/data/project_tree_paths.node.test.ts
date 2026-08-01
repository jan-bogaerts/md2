import { describe, expect, it } from 'vitest'
import { newFolderPath, newMarkdownFilePath } from './project_tree_paths'

describe('project tree creation paths', () => {
    it('creates folders only below the configured project folder', () => {
        expect(newFolderPath('design/history', 'release-1', 'design')).toBe('design/history/release-1')
        expect(newFolderPath('design/notes', 'drafts', 'design')).toBe('design/notes/drafts')
        expect(() => newFolderPath('app', 'release-1', 'design')).toThrow('outside the project folder')
    })

    it('supports a project folder at the repository root', () => {
        expect(newFolderPath('', 'notes', '')).toBe('notes')
        expect(newMarkdownFilePath('docs', 'overview', '')).toBe('docs/overview.md')
    })

    it('adds the Markdown extension when it is missing', () => {
        expect(newMarkdownFilePath('design', 'notes', 'design')).toBe('design/notes.md')
        expect(newMarkdownFilePath('design', 'notes.MD', 'design')).toBe('design/notes.MD')
    })

    it.each(['../notes', 'nested/notes', 'notes?', 'CON', 'trailing.'])('rejects unsafe project item name %s', (name) => {
        expect(() => newFolderPath('design', name, 'design')).toThrow()
    })
})
