import { addImportVisitor$, realmPlugin, UnrecognizedMarkdownConstructError } from '@mdxeditor/editor';

/** Routes unsupported raw HTML to Source instead of escaping it or creating an invalid root. */
export const plainMarkdownPlugin = realmPlugin({
    init(realm) {
        realm.pub(addImportVisitor$, {
            testNode: 'html',
            visitNode() {
                throw new UnrecognizedMarkdownConstructError('Rich text cannot display raw HTML. Its source is preserved');
            },
        })
    },
})
