import { addComposerChild$, realmPlugin } from '@mdxeditor/editor'
import { markdownPasteConfig$, type MarkdownPasteConfig } from './markdown_paste_cell'
import { MarkdownPastePlugin } from './markdown_paste_plugin'

/** Connects Markdown-aware clipboard handling to MDXEditor's Lexical editor. */
export const markdownPastePlugin = realmPlugin<MarkdownPasteConfig>({
    init(realm, params) {
        if (!params) throw new Error('Markdown paste plugin requires parameters')

        realm.register(markdownPasteConfig$)
        realm.pub(markdownPasteConfig$, params)
        realm.pub(addComposerChild$, MarkdownPastePlugin)
    },
    update(realm, params) {
        if (!params) throw new Error('Markdown paste plugin requires parameters')

        realm.pub(markdownPasteConfig$, params)
    },
})
