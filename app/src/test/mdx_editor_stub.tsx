/* eslint-disable react-refresh/only-export-components -- test-only module, fast refresh does not apply */
import {
    createContext,
    forwardRef,
    useContext,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
    type ChangeEvent,
    type ClipboardEvent,
    type ComponentType,
    type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { PASTE_COMMAND } from 'lexical'
import { testLexicalEditor } from './lexical_composer_context_stub'

/**
 * Lightweight stand-in for `@mdxeditor/editor` used in jsdom tests. The real
 * editor is Lexical/`contenteditable`-based and does not render meaningfully
 * without a browser, so component tests exercise our wiring against a plain
 * textarea that mirrors MDXEditor's `markdown`/`onChange` contract.
 */

interface StubEditorProps {
    className?: string
    contentEditableClassName?: string
    markdown: string
    onChange?: (markdown: string) => void
    onError?: (payload: { error: string; source: string }) => void
    overlayContainer?: HTMLElement | null
    plugins?: StubPlugin[]
    readOnly?: boolean
    suppressHtmlProcessing?: boolean
}

interface StubEditorHandle {
    getMarkdown: () => string
    insertMarkdown: (markdown: string) => void
    setMarkdown: (markdown: string) => void
}

interface StubPlugin {
    definition?: StubRealmPluginDefinition<unknown>
    params?: unknown
    toolbarContents?: () => ReactNode
}

interface StubRealmPluginDefinition<T> {
    init?: (realm: StubRealm, params?: T) => void
    postInit?: (realm: StubRealm, params?: T) => void
    update?: (realm: StubRealm, params?: T) => void
}

interface StubCell<T> {
    initialValue: T
}

export const Cell = <T,>(initialValue: T): StubCell<T> => ({ initialValue })
export const activeEditor$ = Cell(null)
export const addComposerChild$ = Cell<ComponentType | null>(null)
export const addImportVisitor$ = Cell(null)
export const markdown$ = Cell('')
export const rootEditor$ = Cell(null)
export const setMarkdown$ = Cell(null)

class StubRealm {
    readonly composerChildren: ComponentType[] = []
    private readonly values = new Map<StubCell<unknown>, unknown>()

    constructor() {
        this.values.set(rootEditor$, testLexicalEditor)
    }

    getValue<T>(cell: StubCell<T>) {
        return (this.values.has(cell) ? this.values.get(cell) : cell.initialValue) as T
    }

    pub<T>(cell: StubCell<T>, value: T) {
        if (cell === addComposerChild$) {
            const ComposerChild = value as ComponentType
            const supportedComposerChildren = ['MarkdownDocumentHistoryPlugin', 'MarkdownPastePlugin']
            if (supportedComposerChildren.includes(ComposerChild.name)) this.composerChildren.push(ComposerChild)
            return
        }
        this.values.set(cell, value)
    }

    register<T>(cell: StubCell<T>) {
        if (!this.values.has(cell)) this.values.set(cell, cell.initialValue)
    }
}

const StubRealmContext = createContext<StubRealm | null>(null)

export const useCellValue = <T,>(cell: StubCell<T>) => {
    const realm = useContext(StubRealmContext)

    return realm?.getValue(cell) ?? cell.initialValue
}
export const realmPlugin = <T,>(definition: StubRealmPluginDefinition<T>) => {
    const unknownDefinition = definition as StubRealmPluginDefinition<unknown>

    return (params?: T) => ({ definition: unknownDefinition, params })
}

function normalizeMarkdown(markdown: string) {
    return markdown.trimEnd()
}

export const MDXEditor = forwardRef<StubEditorHandle, StubEditorProps>(
    function MDXEditorStub(props, ref) {
        const {
            className,
            markdown,
            onChange,
            onError,
            overlayContainer,
            plugins = [],
            readOnly,
            suppressHtmlProcessing,
        } = props
        const toolbar = plugins.find(({ toolbarContents }) => !!toolbarContents)
        const initialMarkdown = normalizeMarkdown(markdown)
        const latestMarkdownRef = useRef(initialMarkdown)
        const [renderedMarkdown, setRenderedMarkdown] = useState(initialMarkdown)
        const [realm] = useState(() => {
            const editorRealm = new StubRealm()
            for (const plugin of plugins) plugin.definition?.init?.(editorRealm, plugin.params)
            for (const plugin of plugins) plugin.definition?.postInit?.(editorRealm, plugin.params)

            return editorRealm
        })

        useImperativeHandle(ref, () => ({
            getMarkdown: () => latestMarkdownRef.current,
            insertMarkdown: (markdownToInsert: string) => {
                const nextMarkdown = `${latestMarkdownRef.current}${markdownToInsert}`
                latestMarkdownRef.current = nextMarkdown
                setRenderedMarkdown(nextMarkdown)
                onChange?.(nextMarkdown)
            },
            setMarkdown: (nextMarkdown: string) => {
                latestMarkdownRef.current = nextMarkdown
                setRenderedMarkdown(nextMarkdown)
            },
        }), [onChange])

        useEffect(() => {
            for (const plugin of plugins) plugin.definition?.update?.(realm, plugin.params)
        })

        useEffect(() => {
            onChange?.(latestMarkdownRef.current)
        }, [onChange])

        const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
            latestMarkdownRef.current = event.target.value
            setRenderedMarkdown(event.target.value)
            onChange?.(event.target.value)
        }

        const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
            testLexicalEditor.dispatchCommand(PASTE_COMMAND, event.nativeEvent)
        }

        const handleEmitError = () => {
            onError?.({ error: 'Invalid Markdown', source: renderedMarkdown })
        }

        return (
            <StubRealmContext.Provider value={realm}>
                <div className={className} data-testid="mdx-editor">
                    {toolbar?.toolbarContents ? <div data-testid="mdx-editor-toolbar">{toolbar.toolbarContents()}</div> : null}
                    {overlayContainer ? createPortal(<div data-testid="mdx-editor-overlay" />, overlayContainer) : null}
                    <textarea onChange={handleChange} onPaste={handlePaste} readOnly={readOnly} role="textbox" value={renderedMarkdown} />
                    <button
                        data-testid="emit-markdown-error"
                        hidden
                        onClick={handleEmitError}
                        type="button"
                    />
                    <span data-html-processing-suppressed={suppressHtmlProcessing} hidden />
                    {realm.composerChildren.map((ComposerChild) => <ComposerChild key={ComposerChild.name} />)}
                </div>
            </StubRealmContext.Provider>
        )
    },
)

/** Plugin factories are no-ops; the stub ignores the returned descriptors. */
const noopPlugin = () => ({})

export const headingsPlugin = noopPlugin
export const listsPlugin = noopPlugin
export const quotePlugin = noopPlugin
export const thematicBreakPlugin = noopPlugin
export const markdownShortcutPlugin = noopPlugin
export const linkPlugin = noopPlugin
export const linkDialogPlugin = noopPlugin
export const imagePlugin = noopPlugin
export const tablePlugin = noopPlugin
export const codeBlockPlugin = noopPlugin
export const codeMirrorPlugin = noopPlugin
export const toolbarPlugin = (plugin: StubPlugin) => plugin

/** Toolbar controls render nothing in the stub. */
const NoopControl = () => null

export const UndoRedo = NoopControl
export const BoldItalicUnderlineToggles = NoopControl
export const ListsToggle = NoopControl
export const BlockTypeSelect = () => <span data-testid="block-type-select" />
export const CreateLink = NoopControl
export const InsertImage = NoopControl
export const InsertTable = NoopControl
export const InsertThematicBreak = NoopControl
export const InsertCodeBlock = () => <span data-testid="insert-code-block" />
export const Separator = NoopControl
