import { Box } from '@mui/material'
import {
    MDXEditor, codeBlockPlugin, codeMirrorPlugin, diffSourcePlugin,
    headingsPlugin, imagePlugin, linkDialogPlugin, linkPlugin, listsPlugin, markdownShortcutPlugin, quotePlugin,
    tablePlugin, thematicBreakPlugin, toolbarPlugin,
    type MDXEditorMethods, type ViewMode,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import type { LexicalEditor } from 'lexical'
import {
    forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef,
    type DragEvent, type FocusEvent, type ReactNode,
} from 'react'
import type { ActionPlaceholder } from '../../data/action_placeholders'
import { useProjectState } from '../hooks/use_project_state'
import { dialogService } from '../../services/dialog_service'
import { useAppTheme } from '../../theme/use_app_theme'
import { HorizontalScrollArea } from '../horizontal_scroll_area'
import { markdownDocumentHistoryPlugin } from './history/markdown_document_history_realm_plugin'
import type { MarkdownDocumentHistoryStore } from './history/markdown_document_history_store'
import { MarkdownFormatToolbarControls } from './toolbar/markdown_format_toolbar_controls'
import type { MarkdownToolbarContext } from './toolbar/markdown_toolbar_context'
import { markdownFileSearchPlugin } from './file_search/markdown_file_search_realm_plugin'
import { markdownLocalTextSearchPlugin } from './local_search/markdown_local_text_search_realm_plugin'
import { plainMarkdownPlugin } from './plain_markdown_realm_plugin'
import { markdownPlaceholderPlugin } from './placeholders/markdown_placeholder_realm_plugin'
import { markdownPlainTextPlugin } from './plain_text/markdown_plain_text_realm_plugin'
import { readPlainText, writePlainText } from './plain_text/markdown_plain_text'
import { registerMarkdownEditorStage } from '../../services/project/markdown_editor_staging'
import { markdownPastePlugin } from './paste/markdown_paste_realm_plugin'
import type { MarkdownImagePasteHandler } from './paste/markdown_paste_cell'
import type {
    ActiveMarkdownDocumentChangedDetail,
    MarkdownBindingKind,
    MarkdownDataSource,
    MarkdownDocumentTarget,
} from './data_sources/markdown_data_source'
import { MarkdownAttachmentControl } from './attachments/markdown_attachment_control'
import type { AttachmentMarkdownInserter } from '../../services/attachments/attachment_workflow'
import type { MarkdownDraftBinding } from '../../services/markdown/markdown_draft'
import { useMarkdownDraft } from './data_sources/use_markdown_draft'
import { markdownBreakPlugin } from './markdown_break_realm_plugin';
import { markdownReferencePlugin } from './references/markdown_reference_realm_plugin';
import { markdownSourcePlugin } from './source/markdown_source_realm_plugin';
import { MarkdownSourceModeControls } from './source/markdown_source_mode_controls';
import type { MarkdownSourceController } from './source/markdown_source_controller';

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
    monospace?: boolean
    overlayContainer?: HTMLElement | null
    /** Exchange literal text instead of Markdown source, for fields that are not Markdown. */
    plainText?: boolean
    placeholders?: readonly ActionPlaceholder[]
    readOnly?: boolean
    toolbarContents?: (toolbarContext: MarkdownToolbarContext) => ReactNode
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
    draft: MarkdownDraftBinding
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
        monospace = false,
        overlayContainer,
        placeholders = EMPTY_PLACEHOLDERS,
        plainText = false,
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
    const plainTextEditorRef = useRef<LexicalEditor | null>(null)
    const sourceControllerRef = useRef<MarkdownSourceController | null>(null);
    const activeDraftRef = useRef(draft)
    const activeTargetRef = useRef(initialDocumentSnapshot.target)
    const latestMarkdownRef = useRef(initialDocumentSnapshot.markdown)
    const serializedRichMarkdownRef = useRef<string | null>(null);
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

    const readEditorContent = useCallback(() => {
        if (!plainText) return editorRef.current?.getMarkdown()
        const plainTextEditor = plainTextEditorRef.current
        if (!plainTextEditor) return undefined

        return readPlainText(plainTextEditor)
    }, [plainText])

    const flush = useCallback(() => {
        const activeDraft = activeDraftRef.current
        if (activeDraft) {
            const editorMarkdown = readEditorContent()
            const unchangedRichText = !plainText && !sourceControllerRef.current?.sourceActive
                && editorMarkdown === serializedRichMarkdownRef.current;
            if (editorMarkdown !== undefined && editorMarkdown !== latestMarkdownRef.current && !unchangedRichText) {
                latestMarkdownRef.current = editorMarkdown
                activeDraft.edit(editorMarkdown)
            }
        }
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
    }, [binding, dataSource, plainText, readEditorContent, setDirty])

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

    const getTarget = useCallback(() => activeTargetRef.current, [])

    const replaceMarkdown = useCallback((markdown: string) => {
        replacingMarkdownRef.current = true
        const plainTextEditor = plainTextEditorRef.current
        if (plainText && plainTextEditor) writePlainText(plainTextEditor, markdown)
        else if (sourceControllerRef.current) sourceControllerRef.current.replaceMarkdown(markdown);
        else editorRef.current?.setMarkdown(markdown)
        replacingMarkdownRef.current = false
    }, [plainText])

    const replaceDraftMarkdown = useCallback((markdown: string) => {
        replaceMarkdown(markdown)
        latestMarkdownRef.current = markdown
        lastEmittedMarkdownRef.current = markdown
        setDirty(false)
    }, [replaceMarkdown, setDirty])

    const setPendingDocumentChangeRetry = useCallback((retry: () => void) => {
        applyPendingDocumentChangeRef.current = retry
    }, [])

    const bindDraft = useCallback((nextDraft: MarkdownDraftBinding | undefined) => {
        activeDraftRef.current = nextDraft
    }, [])

    const historyPluginConfig = useMemo(() => historyStore && binding && dataSource
        ? {
            binding,
            completeDocumentSwitch,
            dataSource,
            getTarget,
            historyStore,
            initialMarkdown: initialDocumentSnapshot.markdown,
            initialTarget: initialDocumentSnapshot.target,
            prepareDocumentSwitch,
            replaceMarkdown,
            setPendingDocumentChangeRetry,
        }
        : null, [
        binding,
        completeDocumentSwitch,
        dataSource,
        getTarget,
        historyStore,
        initialDocumentSnapshot.markdown,
        initialDocumentSnapshot.target,
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

        const initialText = plainText ? readEditorContent() : undefined;
        if (initialText !== undefined) {
            latestMarkdownRef.current = initialText;
            lastEmittedMarkdownRef.current = initialText;
        }
        dirtyBaselineEstablishedRef.current = true
    }, [plainText, readEditorContent])

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

    const handleEditorChange = useCallback((serializedMarkdown: string, initialNormalization = false) => {
        if (!plainText) {
            if (initialNormalization) {
                serializedRichMarkdownRef.current = serializedMarkdown;
                return;
            }
            if (sourceControllerRef.current?.transitioning) return;
            if (!sourceControllerRef.current?.sourceActive) {
                if (serializedMarkdown === serializedRichMarkdownRef.current) return;
                serializedRichMarkdownRef.current = serializedMarkdown;
            }
        }
        const markdown = plainText ? readEditorContent() ?? serializedMarkdown : serializedMarkdown
        if (replacingMarkdownRef.current || latestMarkdownRef.current === markdown) return

        latestMarkdownRef.current = markdown
        if (!dirtyBaselineEstablishedRef.current && plainText) return;
        setDirty(markdown !== lastEmittedMarkdownRef.current)
        onLiveChangeRef.current?.(markdown)
        activeDraftRef.current?.edit(markdown)
        const activeTarget = activeTargetRef.current
        if (dataSource && binding && activeTarget) dataSource.edit(binding, activeTarget, markdown)
    }, [binding, dataSource, plainText, readEditorContent, setDirty])

    const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
        if (!flushOnBlur || event.currentTarget.contains(event.relatedTarget)) return
        flush()
    }

    const insertMarkdown = useCallback((markdown: string) => {
        const sourceController = sourceControllerRef.current;
        if (sourceController?.sourceActive) return sourceController.insertMarkdown(markdown);
        sourceController?.validateRichInsertion(markdown);
        const editor = editorRef.current
        if (!editor) throw new Error('Markdown editor is not mounted')

        editor.focus(() => editor.insertMarkdown(markdown), { defaultSelection: 'rootEnd' })
    }, [])

    const handlePlainTextEditorReady = useCallback((plainTextEditor: LexicalEditor) => {
        plainTextEditorRef.current = plainTextEditor
    }, [])
    const plainTextConfig = useMemo(
        () => ({ initialText: initialDocumentSnapshot.markdown, onEditorReady: handlePlainTextEditorReady }),
        [handlePlainTextEditorReady, initialDocumentSnapshot.markdown],
    )
    const getMarkdown = useCallback(() => latestMarkdownRef.current, []);
    const handleSourceReady = useCallback((controller: MarkdownSourceController) => {
        sourceControllerRef.current = controller;
    }, []);
    const handleRichTextBaseline = useCallback((markdown: string) => {
        serializedRichMarkdownRef.current = markdown;
    }, []);
    const sourceConfig = useMemo(() => ({
        compact: hideToolbar,
        getMarkdown,
        getTarget,
        historyStore,
        imagePasteHandler,
        initialViewMode: viewMode === 'source' ? 'source' as const : 'rich-text' as const,
        onReady: handleSourceReady,
        onRichTextBaseline: handleRichTextBaseline,
    }), [getMarkdown, getTarget, handleRichTextBaseline, handleSourceReady, hideToolbar, historyStore, imagePasteHandler, viewMode]);

    const getSelectionMarkdown = useCallback(() => editorRef.current?.getSelectionMarkdown() ?? '', [])

    useMarkdownDraft(draft, insertMarkdown, replaceDraftMarkdown, flush, bindDraft)

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

    const onAttachFiles = attachmentHandler && !hideAttachmentControl ? attachFiles : undefined
    const toolbarContents = useCallback(() => (
        <HorizontalScrollArea>
            {!plainText && !hideToolbar && viewMode !== 'diff' ? <MarkdownSourceModeControls /> : null}
            {!hideToolbar ? (
                customToolbarContents?.({ onAttachFiles })
                ?? (
                    <MarkdownFormatToolbarControls
                        onAttachFiles={onAttachFiles}
                        overlayContainer={overlayContainer}
                        placeholders={placeholders}
                        readOnly={readOnly}
                    />
                )
            ) : null}
            {hideToolbar && onAttachFiles ? <MarkdownAttachmentControl disabled={readOnly} onFiles={onAttachFiles} /> : null}
        </HorizontalScrollArea>
    ), [customToolbarContents, hideToolbar, onAttachFiles, overlayContainer, placeholders, plainText, readOnly, viewMode])
    const editorSx = {
        ...markdownContentSx,
        ...(monospace ? {'& .mdxeditor-content, & .mdxeditor-content *': { fontFamily: 'monospace !important' }} : {}),
        '& .mdxeditor-toolbar': { bgcolor: 'background.paper', overflow: 'hidden', position: 'sticky', top: 0, zIndex: 1 },
        '& .mdxeditor-source-editor .cm-editor, & .mdxeditor-source-editor .cm-gutters': {bgcolor: 'background.paper', color: 'text.primary'},
        '& .mdxeditor-source-editor .cm-cursor, & .mdxeditor-source-editor .cm-dropCursor': {borderLeftColor: 'text.primary'},
        '& .mdxeditor-source-editor .cm-selectionBackground': {bgcolor: 'action.selected'},
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
        ...(plainText ? [markdownPlainTextPlugin(plainTextConfig)] : [markdownShortcutPlugin()]),
        plainMarkdownPlugin(),
        ...(!plainText ? [
            markdownBreakPlugin(),
            markdownReferencePlugin(),
            viewMode === 'diff' ? diffSourcePlugin({ diffMarkdown: diffMarkdown ?? '', viewMode }) : markdownSourcePlugin(sourceConfig),
        ] : []),
        ...(!hideToolbar || onAttachFiles ? [toolbarPlugin({ toolbarContents })] : []),
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
                markdown={plainText ? '' : initialDocumentSnapshot.markdown}
                onChange={handleEditorChange}
                overlayContainer={overlayContainer}
                plugins={plugins}
                readOnly={readOnly}
                ref={editorRef}
                suppressHtmlProcessing
                suppressSharedHistory={!!historyStore}
                trim={false}
            />
        </Box>
    )
})
