import { Box } from '@mui/material'
import {
    MDXEditor, codeBlockPlugin, codeMirrorPlugin, diffSourcePlugin,
    headingsPlugin, imagePlugin, linkDialogPlugin, linkPlugin, listsPlugin, markdownShortcutPlugin, quotePlugin,
    tablePlugin, thematicBreakPlugin, toolbarPlugin,
    type MDXEditorMethods, type ViewMode,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, type FocusEvent, type ReactNode } from 'react'
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
} from './markdown_data_source'
import { buildMarkdownContentSx } from './markdown_style_sx'

const DEFAULT_CODE_LANGUAGE = ''
const CODE_BLOCK_LANGUAGES = { '': 'Plain text', js: 'JavaScript', ts: 'TypeScript', tsx: 'TSX', bash: 'Shell' }
const EMPTY_PLACEHOLDERS: readonly ActionPlaceholder[] = []

export interface MarkdownEditorHandle {
    flush(): boolean
    getMarkdown(): string
    setMarkdown(markdown: string): void
}

interface MarkdownEditorPresentationProps {
    diffMarkdown?: string
    flushOnBlur?: boolean
    /** Omit format toolbar entirely. */
    hideToolbar?: boolean
    overlayContainer?: HTMLElement | null
    placeholders?: readonly ActionPlaceholder[]
    readOnly?: boolean
    stickyToolbar?: boolean
    toolbarContents?: () => ReactNode
    viewMode?: ViewMode
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

interface MarkdownDocumentSnapshot {
    documentId: string | null
    markdown: string
}

function initialDocument(props: MarkdownEditorProps): MarkdownDocumentSnapshot {
    if (!props.dataSource) return { documentId: null, markdown: props.markdown }

    const documentId = props.dataSource.getActiveDocumentId(props.binding)
    return { documentId, markdown: documentId ? props.dataSource.getMarkdown(documentId) : '' }
}

/** Reusable MDXEditor surface with local-buffer and persisted data-source modes. */
export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(props, ref) {
    const {
        flushOnBlur = false,
        diffMarkdown,
        hideToolbar = false,
        overlayContainer,
        placeholders = EMPTY_PLACEHOLDERS,
        readOnly = false,
        stickyToolbar = false,
        toolbarContents: customToolbarContents,
        viewMode,
    } = props
    const dataSource = props.dataSource
    const binding = props.binding
    const historyStore = props.historyStore
    const stateStore = props.stateStore
    const initialDocumentRef = useRef<MarkdownDocumentSnapshot | null>(null)
    if (!initialDocumentRef.current) initialDocumentRef.current = initialDocument(props)
    const initialDocumentSnapshot = initialDocumentRef.current
    const { markdownStyleConfig, mode } = useAppTheme()
    const editorRef = useRef<MDXEditorMethods>(null)
    const activeDocumentIdRef = useRef(initialDocumentSnapshot.documentId)
    const latestMarkdownRef = useRef(initialDocumentSnapshot.markdown)
    const lastEmittedMarkdownRef = useRef(initialDocumentSnapshot.markdown)
    const dirtyBaselineEstablishedRef = useRef(false)
    const replacingMarkdownRef = useRef(false)
    const onChangeRef = useRef(props.onChange)
    const onDirtyChangeRef = useRef(props.onDirtyChange)
    const onLiveChangeRef = useRef(props.onLiveChange)
    const applyPendingDocumentChangeRef = useRef<() => void>(() => undefined)
    onChangeRef.current = props.onChange
    onDirtyChangeRef.current = props.onDirtyChange
    onLiveChangeRef.current = props.onLiveChange

    const setDirty = useCallback((dirty: boolean) => {
        stateStore?.setDirty(dirty)
        onDirtyChangeRef.current?.(dirty)
    }, [stateStore])

    const flush = useCallback(() => {
        if (latestMarkdownRef.current === lastEmittedMarkdownRef.current) return true

        const activeDocumentId = activeDocumentIdRef.current
        if (dataSource && binding) {
            if (!activeDocumentId) return true
            const committed = dataSource.commit(binding, activeDocumentId, latestMarkdownRef.current)
            if (!committed) return false
        } else {
            onChangeRef.current?.(latestMarkdownRef.current)
        }
        lastEmittedMarkdownRef.current = latestMarkdownRef.current
        setDirty(false)
        queueMicrotask(() => applyPendingDocumentChangeRef.current())

        return true
    }, [binding, dataSource, setDirty])

    const prepareDocumentSwitch = useCallback((detail: ActiveMarkdownDocumentChangedDetail, nextMarkdown: string) => {
        if (detail.discard) lastEmittedMarkdownRef.current = latestMarkdownRef.current
        if (!flush()) return null

        const currentMarkdown = latestMarkdownRef.current
        activeDocumentIdRef.current = detail.documentId
        latestMarkdownRef.current = nextMarkdown
        lastEmittedMarkdownRef.current = nextMarkdown
        setDirty(false)

        return currentMarkdown
    }, [flush, setDirty])

    const completeDocumentSwitch = useCallback((normalizedMarkdown: string) => {
        latestMarkdownRef.current = normalizedMarkdown
        lastEmittedMarkdownRef.current = normalizedMarkdown
        setDirty(false)
    }, [setDirty])

    const getMarkdown = useCallback(() => editorRef.current?.getMarkdown() ?? latestMarkdownRef.current, [])
    const getDocumentId = useCallback(() => activeDocumentIdRef.current, [])

    const replaceMarkdown = useCallback((markdown: string) => {
        replacingMarkdownRef.current = true
        editorRef.current?.setMarkdown(markdown)
        replacingMarkdownRef.current = false
    }, [])

    const setPendingDocumentChangeRetry = useCallback((retry: () => void) => {
        applyPendingDocumentChangeRef.current = retry
    }, [])

    const historyPluginConfig = useMemo(() => historyStore && binding && dataSource
        ? {
            binding,
            completeDocumentSwitch,
            dataSource,
            getDocumentId,
            getMarkdown,
            historyStore,
            prepareDocumentSwitch,
            replaceMarkdown,
            setPendingDocumentChangeRetry,
        }
        : null, [
        binding,
        completeDocumentSwitch,
        dataSource,
        getDocumentId,
        getMarkdown,
        historyStore,
        prepareDocumentSwitch,
        replaceMarkdown,
        setPendingDocumentChangeRetry,
    ])

    useEffect(() => {
        if (!editorRef.current) throw new Error('Cannot baseline markdown before editor is mounted')

        const normalizedMarkdown = editorRef.current.getMarkdown()
        latestMarkdownRef.current = normalizedMarkdown
        lastEmittedMarkdownRef.current = normalizedMarkdown
        dirtyBaselineEstablishedRef.current = true
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
        setMarkdown: (markdown: string) => {
            replaceMarkdown(markdown)
            latestMarkdownRef.current = markdown
            lastEmittedMarkdownRef.current = markdown
            setDirty(false)
        },
    }), [flush, replaceMarkdown, setDirty])

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
    const historyPlugin = historyPluginConfig ? markdownDocumentHistoryPlugin(historyPluginConfig) : null
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
        ...(viewMode ? [diffSourcePlugin({ diffMarkdown: diffMarkdown ?? '', viewMode })] : []),
        ...(hideToolbar ? [] : [toolbarPlugin({ toolbarContents })]),
        markdownPlaceholderPlugin({ overlayContainer, placeholders }),
        ...(historyPlugin ? [historyPlugin] : []),
    ]

    return (
        <Box data-sticky-toolbar={stickyToolbar} onBlur={handleBlur} sx={editorSx}>
            <MDXEditor
                className={mode === 'dark' ? 'dark-theme' : 'light-theme'}
                contentEditableClassName="mdxeditor-content"
                markdown={initialDocumentSnapshot.markdown}
                onChange={handleEditorChange}
                overlayContainer={overlayContainer}
                plugins={plugins}
                readOnly={readOnly}
                ref={editorRef}
                suppressSharedHistory={!!historyStore}
            />
        </Box>
    )
})
