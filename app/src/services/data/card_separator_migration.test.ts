import { describe, expect, it } from 'vitest'
import type { MarkdownFile } from '../../data/data_types'
import { planCardSeparatorMigration } from './card_separator_migration'

describe('card separator migration', () => {
    it('renames matching card files in every project subfolder and updates matching header ids', () => {
        const files: MarkdownFile[] = [
            { content: '---\nid: F-1\ntitle: One Card\n---\n\n# One Card', path: 'design/F-1-one-card.md', sha: 'one' },
            { content: '---\nid: J-2\ntitle: Two\n---\n\n# Two', path: 'design/history/J-2-two.md', sha: 'two' },
            { content: '# Notes', path: 'design/notes.md', sha: 'notes' },
            { content: '---\nid: B_3\n---\n', path: 'design/B_3_three.md', sha: 'three' },
        ]

        const moves = planCardSeparatorMigration(files, '-', '_')

        expect(moves.map(({ fromPath, toPath }) => ({ fromPath, toPath }))).toEqual([
            { fromPath: 'design/F-1-one-card.md', toPath: 'design/F_1_one_card.md' },
            { fromPath: 'design/history/J-2-two.md', toPath: 'design/history/J_2_two.md' },
        ])
        expect(moves[0].content).toContain('id: F_1')
        expect(moves[1].content).toContain('id: J_2')
        expect(moves[0].sha).toBe('one')
    })

    it('keeps content unchanged when its header id does not match the file id', () => {
        const content = '---\nid: external-id\ntitle: One\n---\n\n# One'
        const moves = planCardSeparatorMigration([{ content, path: 'design/F-1-one.md' }], '-', '_')

        expect(moves[0].content).toBe(content)
    })

    it('supports switching back from underscore to hyphen', () => {
        const files = [{ content: '---\nid: F_1\ntitle: One Card\n---\n', path: 'design/F_1_one_card.md' }]

        const moves = planCardSeparatorMigration(files, '_', '-')

        expect(moves[0].toPath).toBe('design/F-1-one-card.md')
        expect(moves[0].content).toContain('id: F-1')
    })

    it('rejects an existing migration target before returning any moves', () => {
        const files = [
            { content: '# Old', path: 'design/F-1-one.md' },
            { content: '# Existing', path: 'design/F_1_one.md' },
        ]

        expect(() => planCardSeparatorMigration(files, '-', '_')).toThrow('target already exists')
    })
})
