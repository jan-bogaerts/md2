import { addImportVisitor$, realmPlugin } from '@mdxeditor/editor'
import { $createTextNode } from 'lexical'

/** Treats raw HTML-like Markdown nodes as text while MDX/HTML processing is disabled. */
export const plainMarkdownPlugin = realmPlugin({
    init(realm) {
        realm.pub(addImportVisitor$, {
            testNode: 'html',
            visitNode({ actions, mdastNode }) {
                if (mdastNode.type !== 'html') throw new Error('Plain Markdown HTML visitor received a non-HTML node')
                actions.addAndStepInto($createTextNode(mdastNode.value))
            },
        })
    },
})
