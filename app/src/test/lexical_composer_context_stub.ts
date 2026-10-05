import { createEditor } from 'lexical'

// React handlers in the textarea adapter dispatch commands; native Lexical listeners would dispatch them twice.
export const testLexicalEditor = createEditor({ disableEvents: true });

export function useLexicalComposerContextStub() {
    return [testLexicalEditor] as const
}
