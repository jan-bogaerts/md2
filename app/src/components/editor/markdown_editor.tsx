import { Box } from '@mui/material'
import {
    MDXEditor, codeBlockPlugin, codeMirrorPlugin,
    headingsPlugin, imagePlugin, linkDialogPlugin, linkPlugin, listsPlugin, markdownShortcutPlugin, quotePlugin,
    tablePlugin, thematicBreakPlugin, toolbarPlugin,
    type MDXEditorMethods,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react'
import type { ActionPlaceholder } from '../../data/action_placeholders'
import { useAppTheme } from '../../theme/use_app_theme'
import { markdownDocumentHistoryPlugin } from './markdown_document_history_realm_plugin'
import type { MarkdownDocumentHistoryStore } from './markdown_document_history_store'
import { MarkdownFormatToolbarControls } from './markdown_format_toolbar_controls'
import { markdownPlaceholderPlugin } from './markdown_placeholder_realm_plugin'
import { registerMarkdownEditorFlush } from './markdown_editor_flush'
import { buildMarkdownContentSx } from './markdown_style_sx'

const DEFAULT_CODE_LANGUAGE = ''
const CODE_BLOCK_LANGUAGES = { '': 'Plain text', js: 'JavaScript', ts: 'TypeScript', tsx: 'TSX', bash: 'Shell' }
const EMPTY_PLACEHOLDERS: readonly ActionPlaceholder[] = []

export interface MarkdownEditorHandle {
    flush(): void
    getMarkdown(): string
    setMarkdown(markdown: string): void
}

interface MarkdownEditorCommonProps {
    markdown: string
    overlayContainer?: HTMLElement | null
    placeholders?: readonly ActionPlaceholder[]
    stickyToolbar?: boolean
    toolbarContents?: () => ReactNode
}

type MarkdownEditorProps = MarkdownEditorCommonProps & ({
    documentId: string
    historyStore: MarkdownDocumentHistoryStore
    onChange?: never
    onDocumentChange: (documentId: string, markdown: string) => void
    onDocumentEdit?: (documentId: string, markdown: string) => void
} | {
    documentId?: never
    historyStore?: never
    onChange: (markdown: string) => void
    onDocumentChange?: never
    onDocumentEdit?: never
})

/**
 * Reusable MDXEditor surface for card bodies and files (F-007). The editor is
 * uncontrolled while typing: edits stay inside Lexical and are emitted only
 * on unmount, document switch, or `flushMarkdownEditors`. Document editors can
 * also report live edits without changing buffered flush behavior. A document
 * ID and history store let one editor retain independent undo/redo stacks per file.
 */
export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(props, ref) {
    const {
        markdown,
        overlayContainer,
        placeholders = EMPTY_PLACEHOLDERS,
        stickyToolbar = false,
        toolbarContents: customToolbarContents,
    } = props
    const documentId = props.documentId ?? null
    const historyStore = props.historyStore
    const { markdownStyleConfig, mode } = useAppTheme()
    const editorRef = useRef<MDXEditorMethods>(null)
    const activeDocumentIdRef = useRef(documentId)
    const latestMarkdownRef = useRef(markdown)
    const lastEmittedMarkdownRef = useRef(markdown)
    const onChangeRef = useRef(props.onChange)
    const onDocumentChangeRef = useRef(props.onDocumentChange)
    const onDocumentEditRef = useRef(props.onDocumentEdit)
    onChangeRef.current = props.onChange
    onDocumentChangeRef.current = props.onDocumentChange
    onDocumentEditRef.current = props.onDocumentEdit

    const flush = useCallback(() => {
        if (latestMarkdownRef.current === lastEmittedMarkdownRef.current) return

        lastEmittedMarkdownRef.current = latestMarkdownRef.current
        const activeDocumentId = activeDocumentIdRef.current
        if (activeDocumentId) {
            onDocumentChangeRef.current?.(activeDocumentId, latestMarkdownRef.current)
            return
        }
        onChangeRef.current?.(latestMarkdownRef.current)
    }, [])

    const handleBeforeDocumentSwitch = useCallback((nextDocumentId: string, nextMarkdown: string) => {
        const currentMarkdown = latestMarkdownRef.current
        flush()
        activeDocumentIdRef.current = nextDocumentId
        latestMarkdownRef.current = nextMarkdown
        lastEmittedMarkdownRef.current = nextMarkdown

        return currentMarkdown
    }, [flush])

    const handleDocumentSwitch = useCallback((normalizedMarkdown: string) => {
        latestMarkdownRef.current = normalizedMarkdown
        lastEmittedMarkdownRef.current = normalizedMarkdown
    }, [])

    useEffect(() => {
        if (!editorRef.current) throw new Error('Cannot baseline markdown before the editor is mounted')

        const normalizedMarkdown = editorRef.current.getMarkdown()
        latestMarkdownRef.current = normalizedMarkdown
        lastEmittedMarkdownRef.current = normalizedMarkdown
    }, [])

    useEffect(() => {
        if (!documentId || activeDocumentIdRef.current === documentId) return

        handleBeforeDocumentSwitch(documentId, markdown)
        editorRef.current?.setMarkdown(markdown)
        handleDocumentSwitch(editorRef.current?.getMarkdown() ?? markdown)
    }, [documentId, handleBeforeDocumentSwitch, handleDocumentSwitch, markdown])

    useEffect(() => {
        const unregister = registerMarkdownEditorFlush(flush)

        return () => {
            unregister()
            flush()
        }
    }, [flush])

    useImperativeHandle(ref, () => ({
        flush,
        getMarkdown: () => latestMarkdownRef.current,
        setMarkdown: (nextMarkdown: string) => {
            editorRef.current?.setMarkdown(nextMarkdown)
            latestMarkdownRef.current = nextMarkdown
            lastEmittedMarkdownRef.current = nextMarkdown
        },
    }), [flush])

    const handleEditorChange = useCallback((nextMarkdown: string) => {
        if (latestMarkdownRef.current === nextMarkdown) return

        latestMarkdownRef.current = nextMarkdown
        const activeDocumentId = activeDocumentIdRef.current
        if (activeDocumentId) onDocumentEditRef.current?.(activeDocumentId, nextMarkdown)
    }, [])

    const defaultToolbarContents = useCallback(
        () => <MarkdownFormatToolbarControls overlayContainer={overlayContainer} placeholders={placeholders} />,
        [overlayContainer, placeholders],
    )
    const toolbarContents = customToolbarContents ?? defaultToolbarContents

    const markdownContentSx = buildMarkdownContentSx(markdownStyleConfig)
    const stickySx = stickyToolbar
        ? { '& .mdxeditor-toolbar': { position: 'sticky', top: 0, zIndex: 1 } }
        : undefined
    const editorSx = { ...markdownContentSx, ...stickySx }
    const plugins = [
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        linkPlugin(),
        linkDialogPlugin(),
        imagePlugin(),
        tablePlugin(),
        codeBlockPlugin({ defaultCodeBlockLanguage: DEFAULT_CODE_LANGUAGE }),
        codeMirrorPlugin({ codeBlockLanguages: CODE_BLOCK_LANGUAGES }),
        markdownShortcutPlugin(),
        toolbarPlugin({ toolbarContents }),
        markdownPlaceholderPlugin({ overlayContainer, placeholders }),
        ...(historyStore && documentId ? [markdownDocumentHistoryPlugin({
            documentId,
            historyStore,
            markdown,
            onBeforeSwitch: handleBeforeDocumentSwitch,
            onDidSwitch: handleDocumentSwitch,
        })] : []),
    ]

    return (
        <Box data-sticky-toolbar={stickyToolbar} sx={editorSx}>
            <MDXEditor
                className={mode === 'dark' ? 'dark-theme' : 'light-theme'}
                contentEditableClassName="mdxeditor-content"
                markdown={markdown}
                onChange={handleEditorChange}
                overlayContainer={overlayContainer}
                plugins={plugins}
                ref={editorRef}
                suppressSharedHistory={!!historyStore}
            />
        </Box>
    )
})
