import { describe, expect, it } from 'vitest'
import { matchPlaceholderTrigger } from './markdown_placeholder_trigger'

describe('matchPlaceholderTrigger', () => {
    it('opens for an empty placeholder query', () => {
        expect(matchPlaceholderTrigger('Review {{', {} as never)).toEqual({
            leadOffset: 7,
            matchingString: '',
            replaceableString: '{{',
        })
    })

    it('captures a partially typed hyphenated placeholder', () => {
        expect(matchPlaceholderTrigger('Review {{card-f', {} as never)).toEqual({
            leadOffset: 7,
            matchingString: 'card-f',
            replaceableString: '{{card-f',
        })
    })

    it('does not match a completed placeholder or whitespace', () => {
        expect(matchPlaceholderTrigger('{{card-file}}', {} as never)).toBeNull()
        expect(matchPlaceholderTrigger('{{card file', {} as never)).toBeNull()
    })
})
