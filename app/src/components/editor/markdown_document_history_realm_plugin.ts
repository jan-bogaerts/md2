import { addComposerChild$, realmPlugin, rootEditor$ } from '@mdxeditor/editor'
import {
    markdownDocumentHistoryConfig$,
    markdownDocumentHistoryStore$,
    type MarkdownDocumentHistoryConfig,
} from './markdown_document_history_cell'
import { MarkdownDocumentHistoryPlugin } from './markdown_document_history_plugin'

/** Connects a document identity and its history store to an MDXEditor realm. */
export const markdownDocumentHistoryPlugin = realmPlugin<MarkdownDocumentHistoryConfig>({
    init(realm, params) {
        if (!params) throw new Error('Markdown document history plugin requires parameters')

        realm.register(markdownDocumentHistoryConfig$)
        realm.register(markdownDocumentHistoryStore$)
        realm.pub(markdownDocumentHistoryConfig$, params)
        realm.pub(markdownDocumentHistoryStore$, params.historyStore)
        realm.pub(addComposerChild$, MarkdownDocumentHistoryPlugin)
    },
    postInit(realm, params) {
        if (!params) throw new Error('Markdown document history plugin requires parameters')

        const editor = realm.getValue(rootEditor$)
        if (!editor) throw new Error('Cannot initialize Markdown document history without an editor')

        params.historyStore.attachEditor(editor, params.initialTarget, params.initialMarkdown)
    },
    update(realm, params) {
        if (!params) throw new Error('Markdown document history plugin requires parameters')

        realm.pub(markdownDocumentHistoryConfig$, params)
    },
})
