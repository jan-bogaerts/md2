import { addComposerChild$, realmPlugin } from '@mdxeditor/editor'
import type { ActionPlaceholder } from '../../data/action_placeholders'
import { markdownPlaceholderConfig$ } from './markdown_placeholder_config_cell'
import { MarkdownPlaceholderTypeaheadPlugin } from './markdown_placeholder_typeahead_plugin'

interface MarkdownPlaceholderPluginParams {
    overlayContainer?: HTMLElement | null
    placeholders: readonly ActionPlaceholder[]
}

/** Connects placeholder configuration and caret typeahead to an MDXEditor realm. */
export const markdownPlaceholderPlugin = realmPlugin<MarkdownPlaceholderPluginParams>({
    init(realm, params) {
        if (!params) throw new Error('Markdown placeholder plugin requires parameters')

        realm.register(markdownPlaceholderConfig$)
        realm.pub(markdownPlaceholderConfig$, params)
        realm.pub(addComposerChild$, MarkdownPlaceholderTypeaheadPlugin)
    },
    update(realm, params) {
        if (!params) throw new Error('Markdown placeholder plugin requires parameters')

        realm.pub(markdownPlaceholderConfig$, params)
    },
})
