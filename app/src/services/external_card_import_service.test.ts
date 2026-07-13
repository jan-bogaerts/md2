import { describe, expect, it } from 'vitest'
import type { MarkdownFile } from '../data/data_types'
import { DEFAULT_CARD_TYPES } from '../data/data_types'
import { planExternalCardImports } from './external_card_import_service'
import { storageFiles } from './test_support/data_service_test_support'

describe('external card imports', () => {
    it('completes headers, renames files and allocates sequential ids after existing cards', () => {
        const importFiles: MarkdownFile[] = [
            ...storageFiles,
            { content: '# First note\n\nBody', path: 'design/notes.md', sha: 'sha-notes' },
            { content: '---\nowner: JB\n---\n\n# Second note', path: 'design/second.md', sha: 'sha-second' },
        ]
        const plan = planExternalCardImports(importFiles, 'design', '_', DEFAULT_CARD_TYPES, 'new')

        expect(plan.moves.map((move) => move.toPath)).toEqual(['design/F_4_first_note.md', 'design/F_5_second_note.md'])
        expect(plan.moves[0]).toMatchObject({ fromPath: 'design/notes.md', sha: 'sha-notes' })
        expect(plan.importedFiles[0].content).toContain('id: F_4')
        expect(plan.importedFiles[0].content).toContain('internalId:')
        expect(plan.importedFiles[0].content).toContain('title: First note')
        expect(plan.importedFiles[0].content).toContain('status: new')
        expect(plan.importedFiles[0].content).toContain('# First note\n\nBody')
        expect(plan.importedFiles[1].content).toContain('owner: JB')
    })

    it('does not plan imports for complete conforming root cards', () => {
        const plan = planExternalCardImports([
            {
                content: '---\nid: F-4\ninternalId: uuid-4\ntitle: Done\nstatus: ready\n---\n\n# Done',
                path: 'design/F-4-done.md',
            },
        ], 'design', '_', DEFAULT_CARD_TYPES, 'new')

        expect(plan.moves).toEqual([])
    })
})
