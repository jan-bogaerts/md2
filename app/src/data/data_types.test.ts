import { describe, expect, it } from 'vitest'
import { DEFAULT_CARD_TYPES, DEFAULT_COLUMN_ACCENTS, DEFAULT_PROJECT_CONFIG, DEFAULT_STATES, defaultColumnAccent } from './data_types'
import { DEFAULT_COLOR_SCHEME } from '../theme/theme_config'

describe('DEFAULT_CARD_TYPES', () => {
    it('assigns a color to every card type', () => {
        DEFAULT_CARD_TYPES.forEach((cardType) => {
            expect(cardType.color).toMatch(/^#/)
        })
    })

    it('sources feature and job colors from the theme roles', () => {
        const feature = DEFAULT_CARD_TYPES.find((cardType) => cardType.type === 'feature')
        const job = DEFAULT_CARD_TYPES.find((cardType) => cardType.type === 'job')

        expect(feature?.color).toBe(DEFAULT_COLOR_SCHEME.primary.regular)
        expect(job?.color).toBe(DEFAULT_COLOR_SCHEME.secondary.regular)
    })
})

describe('DEFAULT_STATES', () => {
    it('defines the initial always-visible board columns in order', () => {
        expect(DEFAULT_STATES).toEqual([
            { alwaysVisible: true, color: '#9c4dcc', state: 'new' },
            { alwaysVisible: true, color: '#29a8e0', state: 'design' },
            { alwaysVisible: true, color: '#ed6c02', state: 'ready for implementation' },
            { alwaysVisible: true, color: '#f9a825', state: 'in progress' },
            { alwaysVisible: true, color: '#43a047', state: 'done' },
        ])
    })

    it('repeats the default accent sequence for additional columns', () => {
        expect(defaultColumnAccent(DEFAULT_COLUMN_ACCENTS.length)).toBe(DEFAULT_COLUMN_ACCENTS[0])
    })
})

describe('DEFAULT_PROJECT_CONFIG', () => {
    it('starts new projects under design with an active working folder', () => {
        expect(DEFAULT_PROJECT_CONFIG.projectFolder).toBe('design')
        expect(DEFAULT_PROJECT_CONFIG.workingFolder).toBe('active')
    })
})
