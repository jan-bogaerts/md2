import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useCellValue } from '@mdxeditor/editor'
import {
    COMMAND_PRIORITY_HIGH,
    PASTE_COMMAND,
    type PasteCommandType,
} from 'lexical'
import { useCallback, useEffect } from 'react'
import { useDialogError } from '../hooks/use_dialog_error'
import { markdownPasteConfig$ } from './markdown_paste_cell'

/** Imports plain clipboard content as Markdown at the current Lexical selection. */
export function MarkdownPastePlugin() {
    const config = useCellValue(markdownPasteConfig$)
    const [editor] = useLexicalComposerContext()
    const configError = config ? null : new Error('Cannot register Markdown paste without configuration')
    useDialogError(configError, 'Markdown paste is unavailable')

    const handlePaste = useCallback((event: PasteCommandType) => {
        if (!config || !('clipboardData' in event) || !event.clipboardData) return false

        const markdown = event.clipboardData.getData('text/markdown')
            || event.clipboardData.getData('text/plain')
        if (!markdown) return false

        event.preventDefault()
        config.insertMarkdown(markdown)
        return true
    }, [config])

    useEffect(
        () => editor.registerCommand(PASTE_COMMAND, handlePaste, COMMAND_PRIORITY_HIGH),
        [editor, handlePaste],
    )

    return null
}
