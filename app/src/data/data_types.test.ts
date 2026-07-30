import { describe, expect, it } from 'vitest'
import { DEFAULT_COLUMN_ACCENTS, defaultColumnAccent } from './data_types'

describe('defaultColumnAccent', () => {
    it('repeats the default accent sequence for additional columns', () => {
        expect(defaultColumnAccent(DEFAULT_COLUMN_ACCENTS.length)).toBe(DEFAULT_COLUMN_ACCENTS[0])
    })
})
