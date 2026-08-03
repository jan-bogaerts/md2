import { addComposerChild$, realmPlugin } from '@mdxeditor/editor'
import { markdownFileSearchConfig$ } from './markdown_file_search_config_cell'
import { MarkdownFileSearchTypeaheadPlugin } from './markdown_file_search_typeahead_plugin'

interface MarkdownFileSearchPluginParams {
    overlayContainer?: HTMLElement | null
    repositoryFiles: readonly string[]
}

/** Connects repository-file configuration and caret typeahead to an MDXEditor realm. */
export const markdownFileSearchPlugin = realmPlugin<MarkdownFileSearchPluginParams>({
    init(realm, params) {
        if (!params) throw new Error('Markdown file-search plugin requires parameters')

        realm.register(markdownFileSearchConfig$)
        realm.pub(markdownFileSearchConfig$, params)
        realm.pub(addComposerChild$, MarkdownFileSearchTypeaheadPlugin)
    },
    update(realm, params) {
        if (!params) throw new Error('Markdown file-search plugin requires parameters')

        realm.pub(markdownFileSearchConfig$, params)
    },
})
