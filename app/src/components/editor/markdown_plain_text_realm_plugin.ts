import { addComposerChild$, realmPlugin } from '@mdxeditor/editor'
import { markdownPlainTextConfig$, type MarkdownPlainTextConfig } from './markdown_plain_text_config_cell'
import { MarkdownPlainTextPlugin } from './markdown_plain_text_plugin'

/** Switches an MDXEditor realm to literal text exchange, bypassing Markdown serialization. */
export const markdownPlainTextPlugin = realmPlugin<MarkdownPlainTextConfig>({
    init(realm, params) {
        if (!params) throw new Error('Markdown plain text plugin requires parameters')

        realm.register(markdownPlainTextConfig$)
        realm.pub(markdownPlainTextConfig$, params)
        realm.pub(addComposerChild$, MarkdownPlainTextPlugin)
    },
    update(realm, params) {
        if (!params) throw new Error('Markdown plain text plugin requires parameters')

        realm.pub(markdownPlainTextConfig$, params)
    },
})
