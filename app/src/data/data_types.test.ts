import { describe, expect, it } from 'vitest'
import { DEFAULT_CARD_TYPES } from './data_types'
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
