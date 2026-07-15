/* eslint-disable react-refresh/only-export-components -- test-only module, fast refresh does not apply */
import { forwardRef, useEffect, useImperativeHandle, useRef, type ChangeEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

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
    overlayContainer?: HTMLElement | null
    plugins?: StubPlugin[]
    readOnly?: boolean
}

interface StubPlugin {
    toolbarContents?: () => ReactNode
}

function normalizeMarkdown(markdown: string) {
    return markdown.trimEnd()
}

export const MDXEditor = forwardRef<{ getMarkdown: () => string; setMarkdown: (markdown: string) => void }, StubEditorProps>(
    function MDXEditorStub(props, ref) {
        const { className, markdown, onChange, overlayContainer, plugins = [], readOnly } = props
        const toolbar = plugins.find(({ toolbarContents }) => !!toolbarContents)
        const latestMarkdownRef = useRef(normalizeMarkdown(markdown))

        useImperativeHandle(ref, () => ({
            getMarkdown: () => latestMarkdownRef.current,
            setMarkdown: (nextMarkdown: string) => {
                latestMarkdownRef.current = nextMarkdown
            },
        }), [])

        useEffect(() => {
            latestMarkdownRef.current = normalizeMarkdown(markdown)
        }, [markdown])

        useEffect(() => {
            onChange?.(latestMarkdownRef.current)
        }, [onChange])

        const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
            latestMarkdownRef.current = event.target.value
            onChange?.(event.target.value)
        }

        return (
            <div className={className} data-testid="mdx-editor">
                {toolbar?.toolbarContents ? <div data-testid="mdx-editor-toolbar">{toolbar.toolbarContents()}</div> : null}
                {overlayContainer ? createPortal(<div data-testid="mdx-editor-overlay" />, overlayContainer) : null}
                <textarea onChange={handleChange} readOnly={readOnly} role="textbox" value={markdown} />
            </div>
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

interface StubCell<T> {
    value: T
}

export const Cell = <T,>(value: T): StubCell<T> => ({ value })
export const useCellValue = <T,>(cell: StubCell<T>) => cell.value
export const realmPlugin = <T,>(plugin: unknown) => {
    void plugin

    return (params?: T) => ({ params })
}
export const activeEditor$ = Cell(null)
export const addComposerChild$ = Cell(null)
export const markdown$ = Cell('')
export const rootEditor$ = Cell(null)
export const setMarkdown$ = Cell(null)

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
