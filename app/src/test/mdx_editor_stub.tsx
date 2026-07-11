/* eslint-disable react-refresh/only-export-components -- test-only module, fast refresh does not apply */
import { forwardRef, useImperativeHandle, type ChangeEvent, type ReactNode } from 'react'

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
    plugins?: StubPlugin[]
    readOnly?: boolean
}

interface StubPlugin {
    toolbarContents?: () => ReactNode
}

export const MDXEditor = forwardRef<{ setMarkdown: (markdown: string) => void }, StubEditorProps>(
    function MDXEditorStub(props, ref) {
        const { markdown, onChange, plugins = [], readOnly } = props
        const toolbar = plugins.find(({ toolbarContents }) => !!toolbarContents)

        useImperativeHandle(ref, () => ({ setMarkdown: () => {} }), [])

        const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
            onChange?.(event.target.value)
        }

        return (
            <div data-testid="mdx-editor">
                {toolbar?.toolbarContents ? <div data-testid="mdx-editor-toolbar">{toolbar.toolbarContents()}</div> : null}
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

/** Toolbar controls render nothing in the stub. */
const NoopControl = () => null

export const UndoRedo = NoopControl
export const BoldItalicUnderlineToggles = NoopControl
export const ListsToggle = NoopControl
export const BlockTypeSelect = NoopControl
export const CreateLink = NoopControl
export const InsertImage = NoopControl
export const InsertTable = NoopControl
export const InsertThematicBreak = NoopControl
export const InsertCodeBlock = NoopControl
export const Separator = NoopControl
