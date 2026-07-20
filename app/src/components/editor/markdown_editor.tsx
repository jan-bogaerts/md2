import { Box } from '@mui/material'
import {
    MDXEditor, codeBlockPlugin, codeMirrorPlugin,
    headingsPlugin, imagePlugin, linkDialogPlugin, linkPlugin, listsPlugin, markdownShortcutPlugin, quotePlugin,
    tablePlugin, thematicBreakPlugin, toolbarPlugin,
    type MDXEditorMethods,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type FocusEvent, type ReactNode } from 'react'
import type { ActionPlaceholder } from '../../data/action_placeholders'
import { useAppTheme } from '../../theme/use_app_theme'
import { markdownDocumentHistoryPlugin } from './markdown_document_history_realm_plugin'
import type { MarkdownDocumentHistoryStore } from './markdown_document_history_store'
import type { MarkdownEditorStateStore } from './markdown_editor_state_store'
import { MarkdownFormatToolbarControls } from './markdown_format_toolbar_controls'
import { markdownPlaceholderPlugin } from './markdown_placeholder_realm_plugin'
import { registerMarkdownEditorFlush } from './markdown_editor_flush'
import type {
    ActiveMarkdownDocumentChangedDetail,
    MarkdownBindingKind,
    MarkdownDataSource,
    MarkdownReplacedDetail,
} from './markdown_data_source'
import { buildMarkdownContentSx } from './markdown_style_sx'

const DEFAULT_CODE_LANGUAGE = ''
const CODE_BLOCK_LANGUAGES = { '': 'Plain text', js: 'JavaScript', ts: 'TypeScript', tsx: 'TSX', bash: 'Shell' }
const EMPTY_PLACEHOLDERS: readonly ActionPlaceholder[] = []

export interface MarkdownEditorHandle {
    flush(): void
    getMarkdown(): string
    setMarkdown(markdown: string): void
}

interface MarkdownEditorPresentationProps {
    flushOnBlur?: boolean
    /** Omit format toolbar entirely. */
    hideToolbar?: boolean
    overlayContainer?: HTMLElement | null
    placeholders?: readonly ActionPlaceholder[]
    readOnly?: boolean
    stickyToolbar?: boolean
    toolbarContents?: () => ReactNode
}

interface MarkdownEditorDataSourceProps extends MarkdownEditorPresentationProps {
    binding: MarkdownBindingKind
    dataSource: MarkdownDataSource
    historyStore: MarkdownDocumentHistoryStore
    markdown?: never
    onChange?: never
    onDirtyChange?: never
    onLiveChange?: never
    stateStore: MarkdownEditorStateStore
}

interface MarkdownEditorLocalProps extends MarkdownEditorPresentationProps {
    binding?: never
    dataSource?: never
    historyStore?: never
    markdown: string
    onChange: (markdown: string) => void
    onDirtyChange?: (dirty: boolean) => void
    onLiveChange?: (markdown: string) => void
    stateStore?: never
}

type MarkdownEditorProps = MarkdownEditorDataSourceProps | MarkdownEditorLocalProps

interface ActiveDocument {
    documentId: string | null
    markdown: string
}

function initialDocument(props: MarkdownEditorProps): ActiveDocument {
    if (!props.dataSource) return { documentId: null, markdown: props.markdown }

    const documentId = props.dataSource.getActiveDocumentId(props.binding)
    return { documentId, markdown: documentId ? props.dataSource.getMarkdown(documentId) : '' }
}

/** Reusable MDXEditor surface with local-buffer and persisted data-source modes. */
export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(props, ref) {
    const {
        flushOnBlur = false,
        hideToolbar = false,
        overlayContainer,
        placeholders = EMPTY_PLACEHOLDERS,
        readOnly = false,
        stickyToolbar = false,
        toolbarContents: customToolbarContents,
    } = props
    const dataSource = props.dataSource
    const binding = props.binding
    const historyStore = props.historyStore
    const stateStore = props.stateStore
    const [activeDocument, setActiveDocument] = useState(() => initialDocument(props))
    const { markdownStyleConfig, mode } = useAppTheme()
    const editorRef = useRef<MDXEditorMethods>(null)
    const activeDocumentIdRef = useRef(activeDocument.documentId)
    const latestMarkdownRef = useRef(activeDocument.markdown)
    const lastEmittedMarkdownRef = useRef(activeDocument.markdown)
    const dirtyBaselineEstablishedRef = useRef(false)
    const replacingMarkdownRef = useRef(false)
    const onChangeRef = useRef(props.onChange)
    const onDirtyChangeRef = useRef(props.onDirtyChange)
    const onLiveChangeRef = useRef(props.onLiveChange)
    onChangeRef.current = props.onChange
    onDirtyChangeRef.current = props.onDirtyChange
    onLiveChangeRef.current = props.onLiveChange

    const setDirty = useCallback((dirty: boolean) => {
        stateStore?.setDirty(dirty)
        onDirtyChangeRef.current?.(dirty)
    }, [stateStore])

    const flush = useCallback(() => {
        if (latestMarkdownRef.current === lastEmittedMarkdownRef.current) return

        const activeDocumentId = activeDocumentIdRef.current
        if (dataSource && binding) {
            if (!activeDocumentId) return
            const committed = dataSource.commit(binding, activeDocumentId, latestMarkdownRef.current)
            if (!committed) return
        } else {
            onChangeRef.current?.(latestMarkdownRef.current)
        }
        lastEmittedMarkdownRef.current = latestMarkdownRef.current
        setDirty(false)
    }, [binding, dataSource, setDirty])

    const handleBeforeDocumentSwitch = useCallback((nextDocumentId: string | null, nextMarkdown: string) => {
        const currentMarkdown = latestMarkdownRef.current
        flush()
        activeDocumentIdRef.current = nextDocumentId
        latestMarkdownRef.current = nextMarkdown
        lastEmittedMarkdownRef.current = nextMarkdown
        setDirty(false)

        return currentMarkdown
    }, [flush, setDirty])

    const handleDocumentSwitch = useCallback((normalizedMarkdown: string) => {
        latestMarkdownRef.current = normalizedMarkdown
        lastEmittedMarkdownRef.current = normalizedMarkdown
    }, [])

    useEffect(() => {
        if (!editorRef.current) throw new Error('Cannot baseline markdown before editor is mounted')

        const normalizedMarkdown = editorRef.current.getMarkdown()
        latestMarkdownRef.current = normalizedMarkdown
        lastEmittedMarkdownRef.current = normalizedMarkdown
        dirtyBaselineEstablishedRef.current = true
    }, [])

    useEffect(() => {
        if (!dataSource || !binding || !historyStore) return undefined

        const handleActiveDocumentChanged = (event: Event) => {
            const detail = (event as CustomEvent<ActiveMarkdownDocumentChangedDetail>).detail
            if (detail.binding !== binding) return

            const markdown = detail.documentId ? dataSource.getMarkdown(detail.documentId) : ''
            const currentMarkdown = handleBeforeDocumentSwitch(detail.documentId, markdown)
            const replaceMarkdown = (nextMarkdown: string) => {
                replacingMarkdownRef.current = true
                editorRef.current?.setMarkdown(nextMarkdown)
                replacingMarkdownRef.current = false
            }
            if (historyStore.hasAttachedEditor) historyStore.switchDocument(detail.documentId, markdown, currentMarkdown, replaceMarkdown)
            else replaceMarkdown(markdown)
            const normalizedMarkdown = editorRef.current?.getMarkdown() ?? markdown
            handleDocumentSwitch(normalizedMarkdown)
            setActiveDocument({ documentId: detail.documentId, markdown: normalizedMarkdown })
        }
        const handleMarkdownReplaced = (event: Event) => {
            const detail = (event as CustomEvent<MarkdownReplacedDetail>).detail
            if (detail.documentId !== activeDocumentIdRef.current) return
            if (detail.originBinding === binding) {
                setActiveDocument({ documentId: detail.documentId, markdown: latestMarkdownRef.current })
                return
            }

            const markdown = dataSource.getMarkdown(detail.documentId)
            replacingMarkdownRef.current = true
            editorRef.current?.setMarkdown(markdown)
            replacingMarkdownRef.current = false
            const normalizedMarkdown = editorRef.current?.getMarkdown() ?? markdown
            latestMarkdownRef.current = normalizedMarkdown
            lastEmittedMarkdownRef.current = normalizedMarkdown
            historyStore.replaceDocument(detail.documentId, normalizedMarkdown)
            setActiveDocument({ documentId: detail.documentId, markdown: normalizedMarkdown })
            setDirty(false)
        }
        dataSource.addEventListener('activeDocumentChanged', handleActiveDocumentChanged)
        dataSource.addEventListener('markdownReplaced', handleMarkdownReplaced)
        const currentDocumentId = dataSource.getActiveDocumentId(binding)
        if (currentDocumentId !== activeDocumentIdRef.current) {
            const detail: ActiveMarkdownDocumentChangedDetail = { binding, documentId: currentDocumentId }
            handleActiveDocumentChanged(new CustomEvent('activeDocumentChanged', { detail }))
        }

        return () => {
            dataSource.removeEventListener('activeDocumentChanged', handleActiveDocumentChanged)
            dataSource.removeEventListener('markdownReplaced', handleMarkdownReplaced)
        }
    }, [binding, dataSource, handleBeforeDocumentSwitch, handleDocumentSwitch, historyStore, setDirty])

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
        setMarkdown: (markdown: string) => {
            replacingMarkdownRef.current = true
            editorRef.current?.setMarkdown(markdown)
            replacingMarkdownRef.current = false
            latestMarkdownRef.current = markdown
            lastEmittedMarkdownRef.current = markdown
            setDirty(false)
        },
    }), [flush, setDirty])

    const handleEditorChange = useCallback((markdown: string) => {
        if (replacingMarkdownRef.current || latestMarkdownRef.current === markdown) return

        latestMarkdownRef.current = markdown
        if (dirtyBaselineEstablishedRef.current) setDirty(markdown !== lastEmittedMarkdownRef.current)
        onLiveChangeRef.current?.(markdown)
        const activeDocumentId = activeDocumentIdRef.current
        if (dataSource && binding && activeDocumentId) dataSource.edit(binding, activeDocumentId, markdown)
    }, [binding, dataSource, setDirty])

    const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
        if (!flushOnBlur || event.currentTarget.contains(event.relatedTarget)) return
        flush()
    }

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
        ...(hideToolbar ? [] : [toolbarPlugin({ toolbarContents })]),
        markdownPlaceholderPlugin({ overlayContainer, placeholders }),
        ...(historyStore ? [markdownDocumentHistoryPlugin({
            documentId: activeDocument.documentId,
            historyStore,
            markdown: activeDocument.markdown,
            onBeforeSwitch: handleBeforeDocumentSwitch,
            onDidSwitch: handleDocumentSwitch,
        })] : []),
    ]

    return (
        <Box data-sticky-toolbar={stickyToolbar} onBlur={handleBlur} sx={editorSx}>
            <MDXEditor
                className={mode === 'dark' ? 'dark-theme' : 'light-theme'}
                contentEditableClassName="mdxeditor-content"
                markdown={activeDocument.markdown}
                onChange={handleEditorChange}
                overlayContainer={overlayContainer}
                plugins={plugins}
                readOnly={readOnly || !activeDocument.documentId && !!dataSource}
                ref={editorRef}
                suppressSharedHistory={!!historyStore}
            />
        </Box>
    )
})
