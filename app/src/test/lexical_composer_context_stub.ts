import { createEditor } from 'lexical'

export const testLexicalEditor = createEditor()

export function useLexicalComposerContextStub() {
    return [testLexicalEditor] as const
}
