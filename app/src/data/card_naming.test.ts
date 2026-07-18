import { describe, expect, it } from 'vitest'
import { DEFAULT_CARD_BODY_TEMPLATE, DEFAULT_CARD_TYPES } from './data_types'
import { createCardFile, getNextCardNumber, slugifyTitle } from './card_naming'
import { markdownParsingService } from '../services/data/markdown_parsing_service'
import { files } from '../services/test_support/data_service_test_support'

describe('cardNaming', () => {
    it('uses the configured separator for every replaced title character group', () => {
        expect(slugifyTitle(' New / Card___Here! ', '_')).toBe('new_card_here')
        expect(slugifyTitle(' New / Card___Here! ', '-')).toBe('new-card-here')
    })

    it('uses the next available number across folders and archived history cards', () => {
        expect(getNextCardNumber(files, 'F')).toBe(4)
    })

    it('creates cards with configured id and filename convention', () => {
        const file = createCardFile(files, 'design', '_', DEFAULT_CARD_TYPES, DEFAULT_CARD_BODY_TEMPLATE, 'new', {
            body: 'Body',
            title: 'New Card',
            type: 'feature',
        })

        expect(file.path).toBe('design/F_4_new_card.md')
        expect(file.content).toContain('id: F_4')
        expect(file.content).toContain(DEFAULT_CARD_BODY_TEMPLATE)
        expect(file.content).toContain('Body')
        expect(file.content).toContain('policy:')
        expect(file.content).toContain('author:')
    })

    it('generates the id prefix and number per card type', () => {
        const job = createCardFile(files, 'design', '_', DEFAULT_CARD_TYPES, DEFAULT_CARD_BODY_TEMPLATE, 'new', {
            body: '',
            title: 'Job Card',
            type: 'job',
        })
        const bug = createCardFile(files, 'design', '_', DEFAULT_CARD_TYPES, DEFAULT_CARD_BODY_TEMPLATE, 'new', {
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
        const file = createCardFile(files, 'design', '-', DEFAULT_CARD_TYPES, DEFAULT_CARD_BODY_TEMPLATE, 'new', {
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
        const file = createCardFile(files, 'design', '_', customTypes, DEFAULT_CARD_BODY_TEMPLATE, 'backlog', {
            body: '',
            title: 'Custom Card',
            type: 'task',
        })

        expect(file.path).toBe('design/T_1_custom_card.md')
        expect(file.content).toContain('id: T_1')
        expect(file.content).toContain('status: backlog')
    })

    it('creates cards with a generated internal id that is separate from filename id', () => {
        const file = createCardFile(files, 'design', '_', DEFAULT_CARD_TYPES, DEFAULT_CARD_BODY_TEMPLATE, 'new', {
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
