import { cleanup, render } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import { MarkdownEditor, type MarkdownEditorHandle } from './markdown_editor'

const COMMAND = String.raw`powershell.exe -NoProfile -File "C:\Users\janbo\dev\tools\release_electron.ps1"`

function renderEditor(markdown: string, plainText: boolean) {
    const handle = createRef<MarkdownEditorHandle>()
    render(
        <AppThemeProvider>
            <MarkdownEditor markdown={markdown} onChange={vi.fn()} plainText={plainText} ref={handle} />
        </AppThemeProvider>,
    )

    return handle
}

function editorText() {
    return document.querySelector('[contenteditable="true"]')?.textContent ?? ''
}

describe('MarkdownEditor plain text mode with installed MDXEditor', () => {
    afterEach(cleanup)

    it('reads a command with markdown characters back unescaped', () => {
        const handle = renderEditor(COMMAND, true)

        expect(editorText()).toBe(COMMAND)
        expect(handle.current?.getMarkdown()).toBe(COMMAND)
    })

    it('keeps a leading dash and asterisks literal', () => {
        const command = '- echo *all* [items]'
        const handle = renderEditor(command, true)

        expect(handle.current?.getMarkdown()).toBe(command)
    })

    it('still serializes markdown source when plain text mode is off', () => {
        const handle = renderEditor(COMMAND, false)

        const markdown = handle.current?.getMarkdown() ?? ''

        expect(markdown).toContain('\\_electron.ps1')
        expect(markdown).not.toBe(COMMAND)
    })
})
