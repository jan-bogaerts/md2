import { Box } from '@mui/material'
import {
    MDXEditor, codeBlockPlugin, codeMirrorPlugin,
    headingsPlugin, imagePlugin, linkDialogPlugin, linkPlugin, listsPlugin, markdownShortcutPlugin, quotePlugin,
    tablePlugin, thematicBreakPlugin, toolbarPlugin,
    type MDXEditorMethods,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react'
import { useAppTheme } from '../../theme/use_app_theme'
import { MarkdownFormatToolbarControls } from './markdown_format_toolbar_controls'
import { registerMarkdownEditorFlush } from './markdown_editor_flush'
import { buildMarkdownContentSx } from './markdown_style_sx'

const DEFAULT_CODE_LANGUAGE = ''
const CODE_BLOCK_LANGUAGES = { '': 'Plain text', js: 'JavaScript', ts: 'TypeScript', tsx: 'TSX', bash: 'Shell' }

export interface MarkdownEditorHandle {
    flush(): void
    getMarkdown(): string
    setMarkdown(markdown: string): void
}

interface MarkdownEditorProps {
    markdown: string
    onChange: (markdown: string) => void
    overlayContainer?: HTMLElement | null
    stickyToolbar?: boolean
    toolbarContents?: () => ReactNode
}

/**
 * Reusable MDXEditor surface for card bodies and files (F-007). The editor is
 * uncontrolled while typing: edits stay inside Lexical and `onChange` fires
 * only when the surface is flushed — on unmount (popup close, tab switch, a
 * different card/file assigned via `key`) or through `flushMarkdownEditors`
 * (window blur/hide/close, Electron quit). Persistence stays with the caller.
 * Callers pass a `key` (the card/file path) so switching targets remounts with
 * fresh content. On mobile the formatting toolbar stays sticky at the top of
 * the scroll area.
 */
export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(props, ref) {
    const {
        markdown, onChange, overlayContainer,
        stickyToolbar = false, toolbarContents = MarkdownFormatToolbarControls,
    } = props
    const { markdownStyleConfig, mode } = useAppTheme()
    const editorRef = useRef<MDXEditorMethods>(null)
    const latestMarkdownRef = useRef(markdown)
    const lastEmittedMarkdownRef = useRef(markdown)
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange

    const flush = useCallback(() => {
        if (latestMarkdownRef.current === lastEmittedMarkdownRef.current) return

        lastEmittedMarkdownRef.current = latestMarkdownRef.current
        onChangeRef.current(latestMarkdownRef.current)
    }, [])

    useEffect(() => {
        if (!editorRef.current) throw new Error('Cannot baseline markdown before the editor is mounted')

        const normalizedMarkdown = editorRef.current.getMarkdown()
        latestMarkdownRef.current = normalizedMarkdown
        lastEmittedMarkdownRef.current = normalizedMarkdown
    }, [])

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

    const handleEditorChange = (nextMarkdown: string) => {
        latestMarkdownRef.current = nextMarkdown
    }

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
            />
        </Box>
    )
})
