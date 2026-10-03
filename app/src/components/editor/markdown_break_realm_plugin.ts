import { addExportVisitor$, realmPlugin } from '@mdxeditor/editor';
import { $isLineBreakNode } from 'lexical';

/** Keeps explicit Markdown breaks distinct from soft newlines in text nodes. */
export const markdownBreakPlugin = realmPlugin({
    init(realm) {
        realm.pub(addExportVisitor$, {
            priority: 1,
            testLexicalNode: $isLineBreakNode,
            visitLexicalNode({ actions, mdastParent }) {
                actions.appendToParent(mdastParent, { type: 'break' });
            },
        });
    },
});
