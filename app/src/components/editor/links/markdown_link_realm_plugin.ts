import { addImportVisitor$, addLexicalNode$, realmPlugin, type MdastImportVisitor } from '@mdxeditor/editor';
import type { Link } from 'mdast';
import { $createMarkdownLinkNode, MarkdownLinkNode } from './markdown_link_node';

const markdownLinkImportVisitor: MdastImportVisitor<Link> = {
    priority: 1,
    testNode: 'link',
    visitNode({ actions, mdastNode }) {
        actions.addAndStepInto($createMarkdownLinkNode(mdastNode.url, { title: mdastNode.title ?? undefined }));
    },
};

/** Imports Markdown links with original URL available to click routing. */
export const markdownLinkPlugin = realmPlugin({
    init(realm) {
        realm.pubIn({
            [addImportVisitor$]: markdownLinkImportVisitor,
            [addLexicalNode$]: MarkdownLinkNode,
        });
    },
});
