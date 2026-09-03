import { createEditor } from 'lexical'
import { describe, expect, it } from 'vitest'
import { readPlainText, writePlainText } from './markdown_plain_text'

const COMMAND = String.raw`powershell.exe -NoProfile -File "C:\Users\janbo\dev\tools\release_electron.ps1"`

function roundTrip(text: string) {
    const editor = createEditor()
    writePlainText(editor, text)

    return readPlainText(editor)
}

describe('plain text editor content', () => {
    it('keeps a command line with an underscore unescaped', () => {
        expect(roundTrip(COMMAND)).toBe(COMMAND)
    })

    it('keeps markdown significant characters literal', () => {
        const text = 'echo _a_ *b* [c] `d` #e ~f'

        expect(roundTrip(text)).toBe(text)
    })

    it('keeps a leading dash and leading whitespace', () => {
        const text = '  - npm run build'

        expect(roundTrip(text)).toBe(text)
    })

    it('separates lines with a single newline', () => {
        expect(roundTrip('first\nsecond')).toBe('first\nsecond')
    })

    it('collapses the blank separator lexical adds between blocks', () => {
        const editor = createEditor()
        writePlainText(editor, 'first\n\n\nsecond')

        expect(readPlainText(editor)).toBe('first\nsecond')
    })
})
