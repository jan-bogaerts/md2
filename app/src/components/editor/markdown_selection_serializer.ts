import { $generateJSONFromSelectedNodes, $generateNodesFromSerializedNodes } from '@lexical/clipboard'
import { exportMarkdownFromLexical, type ExportMarkdownFromLexicalOptions } from '@mdxeditor/editor'
import {
    $createParagraphNode,
    $getRoot,
    $getSelection,
    $isElementNode,
    $isRangeSelection,
    createEditor,
    type Klass,
    type LexicalEditor,
    type LexicalNode,
} from 'lexical'

/**
 * Everything the MDXEditor export path needs, read from the realm by the
 * caller. Passing it in keeps the serializer independent of the realm.
 */
export interface MarkdownExportConfig {
    jsxComponentDescriptors: ExportMarkdownFromLexicalOptions['jsxComponentDescriptors']
    jsxIsAvailable: boolean
    nodes: Klass<LexicalNode>[]
    toMarkdownExtensions: ExportMarkdownFromLexicalOptions['toMarkdownExtensions']
    toMarkdownOptions: ExportMarkdownFromLexicalOptions['toMarkdownOptions']
    visitors: ExportMarkdownFromLexicalOptions['visitors']
}

/**
 * Appends a rehydrated selection to the scratch root. When the selection stays
 * inside one block, the clipboard helper hoists that block's inline children to
 * the top level; the root only accepts blocks, so consecutive inline nodes are
 * gathered back into a single paragraph rather than one paragraph each.
 */
function $appendSelectedNodes(nodes: LexicalNode[]) {
    const root = $getRoot().clear()
    let inlineParagraph: ReturnType<typeof $createParagraphNode> | null = null

    for (const node of nodes) {
        if ($isElementNode(node) && !node.isInline()) {
            inlineParagraph = null
            root.append(node)
            continue
        }
        if (!inlineParagraph) {
            inlineParagraph = $createParagraphNode()
            root.append(inlineParagraph)
        }
        inlineParagraph.append(node)
    }
}

/**
 * Serializes the current selection as Markdown. Must run inside an editor
 * state read. Returns an empty string when nothing is selected.
 *
 * `$generateJSONFromSelectedNodes` splits the boundary text nodes at the
 * selection offsets, so a partial selection stays partial instead of widening
 * to the block that contains it. The trimmed tree is then rehydrated into a
 * scratch editor and serialized through the registered export visitors, which
 * is what keeps code blocks, images and tables identical to how the document
 * is written to file.
 */
export function $selectionMarkdown(editor: LexicalEditor, config: MarkdownExportConfig) {
    const selection = $getSelection()
    if (!$isRangeSelection(selection) || selection.isCollapsed()) return ''

    const { nodes: serializedNodes } = $generateJSONFromSelectedNodes(editor, selection)
    if (serializedNodes.length === 0) return ''

    const scratchEditor = createEditor({ nodes: config.nodes, onError: (error) => { throw error } })
    let markdown = ''
    scratchEditor.update(() => {
        $appendSelectedNodes($generateNodesFromSerializedNodes(serializedNodes))
    }, { discrete: true })
    scratchEditor.getEditorState().read(() => {
        markdown = exportMarkdownFromLexical({
            jsxComponentDescriptors: config.jsxComponentDescriptors,
            jsxIsAvailable: config.jsxIsAvailable,
            root: $getRoot(),
            toMarkdownExtensions: config.toMarkdownExtensions,
            toMarkdownOptions: config.toMarkdownOptions,
            visitors: config.visitors,
        })
    })

    return markdown.replace(/\n$/, '')
}

/**
 * The rendered text of the current selection, without Markdown syntax. Must
 * run inside an editor state read. Returns an empty string when nothing is
 * selected, so callers can fall back to the DOM selection.
 */
export function $selectionPlainText() {
    const selection = $getSelection()
    if (!$isRangeSelection(selection) || selection.isCollapsed()) return ''

    return selection.getTextContent()
}
