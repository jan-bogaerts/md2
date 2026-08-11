import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useCellValue } from '@mdxeditor/editor'
import {
    $getSelection,
    $isRangeSelection,
    COMMAND_PRIORITY_HIGH,
    COPY_COMMAND,
    KEY_DOWN_COMMAND,
    PASTE_COMMAND,
    type PasteCommandType,
} from 'lexical'
import { useCallback, useEffect, useRef } from 'react'
import { dialogService } from '../../services/dialog_service'
import { useDialogError } from '../hooks/use_dialog_error'
import { markdownPasteConfig$ } from './markdown_paste_cell'

const MARKDOWN_MIME_TYPE = 'text/markdown'
const PLAIN_TEXT_MIME_TYPE = 'text/plain'

interface ShortcutIntent {
    generation: number
    shifted: boolean
}

function trackShortcutIntent(intent: ShortcutIntent, shifted: boolean) {
    intent.generation += 1
    intent.shifted = shifted
    const generation = intent.generation
    setTimeout(() => {
        if (intent.generation === generation) intent.shifted = false
    }, 0)
}

function consumeShiftedIntent(intent: ShortcutIntent) {
    const shifted = intent.shifted
    intent.shifted = false
    return shifted
}

function isControlShortcut(event: KeyboardEvent, key: string) {
    return event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === key
}

/** Handles Markdown-aware and literal-text clipboard operations for MDXEditor. */
export function MarkdownPastePlugin() {
    const config = useCellValue(markdownPasteConfig$)
    const [editor] = useLexicalComposerContext()
    const copyIntentRef = useRef<ShortcutIntent>({ generation: 0, shifted: false })
    const pasteIntentRef = useRef<ShortcutIntent>({ generation: 0, shifted: false })
    const configError = config ? null : new Error('Cannot register Markdown paste without configuration')
    useDialogError(configError, 'Markdown paste is unavailable')

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (isControlShortcut(event, 'c')) trackShortcutIntent(copyIntentRef.current, event.shiftKey)
        if (isControlShortcut(event, 'v')) trackShortcutIntent(pasteIntentRef.current, event.shiftKey)
        return false
    }, [])

    const handleCopy = useCallback((event: ClipboardEvent | KeyboardEvent | null) => {
        const shifted = consumeShiftedIntent(copyIntentRef.current)
        if (!config || !event || !('clipboardData' in event) || !event.clipboardData) return false

        const selection = $getSelection()
        if (!$isRangeSelection(selection) || selection.isCollapsed()) return false

        try {
            const plainText = selection.getTextContent()
            if (shifted) {
                event.clipboardData.setData(PLAIN_TEXT_MIME_TYPE, plainText)
            } else {
                const markdown = config.getSelectionMarkdown()
                if (!markdown) throw new Error('Selected content could not be serialized as Markdown')
                event.clipboardData.setData(MARKDOWN_MIME_TYPE, markdown)
                event.clipboardData.setData(PLAIN_TEXT_MIME_TYPE, markdown)
            }
            event.preventDefault()
            return true
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Selected content could not be copied' })
            return false
        }
    }, [config])

    const handlePaste = useCallback((event: PasteCommandType) => {
        const shifted = consumeShiftedIntent(pasteIntentRef.current)
        if (!config || config.readOnly || !('clipboardData' in event) || !event.clipboardData) return false

        try {
            if (shifted) {
                const plainText = event.clipboardData.getData(PLAIN_TEXT_MIME_TYPE)
                if (!plainText) return false
                const selection = $getSelection()
                if (!$isRangeSelection(selection)) return false
                selection.insertText(plainText)
                event.preventDefault()
                return true
            }

            const markdown = event.clipboardData.getData(MARKDOWN_MIME_TYPE)
                || event.clipboardData.getData(PLAIN_TEXT_MIME_TYPE)
            if (!markdown) return false

            config.insertMarkdown(markdown)
            event.preventDefault()
            return true
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Clipboard content could not be pasted' })
            return false
        }
    }, [config])

    useEffect(() => {
        const unregisterKeyDown = editor.registerCommand(KEY_DOWN_COMMAND, handleKeyDown, COMMAND_PRIORITY_HIGH)
        const unregisterCopy = editor.registerCommand(COPY_COMMAND, handleCopy, COMMAND_PRIORITY_HIGH)
        const unregisterPaste = editor.registerCommand(PASTE_COMMAND, handlePaste, COMMAND_PRIORITY_HIGH)

        return () => {
            unregisterKeyDown()
            unregisterCopy()
            unregisterPaste()
        }
    }, [editor, handleCopy, handleKeyDown, handlePaste])

    return null
}
