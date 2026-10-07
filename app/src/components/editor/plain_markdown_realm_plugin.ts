import { addImportVisitor$, realmPlugin, type MdastImportVisitor } from '@mdxeditor/editor';
import type { Html, PhrasingContent } from 'mdast';
import { $createLineBreakNode, $isElementNode } from 'lexical';

const LITERAL_HTML_IMPORT_PRIORITY = 1;

const htmlImportVisitor: MdastImportVisitor<Html> = {
    // Override MDXEditor's default HTML image and formatting visitors too.
    priority: LITERAL_HTML_IMPORT_PRIORITY,
    testNode: 'html',
    visitNode({ mdastNode, mdastParent, lexicalParent, actions }) {
        const children: PhrasingContent[] = [];
        const lines = mdastNode.value.split('\n');
        for (const [index, line] of lines.entries()) {
            if (index > 0) children.push({ type: 'break' });
            children.push({ type: 'text', value: line });
        }
        const block = mdastParent?.type === 'root' || mdastParent?.type === 'blockquote' || mdastParent?.type === 'listItem';
        const index = mdastParent?.children.indexOf(mdastNode) ?? -1;
        const previousSibling = index > 0 ? mdastParent?.children[index - 1] : undefined;
        if (block && $isElementNode(lexicalParent) && lexicalParent.getType() === 'listitem' && previousSibling?.type === 'paragraph') {
            lexicalParent.append($createLineBreakNode(), $createLineBreakNode());
        }
        // Delegate paragraph placement to the same visitor used for ordinary Markdown, including list items.
        actions.visitChildren({ type: 'root', children: block ? [{ type: 'paragraph', children }] : children }, lexicalParent);
    },
};

/** Imports HTML as editable literal text while supported Markdown keeps its formatting. */
export const plainMarkdownPlugin = realmPlugin({
    init(realm) {
        realm.pub(addImportVisitor$, htmlImportVisitor);
    },
});
