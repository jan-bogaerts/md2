import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useCellValue } from '@mdxeditor/editor'
import { useEffect, useRef } from 'react'
import { useDialogError } from '../hooks/use_dialog_error'
import { markdownPlainTextConfig$ } from './markdown_plain_text_config_cell'
import { writePlainText } from './markdown_plain_text'

/** Hands the root Lexical editor to its owner and seeds it with literal text instead of Markdown. */
export function MarkdownPlainTextPlugin() {
    const config = useCellValue(markdownPlainTextConfig$)
    const [editor] = useLexicalComposerContext()
    const seededRef = useRef(false)
    const configError = config ? null : new Error('Cannot register plain text mode without configuration')
    useDialogError(configError, 'Plain text editing is unavailable')

    useEffect(() => {
        if (!config || seededRef.current) return

        seededRef.current = true
        config.onEditorReady(editor)
        writePlainText(editor, config.initialText)
    }, [config, editor])

    return null
}
