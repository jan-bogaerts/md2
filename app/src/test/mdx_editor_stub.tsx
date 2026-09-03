/* eslint-disable react-refresh/only-export-components -- test-only module, fast refresh does not apply */
import {
    createContext,
    forwardRef,
    useCallback,
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
    $getSelection,
    $isRangeSelection,
    $setSelection,
    COPY_COMMAND,
    KEY_DOWN_COMMAND,
    PASTE_COMMAND,
} from 'lexical'
import { testLexicalEditor } from './lexical_composer_context_stub'

const PLAIN_TEXT_COMPOSER_CHILD = 'MarkdownPlainTextPlugin'

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
    focus: (callbackFn?: () => void, opts?: { defaultSelection?: 'rootStart' | 'rootEnd'; preventScroll?: boolean }) => void
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
        this.values.set(activeEditor$, testLexicalEditor)
        this.values.set(rootEditor$, testLexicalEditor)
    }

    getValue<T>(cell: StubCell<T>) {
        return (this.values.has(cell) ? this.values.get(cell) : cell.initialValue) as T
    }

    pub<T>(cell: StubCell<T>, value: T) {
        if (cell === addComposerChild$) {
            const ComposerChild = value as ComponentType
            const supportedComposerChildren = [
                'MarkdownDocumentHistoryPlugin',
                'MarkdownLocalTextSearchPlugin',
                'MarkdownPastePlugin',
                PLAIN_TEXT_COMPOSER_CHILD,
            ]
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

function setTestLexicalSelection(text: string, start: number, end: number) {
    testLexicalEditor.update(() => {
        const root = $getRoot()
        const existingTextNodes = root.getAllTextNodes()
        const textNode = root.getTextContent() === text && existingTextNodes.length === 1
            ? existingTextNodes[0]
            : $createTextNode(text)
        if (textNode !== existingTextNodes[0]) {
            root.clear()
            root.append($createParagraphNode().append(textNode))
        }
        const selection = $createRangeSelection()
        selection.anchor.set(textNode.getKey(), start, 'text')
        selection.focus.set(textNode.getKey(), end, 'text')
        $setSelection(selection)
    }, { discrete: true })
}

function setTestLexicalMarkdownSelection(markdown: string, start: number, end: number) {
    const renderedText = markdownToRenderedText(markdown)
    const renderedStart = markdownToRenderedText(markdown.slice(0, start)).length
    const renderedEnd = markdownToRenderedText(markdown.slice(0, end)).length
    setTestLexicalSelection(renderedText, renderedStart, renderedEnd)
}

/**
 * Mimics the escaping `mdast-util-to-markdown` applies when MDXEditor re-serializes its node tree,
 * so plain-text mode can be told apart from Markdown mode in tests.
 */
function escapeStubMarkdown(text: string) {
    return text
        .replace(/[_*[\]`#~]/g, (character) => `\\${character}`)
        .replace(/^- /gm, '* ')
}

function setTestLexicalText(text: string) {
    testLexicalEditor.update(() => {
        const root = $getRoot()
        root.clear()
        root.append($createParagraphNode().append($createTextNode(text)))
    }, { discrete: true })
}

function getTestLexicalText() {
    return testLexicalEditor.getEditorState().read(() => $getRoot().getTextContent())
}

/**
 * In plain-text mode the visible text lives in the Lexical tree and `onChange` carries the escaped
 * Markdown serialization, mirroring how the real editor separates the two.
 */
function emitStubChange(plainTextMode: boolean, onChange: ((markdown: string) => void) | undefined, text: string) {
    if (!plainTextMode) {
        onChange?.(text)
        return
    }

    setTestLexicalText(text)
    onChange?.(escapeStubMarkdown(text))
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
        const hasSelectionRef = useRef(false)
        const selectionStartRef = useRef(0)
        const selectionEndRef = useRef(0)
        const suppressSelectionMirrorRef = useRef(false)
        const textareaRef = useRef<HTMLTextAreaElement | null>(null)
        const [renderedMarkdown, setRenderedMarkdown] = useState(initialMarkdown)
        const [realm] = useState(() => {
            const editorRealm = new StubRealm()
            for (const plugin of plugins) plugin.definition?.init?.(editorRealm, plugin.params)
            for (const plugin of plugins) plugin.definition?.postInit?.(editorRealm, plugin.params)

            return editorRealm
        })
        const plainTextMode = realm.composerChildren.some(({ name }) => name === PLAIN_TEXT_COMPOSER_CHILD)

        useImperativeHandle(ref, () => ({
            focus: (callbackFn, opts) => {
                textareaRef.current?.focus({ preventScroll: opts?.preventScroll })
                if (!hasSelectionRef.current) {
                    const offset = opts?.defaultSelection === 'rootEnd' ? latestMarkdownRef.current.length : 0
                    selectionStartRef.current = offset
                    selectionEndRef.current = offset
                    textareaRef.current?.setSelectionRange(offset, offset)
                    hasSelectionRef.current = true
                }
                callbackFn?.()
            },
            getMarkdown: () => plainTextMode
                ? escapeStubMarkdown(latestMarkdownRef.current)
                : latestMarkdownRef.current,
            getSelectionMarkdown: () => latestMarkdownRef.current.slice(
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
                emitStubChange(plainTextMode, onChange, nextMarkdown)
            },
            setMarkdown: (nextMarkdown: string) => {
                latestMarkdownRef.current = nextMarkdown
                setRenderedMarkdown(nextMarkdown)
            },
        }), [onChange, plainTextMode])

        useEffect(() => {
            for (const plugin of plugins) plugin.definition?.update?.(realm, plugin.params)
        })

        useEffect(() => {
            onChange?.(latestMarkdownRef.current)
        }, [onChange])

        useEffect(() => testLexicalEditor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                if (suppressSelectionMirrorRef.current) return
                const selection = $getSelection()
                if (!$isRangeSelection(selection)) return

                const points = selection.getStartEndPoints()
                if (!points || points[0].type !== 'text' || points[1].type !== 'text') return
                textareaRef.current?.setSelectionRange(points[0].offset, points[1].offset)
            })
        }), [])

        useEffect(() => {
            if (!plainTextMode) return

            return testLexicalEditor.registerUpdateListener(() => {
                const text = getTestLexicalText()
                latestMarkdownRef.current = text
                setRenderedMarkdown(text)
            })
        }, [plainTextMode])

        const prepareLexicalSelection = (start: number, end: number) => {
            suppressSelectionMirrorRef.current = true
            setTestLexicalMarkdownSelection(latestMarkdownRef.current, start, end)
            suppressSelectionMirrorRef.current = false
        }

        const handleTextareaRef = useCallback((textarea: HTMLTextAreaElement | null) => {
            textareaRef.current = textarea
            if (!textarea) return

            suppressSelectionMirrorRef.current = true
            setTestLexicalMarkdownSelection(initialMarkdown, 0, 0)
            suppressSelectionMirrorRef.current = false
        }, [initialMarkdown])

        const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
            latestMarkdownRef.current = event.target.value
            setRenderedMarkdown(event.target.value)
            emitStubChange(plainTextMode, onChange, event.target.value)
        }

        const updateSelection = (event: SyntheticEvent<HTMLTextAreaElement>) => {
            selectionStartRef.current = event.currentTarget.selectionStart
            selectionEndRef.current = event.currentTarget.selectionEnd
            hasSelectionRef.current = true
        }

        const handleCopy = (event: ClipboardEvent<HTMLTextAreaElement>) => {
            updateSelection(event)
            prepareLexicalSelection(selectionStartRef.current, selectionEndRef.current)
            testLexicalEditor.dispatchCommand(COPY_COMMAND, event.nativeEvent)
        }

        const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
            updateSelection(event)
            if (event.key.toLowerCase() === 'f') {
                prepareLexicalSelection(selectionStartRef.current, selectionEndRef.current)
            }
            testLexicalEditor.dispatchCommand(KEY_DOWN_COMMAND, event.nativeEvent)
        }

        const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
            updateSelection(event)
            const currentMarkdown = latestMarkdownRef.current
            suppressSelectionMirrorRef.current = true
            setTestLexicalSelection(currentMarkdown, selectionStartRef.current, selectionEndRef.current)
            suppressSelectionMirrorRef.current = false
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
                        ref={handleTextareaRef}
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
export const ListsToggle = () => <span data-testid="lists-toggle" />
export const BlockTypeSelect = () => <span data-testid="block-type-select" />
export const CreateLink = NoopControl
export const InsertImage = NoopControl
export const InsertTable = NoopControl
export const InsertThematicBreak = NoopControl
export const InsertCodeBlock = () => <span data-testid="insert-code-block" />
export const Separator = NoopControl
