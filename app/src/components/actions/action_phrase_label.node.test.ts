import { describe, expect, it } from 'vitest'
import { actionPhraseLabel } from './action_phrase_label'

describe('actionPhraseLabel', () => {
    it('uses phrase text when the title contains only whitespace', () => {
        expect(actionPhraseLabel('   ', 'Run tests')).toBe('Run tests')
    })

    it('uses an untitled label when both title and first text line are empty', () => {
        expect(actionPhraseLabel('', '\nMore detail')).toBe('Untitled phrase')
    })
})
