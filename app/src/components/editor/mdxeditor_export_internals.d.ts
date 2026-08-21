import type { ExportMarkdownFromLexicalOptions } from '@mdxeditor/editor'
import type { NodeRef } from '@mdxeditor/gurx'

/**
 * `exportMarkdownFromLexical` and the two `toMarkdown*` cells are shipped by
 * `@mdxeditor/editor` at runtime but marked "Excluded from this release type"
 * in its published declarations. The selection serializer needs the real
 * export path, so the missing signatures are declared here.
 */
declare module '@mdxeditor/editor' {
    export function exportMarkdownFromLexical(options: ExportMarkdownFromLexicalOptions): string
    export const toMarkdownExtensions$: NodeRef<ExportMarkdownFromLexicalOptions['toMarkdownExtensions']>
    export const toMarkdownOptions$: NodeRef<ExportMarkdownFromLexicalOptions['toMarkdownOptions']>
}
