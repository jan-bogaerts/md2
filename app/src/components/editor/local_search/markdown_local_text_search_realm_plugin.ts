import { addComposerChild$, realmPlugin } from '@mdxeditor/editor'
import {
    markdownLocalTextSearchConfig$,
    type MarkdownLocalTextSearchConfig,
} from './markdown_local_text_search_config_cell'
import { MarkdownLocalTextSearchPlugin } from './markdown_local_text_search_plugin'

/** Connects local visible-text search to an MDXEditor Lexical composer. */
export const markdownLocalTextSearchPlugin = realmPlugin<MarkdownLocalTextSearchConfig>({
    init(realm, params) {
        if (!params) throw new Error('Markdown local text-search plugin requires parameters')

        realm.register(markdownLocalTextSearchConfig$)
        realm.pub(markdownLocalTextSearchConfig$, params)
        realm.pub(addComposerChild$, MarkdownLocalTextSearchPlugin)
    },
    update(realm, params) {
        if (!params) throw new Error('Markdown local text-search plugin requires parameters')

        realm.pub(markdownLocalTextSearchConfig$, params)
    },
})
