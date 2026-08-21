import { Box } from '@mui/material'
import {
    MDXEditor, codeBlockPlugin, codeMirrorPlugin, diffSourcePlugin,
    headingsPlugin, imagePlugin, linkDialogPlugin, linkPlugin, listsPlugin, markdownShortcutPlugin, quotePlugin,
    tablePlugin, thematicBreakPlugin, toolbarPlugin,
    type MDXEditorMethods, type ViewMode,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import {
    forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef,
    type DragEvent, type FocusEvent, type ReactNode,
} from 'react'
import type { ActionPlaceholder } from '../../data/action_placeholders'
import { useProjectState } from '../hooks/use_project_state'
import { dialogService } from '../../services/dialog_service'
import { useAppTheme } from '../../theme/use_app_theme'
import { markdownDocumentHistoryPlugin } from './markdown_document_history_realm_plugin'
import type { MarkdownDocumentHistoryStore } from './markdown_document_history_store'
import { MarkdownFormatToolbarControls } from './markdown_format_toolbar_controls'
import { markdownFileSearchPlugin } from './markdown_file_search_realm_plugin'
import { markdownLocalTextSearchPlugin } from './markdown_local_text_search_realm_plugin'
import { plainMarkdownPlugin } from './plain_markdown_realm_plugin'
import { markdownPlaceholderPlugin } from './markdown_placeholder_realm_plugin'
import { registerMarkdownEditorStage } from '../../services/project/markdown_editor_staging'
import { markdownPastePlugin } from './markdown_paste_realm_plugin'
import type { MarkdownImagePasteHandler } from './markdown_paste_cell'
import type {
    ActiveMarkdownDocumentChangedDetail,
    MarkdownBindingKind,
    MarkdownDataSource,
    MarkdownDocumentTarget,
} from './markdown_data_source'
import { MarkdownAttachmentControl } from './markdown_attachment_control'
import type { AttachmentMarkdownInserter } from '../../services/attachments/attachment_workflow'
import type { MarkdownDraft } from '../../services/markdown/markdown_draft'
import { useMarkdownDraft } from './use_markdown_draft'

const DEFAULT_CODE_LANGUAGE = ''
const CODE_BLOCK_LANGUAGES = { '': 'Plain text', js: 'JavaScript', ts: 'TypeScript', tsx: 'TSX', bash: 'Shell' }
const EMPTY_PLACEHOLDERS: readonly ActionPlaceholder[] = []
const EMPTY_REPOSITORY_FILES: readonly string[] = []

export interface MarkdownEditorHandle {
    flush(): boolean
    getMarkdown(): string
    setMarkdown(markdown: string): void
}

interface MarkdownEditorPresentationProps {
    attachmentHandler?: (files: File[], insertMarkdown: AttachmentMarkdownInserter) => Promise<void>
    diffMarkdown?: string
    flushOnBlur?: boolean
    /** Omit format toolbar entirely. */
    hideToolbar?: boolean
    /** Hide built-in attachment control while retaining attachment drops. */
    hideAttachmentControl?: boolean
    imagePasteHandler?: MarkdownImagePasteHandler
    /** Set false when containing surface owns Ctrl+F behavior. */
    localTextSearch?: boolean
    overlayContainer?: HTMLElement | null
    placeholders?: readonly ActionPlaceholder[]
    readOnly?: boolean
    toolbarContents?: () => ReactNode
    viewMode?: ViewMode
}

interface MarkdownEditorDataSourceProps extends MarkdownEditorPresentationProps {
    binding: MarkdownBindingKind
    dataSource: MarkdownDataSource
    draft?: never
    historyStore: MarkdownDocumentHistoryStore
    markdown?: never
    onChange?: never
    onDirtyChange?: never
    onLiveChange?: never
}

interface MarkdownEditorLocalProps extends MarkdownEditorPresentationProps {
    binding?: never
    dataSource?: never
    draft?: never
    historyStore?: never
    markdown: string
    onChange: (markdown: string) => void
    onDirtyChange?: (dirty: boolean) => void
    onLiveChange?: (markdown: string) => void
}

interface MarkdownEditorDraftProps extends MarkdownEditorPresentationProps {
    binding?: never
    dataSource?: never
    draft: MarkdownDraft
    historyStore?: never
    markdown?: never
    onChange?: (markdown: string) => void
    onDirtyChange?: (dirty: boolean) => void
    onLiveChange?: (markdown: string) => void
}

type MarkdownEditorProps = MarkdownEditorDataSourceProps | MarkdownEditorLocalProps | MarkdownEditorDraftProps

interface MarkdownDocumentSnapshot {
    target: MarkdownDocumentTarget | null
    markdown: string
}

interface MarkdownProcessingError {
    error: string
}

function initialDocument(props: MarkdownEditorProps): MarkdownDocumentSnapshot {
    if (props.draft) return { target: null, markdown: props.draft.getSnapshot() }
    if (!props.dataSource) return { target: null, markdown: props.markdown }

    const target = props.dataSource.getActiveTarget(props.binding)
    return { target, markdown: target ? props.dataSource.getMarkdown(target) : '' }
}

/** Reusable MDXEditor surface with local-buffer and persisted data-source modes. */
export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(props, ref) {
    const {
        flushOnBlur = false,
        attachmentHandler,
        diffMarkdown,
        hideAttachmentControl = false,
        hideToolbar = false,
        imagePasteHandler,
        localTextSearch = true,
        overlayContainer,
        placeholders = EMPTY_PLACEHOLDERS,
        readOnly = false,
        toolbarContents: customToolbarContents,
        viewMode,
    } = props
    const dataSource = props.dataSource
    const binding = props.binding
    const historyStore = props.historyStore
    const draft = props.draft
    const { snapshot } = useProjectState()
    const repositoryFiles = snapshot?.repositoryFiles ?? EMPTY_REPOSITORY_FILES
    const initialDocumentRef = useRef<MarkdownDocumentSnapshot | null>(null)
    if (!initialDocumentRef.current) initialDocumentRef.current = initialDocument(props)
    const initialDocumentSnapshot = initialDocumentRef.current
    const { markdownContentSx, mode } = useAppTheme()
    const editorRef = useRef<MDXEditorMethods>(null)
    const activeTargetRef = useRef(initialDocumentSnapshot.target)
    const latestMarkdownRef = useRef(initialDocumentSnapshot.markdown)
    const lastEmittedMarkdownRef = useRef(initialDocumentSnapshot.markdown)
    const dirtyBaselineEstablishedRef = useRef(false)
    const missingEditorReportedRef = useRef(false)
    const replacingMarkdownRef = useRef(false)
    const onChangeRef = useRef(props.onChange)
    const onDirtyChangeRef = useRef(props.onDirtyChange)
    const onLiveChangeRef = useRef(props.onLiveChange)
    const applyPendingDocumentChangeRef = useRef<() => void>(() => undefined)
    onChangeRef.current = props.onChange
    onDirtyChangeRef.current = props.onDirtyChange
    onLiveChangeRef.current = props.onLiveChange

    const setDirty = useCallback((dirty: boolean) => {
        onDirtyChangeRef.current?.(dirty)
    }, [])

    const flush = useCallback(() => {
        if (latestMarkdownRef.current === lastEmittedMarkdownRef.current) return true

        const activeTarget = activeTargetRef.current
        if (dataSource && binding) {
            if (!activeTarget) return false
            const committed = dataSource.commit(binding, activeTarget, latestMarkdownRef.current)
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
        activeTargetRef.current = detail.target
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
    const getTarget = useCallback(() => activeTargetRef.current, [])

    const replaceMarkdown = useCallback((markdown: string) => {
        replacingMarkdownRef.current = true
        editorRef.current?.setMarkdown(markdown)
        replacingMarkdownRef.current = false
    }, [])

    const replaceDraftMarkdown = useCallback((markdown: string) => {
        replaceMarkdown(markdown)
        latestMarkdownRef.current = markdown
        lastEmittedMarkdownRef.current = markdown
        setDirty(false)
    }, [replaceMarkdown, setDirty])

    const setPendingDocumentChangeRetry = useCallback((retry: () => void) => {
        applyPendingDocumentChangeRef.current = retry
    }, [])

    const historyPluginConfig = useMemo(() => historyStore && binding && dataSource
        ? {
            binding,
            completeDocumentSwitch,
            dataSource,
            getTarget,
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
        getTarget,
        getMarkdown,
        historyStore,
        prepareDocumentSwitch,
        replaceMarkdown,
        setPendingDocumentChangeRetry,
    ])

    useEffect(() => {
        if (!editorRef.current) {
            if (!missingEditorReportedRef.current) {
                missingEditorReportedRef.current = true
                dialogService.error(new Error('Cannot baseline markdown before editor is mounted'), {fallbackMessage: 'Markdown editor could not be initialized'})
            }
            return
        }

        const normalizedMarkdown = editorRef.current.getMarkdown()
        latestMarkdownRef.current = normalizedMarkdown
        lastEmittedMarkdownRef.current = normalizedMarkdown
        dirtyBaselineEstablishedRef.current = true
    }, [])

    useEffect(() => {
        const unregister = registerMarkdownEditorStage(flush)

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
        if (!dirtyBaselineEstablishedRef.current) return
        setDirty(markdown !== lastEmittedMarkdownRef.current)
        onLiveChangeRef.current?.(markdown)
        draft?.edit(markdown)
        const activeTarget = activeTargetRef.current
        if (dataSource && binding && activeTarget) dataSource.edit(binding, activeTarget, markdown)
    }, [binding, dataSource, draft, setDirty])

    const handleEditorError = useCallback(({ error }: MarkdownProcessingError) => {
        dialogService.error(new Error(error), { fallbackMessage: 'Markdown could not be parsed' })
    }, [])

    const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
        if (!flushOnBlur || event.currentTarget.contains(event.relatedTarget)) return
        flush()
    }

    const insertMarkdown = useCallback((markdown: string) => {
        const editor = editorRef.current
        if (!editor) throw new Error('Markdown editor is not mounted')

        editor.focus(() => editor.insertMarkdown(markdown), { defaultSelection: 'rootEnd' })
    }, [])

    const getSelectionMarkdown = useCallback(() => editorRef.current?.getSelectionMarkdown() ?? '', [])

    useMarkdownDraft(draft, insertMarkdown, replaceDraftMarkdown)

    const attachFiles = useCallback((files: File[]) => {
        if (!attachmentHandler || readOnly || files.length === 0) return
        void attachmentHandler(files, insertMarkdown).catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: 'Files could not be attached' })
        })
    }, [attachmentHandler, insertMarkdown, readOnly])

    const handleDragOverCapture = (event: DragEvent<HTMLDivElement>) => {
        if (!attachmentHandler || readOnly || !event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.stopPropagation()
    }

    const handleDropCapture = (event: DragEvent<HTMLDivElement>) => {
        if (!attachmentHandler || readOnly || !event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.stopPropagation()
        attachFiles([...event.dataTransfer.files])
    }

    const toolbarContents = useCallback(() => (
        <>
            {!hideToolbar ? (
                customToolbarContents?.()
                ?? (
                    <MarkdownFormatToolbarControls
                        overlayContainer={overlayContainer}
                        placeholders={placeholders}
                        readOnly={readOnly}
                    />
                )
            ) : null}
            {attachmentHandler && !hideAttachmentControl ? (
                <MarkdownAttachmentControl disabled={readOnly} onFiles={attachFiles} />
            ) : null}
        </>
    ), [
        attachFiles, attachmentHandler, customToolbarContents, hideAttachmentControl, hideToolbar, overlayContainer,
        placeholders, readOnly,
    ])
    const editorSx = {
        ...markdownContentSx,
        '& .mdxeditor-toolbar': { bgcolor: 'background.paper', position: 'sticky', top: 0, zIndex: 1 },
    }
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
        plainMarkdownPlugin(),
        ...(viewMode ? [diffSourcePlugin({ diffMarkdown: diffMarkdown ?? '', viewMode })] : []),
        ...(!hideToolbar || (attachmentHandler && !hideAttachmentControl) ? [toolbarPlugin({ toolbarContents })] : []),
        markdownPlaceholderPlugin({ overlayContainer, placeholders }),
        markdownFileSearchPlugin({ overlayContainer, repositoryFiles }),
        ...(localTextSearch ? [markdownLocalTextSearchPlugin({ overlayContainer })] : []),
        markdownPastePlugin({ getSelectionMarkdown, imagePasteHandler, insertMarkdown, readOnly }),
        ...(historyPlugin ? [historyPlugin] : []),
    ]

    return (
        <Box
            data-sticky-toolbar
            onBlur={handleBlur}
            onDragOverCapture={handleDragOverCapture}
            onDropCapture={handleDropCapture}
            sx={editorSx}
        >
            <MDXEditor
                className={mode === 'dark' ? 'dark-theme' : 'light-theme'}
                contentEditableClassName="mdxeditor-content"
                markdown={initialDocumentSnapshot.markdown}
                onChange={handleEditorChange}
                onError={handleEditorError}
                overlayContainer={overlayContainer}
                plugins={plugins}
                readOnly={readOnly}
                ref={editorRef}
                suppressHtmlProcessing
                suppressSharedHistory={!!historyStore}
            />
        </Box>
    )
})
