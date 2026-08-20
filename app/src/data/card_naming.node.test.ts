import { describe, expect, it } from 'vitest'
import { DEFAULT_CARD_TYPES } from './data_types'
import { createCardFile, desiredCardPath, getNextCardNumber, slugifyTitle } from './card_naming'
import { markdownParsingService } from '../services/data/markdown_parsing_service'
import { files } from '../services/test_support/data_service_test_support'

describe('cardNaming', () => {
    it('uses the configured separator for every replaced title character group', () => {
        expect(slugifyTitle(' New / Card___Here! ', '_')).toBe('new_card_here')
        expect(slugifyTitle(' New / Card___Here! ', '-')).toBe('new-card-here')
    })

    it('uses the next available number across configured release and archived folders', () => {
        const configuredFolderFiles = [
            ...files,
            { content: '# Released', path: 'design/records/releases/v1/F-8-released.md' },
            { content: '# Archived', path: 'design/records/archived/F-9-archived.md' },
        ]

        expect(getNextCardNumber(configuredFolderFiles, 'F')).toBe(10)
    })

    it('creates cards with configured id and filename convention', () => {
        const file = createCardFile(files, 'design', '_', DEFAULT_CARD_TYPES, 'new', {
            body: 'Body',
            title: 'New Card',
            type: 'feature',
        })

        expect(file.path).toBe('design/F_4_new_card.md')
        expect(file.content).toContain('id: F_4')
        expect(file.content).toMatch(/\n\nBody$/u)
        expect(file.content).not.toContain('# Goal')
        expect(file.content).toContain('policy:')
        expect(file.content).toContain('author:')
    })

    it('generates the id prefix and number per card type', () => {
        const job = createCardFile(files, 'design', '_', DEFAULT_CARD_TYPES, 'new', {
            body: '',
            title: 'Job Card',
            type: 'job',
        })
        const bug = createCardFile(files, 'design', '_', DEFAULT_CARD_TYPES, 'new', {
            body: '',
            title: 'Bug Card',
            type: 'bug',
        })

        expect(job.path).toBe('design/J_1_job_card.md')
        expect(job.content).toContain('id: J_1')
        expect(bug.path).toBe('design/B_1_bug_card.md')
        expect(bug.content).toContain('id: B_1')
    })

    it('uses the configured hyphen separator when selected', () => {
        const file = createCardFile(files, 'design', '-', DEFAULT_CARD_TYPES, 'new', {
            body: '',
            title: 'New Card',
            type: 'feature',
        })

        expect(file.path).toBe('design/F-4-new-card.md')
        expect(file.content).toContain('id: F-4')
    })

    it('numbers each type independently of other prefixes', () => {
        const nextFiles = [...files, { content: '# Job', path: 'design/J-7-job.md' }]

        expect(getNextCardNumber(nextFiles, 'J')).toBe(8)
        expect(getNextCardNumber(nextFiles, 'F')).toBe(4)
    })

    it('creates cards for custom configured types', () => {
        const customTypes = [{ color: '#123456', idPrefix: 'T', label: 'Task', type: 'task' }]
        const file = createCardFile(files, 'design', '_', customTypes, 'backlog', {
            body: '',
            title: 'Custom Card',
            type: 'task',
        })

        expect(file.path).toBe('design/T_1_custom_card.md')
        expect(file.content).toContain('id: T_1')
        expect(file.content).toContain('status: backlog')
    })

    it('renames a card file to the new title while keeping its folder, id and separator', () => {
        expect(desiredCardPath('design/F_4_new_card.md', 'Other Title', [])).toBe('design/F_4_other_title.md')
        expect(desiredCardPath('design/history/F-3-old.md', 'Much Older', [])).toBe('design/history/F-3-much-older.md')
    })

    it('keeps the current path when the title slug is unchanged', () => {
        expect(desiredCardPath('design/F_4_new_card.md', ' new  card! ', [])).toBe('design/F_4_new_card.md')
    })

    it('keeps the current path for files that are not named as cards', () => {
        expect(desiredCardPath('design/free note.md', 'Other Title', [])).toBe('design/free note.md')
        expect(desiredCardPath('design/notes.md', 'Other Title', [])).toBe('design/notes.md')
    })

    it('keeps the current path when the target file name is taken', () => {
        expect(desiredCardPath('design/F_4_new_card.md', 'Other Title', ['design/F_4_other_title.md']))
            .toBe('design/F_4_new_card.md')
        expect(desiredCardPath('design/F_4_new_card.md', 'Other Title', ['design/F_4_OTHER_TITLE.md']))
            .toBe('design/F_4_new_card.md')
        expect(desiredCardPath('design/F_4_new_card.md', 'Other Title', ['design/F_5_other_title.md']))
            .toBe('design/F_4_other_title.md')
    })

    it('creates cards with a generated internal id that is separate from filename id', () => {
        const file = createCardFile(files, 'design', '_', DEFAULT_CARD_TYPES, 'new', {
            body: '',
            title: 'New Card',
            type: 'feature',
        })
        const card = markdownParsingService.parseCard(file, 'design')

        expect(card.header.id).toBe('F_4')
        expect(card.header.internalId).toBeTruthy()
        expect(card.header.internalId).not.toBe('F_4')
        expect(card.header.internalId).not.toContain('new-card')
    })
})
