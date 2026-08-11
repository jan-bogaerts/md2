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
    type KeyboardEvent,
    type ReactNode,
    type SyntheticEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
    $createParagraphNode,
    $createRangeSelection,
    $createTextNode,
    $getRoot,
    $setSelection,
    COPY_COMMAND,
    KEY_DOWN_COMMAND,
    PASTE_COMMAND,
} from 'lexical'
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
    getSelectionMarkdown: () => string
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

function markdownToRenderedText(markdown: string) {
    return markdown
        .replace(/^```[^\n]*\n|\n```$/gm, '')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/^(#{1,6}|>|\s*(?:[-+*]|\d+\.))\s+/gm, '')
        .replace(/^(?:---|\*\*\*|___)$/gm, '')
        .replace(/(\*\*|__|~~|`|\*|_)/g, '')
}

function selectedMarkdown(markdown: string, start: number, end: number) {
    const selected = markdown.slice(start, end)
    if (!selected) return ''

    const before = markdown.slice(0, start)
    const after = markdown.slice(end)
    const boldOpen = before.lastIndexOf('**')
    const boldClose = after.indexOf('**')
    if (boldOpen >= 0 && boldClose >= 0 && before.slice(boldOpen + 2).indexOf('**') < 0) return `**${selected}**`

    const linkOpen = before.lastIndexOf('[')
    const linkClose = after.match(/^([^\]]*)\]\(([^)]*)\)/)
    if (linkOpen >= 0 && linkClose) return `[${selected}](${linkClose[2]})`

    return selected
}

function setTestLexicalSelection(text: string, start: number, end: number) {
    testLexicalEditor.update(() => {
        const root = $getRoot()
        root.clear()
        const textNode = $createTextNode(text)
        root.append($createParagraphNode().append(textNode))
        const selection = $createRangeSelection()
        selection.anchor.set(textNode.getKey(), start, 'text')
        selection.focus.set(textNode.getKey(), end, 'text')
        $setSelection(selection)
    }, { discrete: true })
}

function getTestLexicalText() {
    return testLexicalEditor.getEditorState().read(() => $getRoot().getTextContent())
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
        const selectionStartRef = useRef(0)
        const selectionEndRef = useRef(0)
        const [renderedMarkdown, setRenderedMarkdown] = useState(initialMarkdown)
        const [realm] = useState(() => {
            const editorRealm = new StubRealm()
            for (const plugin of plugins) plugin.definition?.init?.(editorRealm, plugin.params)
            for (const plugin of plugins) plugin.definition?.postInit?.(editorRealm, plugin.params)

            return editorRealm
        })

        useImperativeHandle(ref, () => ({
            getMarkdown: () => latestMarkdownRef.current,
            getSelectionMarkdown: () => selectedMarkdown(
                latestMarkdownRef.current,
                selectionStartRef.current,
                selectionEndRef.current,
            ),
            insertMarkdown: (markdownToInsert: string) => {
                const nextMarkdown = latestMarkdownRef.current.slice(0, selectionStartRef.current)
                    + markdownToInsert
                    + latestMarkdownRef.current.slice(selectionEndRef.current)
                latestMarkdownRef.current = nextMarkdown
                selectionStartRef.current += markdownToInsert.length
                selectionEndRef.current = selectionStartRef.current
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

        const updateSelection = (event: SyntheticEvent<HTMLTextAreaElement>) => {
            selectionStartRef.current = event.currentTarget.selectionStart
            selectionEndRef.current = event.currentTarget.selectionEnd
        }

        const handleCopy = (event: ClipboardEvent<HTMLTextAreaElement>) => {
            updateSelection(event)
            const selectionMarkdown = selectedMarkdown(
                latestMarkdownRef.current,
                selectionStartRef.current,
                selectionEndRef.current,
            )
            const renderedSelection = markdownToRenderedText(selectionMarkdown)
            setTestLexicalSelection(renderedSelection, 0, renderedSelection.length)
            testLexicalEditor.dispatchCommand(COPY_COMMAND, event.nativeEvent)
        }

        const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
            updateSelection(event)
            testLexicalEditor.dispatchCommand(KEY_DOWN_COMMAND, event.nativeEvent)
        }

        const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
            updateSelection(event)
            const currentMarkdown = latestMarkdownRef.current
            setTestLexicalSelection(currentMarkdown, selectionStartRef.current, selectionEndRef.current)
            testLexicalEditor.update(() => {
                testLexicalEditor.dispatchCommand(PASTE_COMMAND, event.nativeEvent)
            }, { discrete: true })
            const nextMarkdown = getTestLexicalText()
            if (nextMarkdown === currentMarkdown) return
            latestMarkdownRef.current = nextMarkdown
            setRenderedMarkdown(nextMarkdown)
            onChange?.(nextMarkdown)
        }

        const handleEmitError = () => {
            onError?.({ error: 'Invalid Markdown', source: renderedMarkdown })
        }

        return (
            <StubRealmContext.Provider value={realm}>
                <div className={className} data-testid="mdx-editor">
                    {toolbar?.toolbarContents ? <div data-testid="mdx-editor-toolbar">{toolbar.toolbarContents()}</div> : null}
                    {overlayContainer ? createPortal(<div data-testid="mdx-editor-overlay" />, overlayContainer) : null}
                    <textarea
                        onChange={handleChange}
                        onCopy={handleCopy}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        onSelect={updateSelection}
                        readOnly={readOnly}
                        role="textbox"
                        value={renderedMarkdown}
                    />
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
